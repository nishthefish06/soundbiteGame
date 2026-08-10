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

function semitoneToFreq(semitone) {
  return C4_FREQ * 2 ** (semitone / 12);
}

// Soft (tanh) saturation curve for a WaveShaperNode — adds harmonic grit to
// an otherwise-pure sine, which is most of what makes a synth sine read as
// "808" rather than just "sine wave." Cached per drive amount since it's
// recomputed on every bass hit otherwise.
const saturationCurveCache = new Map();
function getSaturationCurve(amount) {
  if (saturationCurveCache.has(amount)) return saturationCurveCache.get(amount);
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  saturationCurveCache.set(amount, curve);
  return curve;
}

const STEPS_PER_LOOP = 32;
export { STEPS_PER_LOOP };

// A few selectable timbres, each tagged with which track(s) it makes sense
// on — melody wants lead/pad-ish tones, bass wants low/sub-register ones,
// so the two tracks get their own option lists rather than one shared list
// where half the choices don't make sense for that track. sustainGain is
// the note's held level; attack/release shape how fast it gets there and
// fades. Non-PIANO entries are plain oscillators; PIANO is sample-based
// (see below). The bass entries additionally use pitchDrop (a classic
// 808's pitched "thump" at the start of the note, gliding down into the
// sub) and/or a touch of waveshaper saturation for grit — see playGridNote
// for how those get applied.
export const INSTRUMENTS = {
  PLUCK: { label: 'Pluck', kind: 'synth', type: 'triangle', attack: 0.008, sustainGain: 0.35, release: 0.15, tracks: ['melody'] },
  LEAD: { label: 'Synth Lead', kind: 'synth', type: 'sawtooth', attack: 0.015, sustainGain: 0.22, release: 0.1, tracks: ['melody'] },
  PAD: { label: 'Soft Pad', kind: 'synth', type: 'sine', attack: 0.09, sustainGain: 0.32, release: 0.35, tracks: ['melody'] },
  CHIPTUNE: { label: 'Chiptune', kind: 'synth', type: 'square', attack: 0.004, sustainGain: 0.16, release: 0.06, tracks: ['melody'] },
  PIANO: { label: 'Grand Piano', kind: 'sample', attack: 0.004, sustainGain: 0.9, release: 0.4, tracks: ['melody'] },
  SUB808: {
    label: '808 Bass',
    kind: 'synth',
    type: 'sine',
    attack: 0.008,
    sustainGain: 0.6,
    release: 0.3,
    pitchDrop: { fromRatio: 1.9, timeSec: 0.07 },
    drive: 6,
    tracks: ['bass'],
  },
  SUB_SINE: { label: 'Sub Sine', kind: 'synth', type: 'sine', attack: 0.02, sustainGain: 0.5, release: 0.4, tracks: ['bass'] },
  BASS_PLUCK: { label: 'Bass Pluck', kind: 'synth', type: 'triangle', attack: 0.005, sustainGain: 0.45, release: 0.12, drive: 2, tracks: ['bass'] },
};
export const DEFAULT_INSTRUMENT = 'PLUCK';
export const DEFAULT_BASS_INSTRUMENT = 'SUB808';

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

  // Builds the sound source for a note (sample playback or an oscillator,
  // with the 808-style pitch-drop applied if the instrument has one) —
  // shared between grid notes (fixed duration) and live-piano notes (held
  // until released), which otherwise differ only in how the envelope ends.
  function createVoiceOscillator(semitone, instrument, time) {
    if (instrument.kind === 'sample') {
      const anchorNote = nearestPianoAnchor(semitone);
      const buffer = pianoBuffers.get(anchorNote);
      if (!buffer) return null; // samples not loaded yet — silently skip this note
      const osc = ctx.createBufferSource();
      osc.buffer = buffer;
      osc.playbackRate.value = 2 ** ((semitone - PIANO_SAMPLE_ANCHOR_SEMITONES[anchorNote]) / 12);
      return osc;
    }
    const osc = ctx.createOscillator();
    osc.type = instrument.type;
    const targetFreq = semitoneToFreq(semitone);
    if (instrument.pitchDrop) {
      // The classic 808 "thump": starts pitched up, glides down into the
      // sub within the first ~70ms — that transient is most of what makes
      // it read as a struck bass note rather than a held tone.
      osc.frequency.setValueAtTime(targetFreq * instrument.pitchDrop.fromRatio, time);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, time + instrument.pitchDrop.timeSec);
    } else {
      osc.frequency.value = targetFreq;
    }
    return osc;
  }

  // Routes a voice through the instrument's saturation (if it has one) on
  // its way to `destination`.
  function connectVoice(osc, instrument, destination) {
    if (!instrument.drive) {
      osc.connect(destination);
      return;
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = getSaturationCurve(instrument.drive);
    shaper.oversample = '2x';
    osc.connect(shaper);
    shaper.connect(destination);
  }

  function playGridNote(semitone, instrumentId, time, duration) {
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS[DEFAULT_INSTRUMENT];
    const osc = createVoiceOscillator(semitone, instrument, time);
    if (!osc) return;

    const env = ctx.createGain();
    const releaseStart = time + Math.max(duration - instrument.release, instrument.attack + 0.01);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(instrument.sustainGain, time + instrument.attack);
    env.gain.setValueAtTime(instrument.sustainGain, releaseStart);
    env.gain.exponentialRampToValueAtTime(0.0001, releaseStart + instrument.release);

    connectVoice(osc, instrument, env);
    env.connect(masterGain);
    osc.start(time);
    osc.stop(releaseStart + instrument.release + 0.02);
  }

  // Held notes for the live-piano keyboard — keyed by an arbitrary
  // caller-chosen id (e.g. the key's label) so noteOn/noteOff pairs match
  // up even if the instrument changes mid-hold.
  const activeVoices = new Map();

  function startLiveVoice(id, semitone, instrumentId) {
    if (activeVoices.has(id)) return;
    const instrument = INSTRUMENTS[instrumentId] || INSTRUMENTS[DEFAULT_INSTRUMENT];
    const time = ctx.currentTime;
    const osc = createVoiceOscillator(semitone, instrument, time);
    if (!osc) return;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(instrument.sustainGain, time + instrument.attack);

    connectVoice(osc, instrument, env);
    env.connect(masterGain);
    osc.start(time);

    activeVoices.set(id, { osc, env, instrument, startTime: time });
  }

  function stopLiveVoice(id) {
    const voice = activeVoices.get(id);
    if (!voice) return;
    activeVoices.delete(id);
    const { osc, env, instrument, startTime } = voice;
    const releaseFrom = Math.max(ctx.currentTime, startTime + 0.02);
    env.gain.cancelScheduledValues(releaseFrom);
    env.gain.setValueAtTime(env.gain.value, releaseFrom);
    env.gain.exponentialRampToValueAtTime(0.0001, releaseFrom + instrument.release);
    osc.stop(releaseFrom + instrument.release + 0.05);
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

  function playTom(time) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.18);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.7, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(env);
    env.connect(masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
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

  function playOpenHat(time) {
    playNoiseHit(time, { freqHigh: 6000, type: 'highpass', gain: 0.18, decay: 0.3 });
  }

  function playRim(time) {
    playNoiseHit(time, { freqLow: 3200, type: 'bandpass', gain: 0.3, decay: 0.04 });
  }

  // A real clap is a few quick, slightly-offset noise bursts rather than
  // one hit — layering 3 close together (each a hair quieter and later)
  // reads as a clap instead of just a second snare.
  function playClap(time) {
    [0, 0.012, 0.024].forEach((offset, i) => {
      playNoiseHit(time + offset, { freqLow: 1200, type: 'bandpass', gain: 0.4 - i * 0.08, decay: 0.13 });
    });
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

  // Maps each drum row id (see DRUM_ROWS in ComposerPrototype.jsx) to the
  // function that plays it — keeps scheduleStep from needing a hand-written
  // if-statement per drum sound.
  const drumSounds = { kick: playKick, snare: playSnare, hihat: playHihat, openhat: playOpenHat, clap: playClap, tom: playTom, rim: playRim };

  function scheduleStep(step, time) {
    const drumPattern = getDrumPatternFn?.();
    if (drumPattern) {
      Object.entries(drumSounds).forEach(([id, play]) => {
        if (drumPattern[id]?.[step]) play(time);
      });
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

    // Live-piano keyboard: starts/stops a held note. `id` is caller-chosen
    // (e.g. the key's label) so a noteOff always matches its noteOn.
    noteOn(id, semitone, instrumentId) {
      ensureContext();
      ctx.resume?.();
      startLiveVoice(id, semitone, instrumentId);
    },

    noteOff(id) {
      if (!ctx) return;
      stopLiveVoice(id);
    },

    stopAllNotes() {
      if (!ctx) return;
      Array.from(activeVoices.keys()).forEach(stopLiveVoice);
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
