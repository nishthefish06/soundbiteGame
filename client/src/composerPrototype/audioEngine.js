// Throwaway prototype engine for the "recreate a song with virtual
// instruments" game mode idea. DAW-style: melody, bass, and drums are all
// placed on the same 32-step grid (a simple piano roll) rather than
// performed live — easier for a non-musician than real-time playing, and it
// removes the "can't reach far notes in time" problem a live keyboard has.
// Plain Web Audio, same synthesis approach as client/src/dsp/effectChains.js
// and client/src/sfx.js elsewhere in this repo — no libraries, nothing wired
// to the real game.

const C4_FREQ = 261.63;

const BLACK_KEY_SEMITONES_IN_OCTAVE = new Set([1, 3, 6, 8, 10]);
const MAJOR_SCALE_OFFSETS_IN_OCTAVE = new Set([0, 2, 4, 5, 7, 9, 11]);

// Builds a chromatic range [low..high] (inclusive, semitones from C4) plus
// its black/white pattern — used for both the melody and bass tracks, just
// with different low/high bounds, rather than hand-typing each range.
function buildChromaticRange(low, high) {
  const steps = [];
  const isBlack = [];
  for (let semitone = low; semitone <= high; semitone += 1) {
    steps.push(semitone);
    isBlack.push(BLACK_KEY_SEMITONES_IN_OCTAVE.has(((semitone % 12) + 12) % 12));
  }
  return { steps, isBlack };
}

// Same range, filtered down to major-scale degrees only — used when
// "snap to key" is on, so every row already harmonizes with itself.
function buildScaleRange(low, high) {
  const steps = [];
  for (let semitone = low; semitone <= high; semitone += 1) {
    if (MAJOR_SCALE_OFFSETS_IN_OCTAVE.has(((semitone % 12) + 12) % 12)) steps.push(semitone);
  }
  return steps;
}

// Melody: 2 octaves centered on C4 (C3-C5). Bass: 2 octaves below that
// (C1-C3) — a distinct, lower default register, since it's a separate track
// now rather than just "the keyboard shifted down."
export const MELODY_CHROMATIC = buildChromaticRange(-12, 12);
export const MELODY_SCALE_STEPS = buildScaleRange(-12, 12);
export const BASS_CHROMATIC = buildChromaticRange(-36, -12);
export const BASS_SCALE_STEPS = buildScaleRange(-36, -12);

// A few diatonic C-major triads for the chord palette — deliberately just
// these 4 (the classic "four chord song" pop progression), voiced to sit
// within the melody track's default range. Each is guaranteed to land on
// real rows in both chromatic and scale-snapped mode, since all 3 notes of
// each chord are themselves major-scale degrees.
export const CHORD_PALETTE = [
  { label: 'C', semitones: [0, 4, 7] },
  { label: 'F', semitones: [-7, -3, 0] },
  { label: 'G', semitones: [-5, -1, 2] },
  { label: 'Am', semitones: [-3, 0, 4] },
];

function semitoneToFreq(semitone) {
  return C4_FREQ * 2 ** (semitone / 12);
}

const STEPS_PER_LOOP = 32;
export { STEPS_PER_LOOP };

// A few selectable timbres. sustainGain is the note's held level;
// attack/release shape how fast it gets there and fades. The first four are
// plain oscillators; PIANO is sample-based (see below).
export const INSTRUMENTS = {
  PLUCK: { label: 'Pluck', kind: 'synth', type: 'triangle', attack: 0.008, sustainGain: 0.35, release: 0.15 },
  LEAD: { label: 'Synth Lead', kind: 'synth', type: 'sawtooth', attack: 0.015, sustainGain: 0.22, release: 0.1 },
  PAD: { label: 'Soft Pad', kind: 'synth', type: 'sine', attack: 0.09, sustainGain: 0.32, release: 0.35 },
  CHIPTUNE: { label: 'Chiptune', kind: 'synth', type: 'square', attack: 0.004, sustainGain: 0.16, release: 0.06 },
  PIANO: { label: 'Grand Piano', kind: 'sample', attack: 0.004, sustainGain: 0.9, release: 0.4 },
};
export const DEFAULT_INSTRUMENT = 'PLUCK';

// Piano samples: Salamander Grand Piano by Alexander Holm (CC BY 3.0),
// https://archive.org/details/SalamanderGrandPianoV3 — 4 recorded notes
// (C3/C4/C5/C6) rather than all 88; every other note is pitch-shifted from
// the nearest one via playbackRate, the same trick effectChains.js uses for
// voice modifiers. Trades a little timbre accuracy for 4 files instead of 88.
const PIANO_SAMPLE_ANCHOR_SEMITONES = { C3: -12, C4: 0, C5: 12, C6: 24 };
const PIANO_SAMPLE_URLS = {
  C3: '/piano-samples/C3.mp3',
  C4: '/piano-samples/C4.mp3',
  C5: '/piano-samples/C5.mp3',
  C6: '/piano-samples/C6.mp3',
};

function nearestPianoAnchor(semitone) {
  let best = null;
  let bestDist = Infinity;
  for (const [note, offset] of Object.entries(PIANO_SAMPLE_ANCHOR_SEMITONES)) {
    const dist = Math.abs(semitone - offset);
    if (dist < bestDist) {
      bestDist = dist;
      best = note;
    }
  }
  return best;
}

export function createComposerEngine() {
  let ctx = null;
  let masterGain = null;
  let noiseBuffer = null;

  let mediaDest = null;
  let recorder = null;
  let recordedChunks = [];

  let bpm = 100;
  let loopTimerId = null;
  let currentStep = 0;
  let nextStepTime = 0;
  let onStepCallback = null;
  let getDrumPatternFn = null;
  let getTracksFn = null;

  const pianoBuffers = new Map();
  let pianoLoadPromise = null;

  function ensureContext() {
    if (ctx) return ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(ctx.destination);

    // Pre-render a couple seconds of white noise once, reused (re-sliced)
    // for every snare/hihat hit rather than regenerated per hit.
    const length = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function stepDurationSec() {
    return 60 / bpm / 4; // 16th note
  }

  // Plays one grid-placed note: attack ramp, hold, release — sized to fit
  // within `duration` (a note's length in steps × one step's duration)
  // rather than needing an explicit note-off. `osc` is either an
  // OscillatorNode or an AudioBufferSourceNode; both expose .stop(time), so
  // the rest of the function doesn't care which.
  function playGridNote(semitone, instrumentId, time, duration) {
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS[DEFAULT_INSTRUMENT];

    let osc;
    if (instrument.kind === 'sample') {
      const anchorNote = nearestPianoAnchor(semitone);
      const buffer = pianoBuffers.get(anchorNote);
      if (!buffer) return; // samples not loaded yet — silently skip this note
      osc = ctx.createBufferSource();
      osc.buffer = buffer;
      osc.playbackRate.value = 2 ** ((semitone - PIANO_SAMPLE_ANCHOR_SEMITONES[anchorNote]) / 12);
    } else {
      osc = ctx.createOscillator();
      osc.type = instrument.type;
      osc.frequency.value = semitoneToFreq(semitone);
    }

    const env = ctx.createGain();
    const releaseStart = time + Math.max(duration - instrument.release, instrument.attack + 0.01);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(instrument.sustainGain, time + instrument.attack);
    env.gain.setValueAtTime(instrument.sustainGain, releaseStart);
    env.gain.exponentialRampToValueAtTime(0.0001, releaseStart + instrument.release);

    osc.connect(env);
    env.connect(masterGain);
    osc.start(time);
    osc.stop(releaseStart + instrument.release + 0.02);
  }

  function loadPianoSamples() {
    if (pianoLoadPromise) return pianoLoadPromise;
    ensureContext();
    pianoLoadPromise = Promise.all(
      Object.entries(PIANO_SAMPLE_URLS).map(async ([note, url]) => {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        pianoBuffers.set(note, audioBuffer);
      }),
    );
    return pianoLoadPromise;
  }

  function playKick(time) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.15);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.9, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(env);
    env.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function playNoiseHit(time, { freqLow, freqHigh, type, gain, decay }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    if (freqLow) filter.frequency.value = freqLow;
    if (freqHigh) filter.frequency.value = freqHigh;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);

    src.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    src.start(time);
    src.stop(time + decay + 0.02);
  }

  function playSnare(time) {
    playNoiseHit(time, { freqLow: 1800, type: 'bandpass', gain: 0.5, decay: 0.15 });
  }

  function playHihat(time) {
    playNoiseHit(time, { freqHigh: 7000, type: 'highpass', gain: 0.2, decay: 0.06 });
  }

  // A track's rows are [{ semitone, notes: [{start, length}] }]. A note
  // sounds only on the step it starts at, held for `length` steps.
  function scheduleTrackStep(track, step, time, duration) {
    if (!track) return;
    track.rows.forEach(({ semitone, notes }) => {
      const note = notes.find((n) => n.start === step);
      if (note) playGridNote(semitone, track.instrumentId, time, note.length * duration);
    });
  }

  function scheduleStep(step, time) {
    const drumPattern = getDrumPatternFn?.();
    if (drumPattern) {
      if (drumPattern.kick[step]) playKick(time);
      if (drumPattern.snare[step]) playSnare(time);
      if (drumPattern.hihat[step]) playHihat(time);
    }

    const tracks = getTracksFn?.();
    if (tracks) {
      const duration = stepDurationSec();
      scheduleTrackStep(tracks.melody, step, time, duration);
      scheduleTrackStep(tracks.bass, step, time, duration);
    }

    onStepCallback?.(step);
  }

  const SCHEDULE_AHEAD_SEC = 0.1;
  const LOOKAHEAD_MS = 25;

  function schedulerTick() {
    while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      scheduleStep(currentStep, nextStepTime);
      nextStepTime += stepDurationSec();
      currentStep = (currentStep + 1) % STEPS_PER_LOOP;
    }
    loopTimerId = setTimeout(schedulerTick, LOOKAHEAD_MS);
  }

  return {
    setBpm(v) { bpm = v; },

    // Kicks off fetching + decoding the piano samples; safe to call multiple
    // times (returns the same in-flight/resolved promise). Call this early
    // (e.g. on mount) so samples are ready by the time Piano gets selected.
    loadPiano() {
      ensureContext();
      return loadPianoSamples();
    },

    // getDrumPattern/getTracks are called on every scheduled step so grid
    // edits made mid-loop take effect immediately, without restarting it.
    // getTracks() should return { melody: {instrumentId, rows}, bass: {...} }.
    startLoop(onStep, getDrumPattern, getTracks) {
      ensureContext();
      ctx.resume?.();
      onStepCallback = onStep ?? null;
      getDrumPatternFn = getDrumPattern ?? null;
      getTracksFn = getTracks ?? null;
      currentStep = 0;
      nextStepTime = ctx.currentTime + 0.05;
      schedulerTick();
    },

    stopLoop() {
      if (loopTimerId) clearTimeout(loopTimerId);
      loopTimerId = null;
      onStepCallback = null;
      getDrumPatternFn = null;
      getTracksFn = null;
    },

    // Quick one-shot preview of a pitch — e.g. clicking a piano-roll row
    // label to hear what it sounds like before placing notes on it.
    previewNote(semitone, instrumentId) {
      ensureContext();
      ctx.resume?.();
      playGridNote(semitone, instrumentId, ctx.currentTime, 0.35);
    },

    startRecording() {
      ensureContext();
      mediaDest = ctx.createMediaStreamDestination();
      masterGain.connect(mediaDest);
      recordedChunks = [];
      recorder = new MediaRecorder(mediaDest.stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      recorder.start();
    },

    stopRecording() {
      return new Promise((resolve) => {
        if (!recorder) {
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          masterGain.disconnect(mediaDest);
          const blob = new Blob(recordedChunks, { type: 'audio/webm' });
          recorder = null;
          resolve(blob);
        };
        recorder.stop();
      });
    },
  };
}
