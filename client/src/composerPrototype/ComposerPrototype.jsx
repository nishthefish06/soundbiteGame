import { useEffect, useRef, useState } from 'react';
import {
  createComposerEngine,
  MELODY_CHROMATIC,
  MELODY_SCALE_STEPS,
  BASS_CHROMATIC,
  BASS_SCALE_STEPS,
  CHORD_PALETTE,
  STEPS_PER_LOOP,
  INSTRUMENTS,
  DEFAULT_INSTRUMENT,
} from './audioEngine.js';
import { SONGS } from './songs.js';

const NOTE_NAME_CYCLE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(semitone) {
  const name = NOTE_NAME_CYCLE[((semitone % 12) + 12) % 12];
  // Label the C's with an octave number (matches the piano sample anchor
  // names) so it's easy to tell how far a row is from the middle of the
  // range without counting rows.
  return semitone % 12 === 0 ? `${name}${4 + semitone / 12}` : name;
}

// Both tracks' scale-snapped ranges span exactly 2 octaves (15 degrees), so
// one label set works for either — it's positional (1st degree, 2nd
// degree...), not tied to an absolute pitch.
const SCALE_DEGREE_LABELS = ['1', '2', '3', '4', '5', '6', '7', '1', '2', '3', '4', '5', '6', '7', '8'];

const DRUM_ROWS = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hihat', label: 'Hi-hat' },
];

const INSTRUMENT_OPTIONS = Object.entries(INSTRUMENTS).map(([id, def]) => ({ id, label: def.label }));

// How many steps a stamped chord spans, and how many insertion slots that
// divides the 32-step grid into (8 slots of 4 steps each).
const CHORD_LENGTH = 4;
const CHORD_SLOT_COUNT = STEPS_PER_LOOP / CHORD_LENGTH;

// --- Note-grid helpers (pattern rows are [{ start, length }, ...]) --------

function noteAt(notes, step) {
  return notes.find((n) => step >= n.start && step < n.start + n.length);
}

function withoutOverlapping(notes, start, length) {
  const end = start + length;
  return notes.filter((n) => n.start + n.length <= start || n.start >= end);
}

function placeNote(notes, start, length) {
  return [...withoutOverlapping(notes, start, length), { start, length: Math.max(1, length) }];
}

function removeNoteAt(notes, step) {
  const hit = noteAt(notes, step);
  return hit ? notes.filter((n) => n !== hit) : notes;
}

// Finds the first `length`-wide slot, aligned to `length`, where none of the
// given rows already have a note — used to auto-place a chord without
// stomping whatever's already there.
function findFreeSlot(pattern, rowIndices, length) {
  for (let start = 0; start + length <= STEPS_PER_LOOP; start += length) {
    const free = rowIndices.every((rowIndex) => {
      const notes = pattern[rowIndex] || [];
      return !notes.some((n) => n.start < start + length && n.start + n.length > start);
    });
    if (free) return start;
  }
  return 0; // grid full — fall back to overwriting the start
}

// --- Chord-name parsing ("C F G Am" -> semitone triads) -------------------

const CHORD_ROOT_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Parses a plain chord symbol (root + optional #/b + optional "m" for
// minor) into a [root, third, fifth] triad, voiced in whichever octave
// keeps the root closest to C4 — matches how CHORD_PALETTE's hand-picked
// chords are voiced. Doesn't handle 7ths/dim/aug/slash chords; good enough
// for "type the chords from a lyrics-and-chords page" without becoming a
// full music-notation parser.
function parseChordToken(token) {
  const match = /^([A-Ga-g])([#b]?)(m|min)?$/.exec(token.trim());
  if (!match) return null;
  const [, letter, accidental, minorFlag] = match;
  let root = CHORD_ROOT_SEMITONES[letter.toUpperCase()];
  if (accidental === '#') root += 1;
  if (accidental === 'b') root -= 1;
  while (root > 6) root -= 12;
  while (root < -6) root += 12;
  const third = minorFlag ? root + 3 : root + 4;
  return [root, third, root + 7];
}

// Deals 3 distinct random songs — mirrors MicDrop's existing
// PROMPT_OPTIONS_COUNT=3 prompt-selection pattern (client/src/gameConstants.js).
function drawSongOptions() {
  const pool = [...SONGS];
  const picks = [];
  for (let i = 0; i < 3 && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
}

function emptyDrumPattern() {
  return {
    kick: Array(STEPS_PER_LOOP).fill(false),
    snare: Array(STEPS_PER_LOOP).fill(false),
    hihat: Array(STEPS_PER_LOOP).fill(false),
  };
}

const RECORD_LIMIT_MS = 45_000;

// One piano-roll track (used for both Melody and Bass). Click a cell to
// place a 1-step note; press-drag across cells to make it longer; click an
// existing note to remove it. Drag state lives in this component so melody
// and bass each track their own gesture independently.
function PianoRoll({
  title,
  chromaticRange,
  scaleSteps,
  keyMode,
  onKeyModeChange,
  instrument,
  onInstrumentChange,
  pianoStatus,
  pattern,
  onChangeRow,
  activeStep,
  onPreview,
  chordPalette,
  onStampChord,
  onStampProgression,
  chordInsertStep,
  onChordInsertStepChange,
}) {
  const stepsList = keyMode === 'scale' ? scaleSteps : chromaticRange.steps;
  const dragRef = useRef(null);
  const [dragPreview, setDragPreview] = useState(null); // { rowIndex, start, length }
  const [chordText, setChordText] = useState('');
  const [chordError, setChordError] = useState(null);

  function handleProgressionSubmit(e) {
    e.preventDefault();
    const failed = onStampProgression(chordText);
    if (failed && failed.length > 0) {
      setChordError(`Didn't recognize: ${failed.join(', ')}`);
    } else {
      setChordError(null);
      setChordText('');
    }
  }

  useEffect(() => {
    function finishDrag() {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const start = Math.min(drag.anchor, drag.current);
      const length = Math.abs(drag.current - drag.anchor) + 1;
      const existing = pattern[drag.rowIndex] || [];
      onChangeRow(drag.rowIndex, placeNote(existing, start, length));
      setDragPreview(null);
    }
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [pattern, onChangeRow]);

  function handlePointerDownCell(e, rowIndex, step) {
    const existing = pattern[rowIndex] || [];
    if (noteAt(existing, step)) {
      onChangeRow(rowIndex, removeNoteAt(existing, step));
      return;
    }
    // Buttons implicitly capture the pointer on pointerdown in some browsers,
    // which would stop onPointerEnter firing on the cells dragged over —
    // release it so the drag can track across siblings. Defensive try/catch:
    // releasePointerCapture can throw for a pointerId the browser doesn't
    // consider active, which shouldn't happen for a real gesture but isn't
    // worth crashing the handler over if it does.
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    dragRef.current = { rowIndex, anchor: step, current: step };
    setDragPreview({ rowIndex, start: step, length: 1 });
  }

  function handlePointerEnterCell(rowIndex, step) {
    const drag = dragRef.current;
    if (!drag || drag.rowIndex !== rowIndex) return;
    drag.current = step;
    const start = Math.min(drag.anchor, drag.current);
    const length = Math.abs(drag.current - drag.anchor) + 1;
    setDragPreview({ rowIndex, start, length });
  }

  const rows = stepsList
    .map((semitone, i) => ({ semitone, index: i }))
    .slice()
    .reverse(); // highest pitch at the top, like a real piano roll

  return (
    <>
      <h3 className="track-label">{title}</h3>
      <div className="row">
        <div className="segmented">
          <button className={keyMode === 'chromatic' ? 'active' : ''} onClick={() => onKeyModeChange('chromatic')}>
            Chromatic (raw)
          </button>
          <button className={keyMode === 'scale' ? 'active' : ''} onClick={() => onKeyModeChange('scale')}>
            Snapped to key (easy)
          </button>
        </div>
      </div>
      <div className="row">
        <div className="segmented">
          {INSTRUMENT_OPTIONS.map((opt) => (
            <button key={opt.id} className={instrument === opt.id ? 'active' : ''} onClick={() => onInstrumentChange(opt.id)}>
              {opt.label}
              {opt.id === 'PIANO' && pianoStatus !== 'ready' ? ` (${pianoStatus === 'error' ? 'unavailable' : 'loading…'})` : ''}
            </button>
          ))}
        </div>
      </div>
      {chordPalette && (
        <>
          <div className="row">
            <span className="muted chord-label">Insert at:</span>
            <div className="segmented insert-slots">
              <button className={chordInsertStep === null ? 'active' : ''} onClick={() => onChordInsertStepChange(null)}>
                Auto
              </button>
              {Array.from({ length: CHORD_SLOT_COUNT }).map((_, i) => (
                <button
                  key={i}
                  className={chordInsertStep === i * CHORD_LENGTH ? 'active' : ''}
                  onClick={() => onChordInsertStepChange(i * CHORD_LENGTH)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="muted chord-label">Chords:</span>
            <div className="segmented">
              {chordPalette.map((chord) => (
                <button key={chord.label} onClick={() => onStampChord(chord.semitones)}>
                  {chord.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {onStampProgression && (
        <div className="row">
          <form className="chord-form" onSubmit={handleProgressionSubmit}>
            <input
              className="chord-input"
              type="text"
              placeholder="Type chords, e.g. C F G Am"
              value={chordText}
              onChange={(e) => setChordText(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!chordText.trim()}>
              Add
            </button>
          </form>
          {chordError && <span className="chord-error">{chordError}</span>}
        </div>
      )}
      <p className="muted">Tap a label to preview a pitch. Tap a cell to place a note, drag to make it longer, tap it again to remove.</p>
      <div className="piano-roll">
        {rows.map(({ semitone, index }) => {
          const notes = pattern[index] || [];
          const preview = dragPreview && dragPreview.rowIndex === index ? dragPreview : null;
          const isBlack = keyMode === 'chromatic' && chromaticRange.isBlack[index];
          return (
            <div className={`piano-roll-row ${isBlack ? 'piano-roll-row-black' : ''}`} key={index}>
              <button className="piano-roll-label" onClick={() => onPreview(semitone)}>
                {keyMode === 'scale' ? SCALE_DEGREE_LABELS[index] : noteName(semitone)}
              </button>
              <div className="piano-roll-steps">
                {Array.from({ length: STEPS_PER_LOOP }).map((_, step) => {
                  const on = preview ? step >= preview.start && step < preview.start + preview.length : Boolean(noteAt(notes, step));
                  const noteStart = preview ? preview.start : noteAt(notes, step)?.start;
                  const noteEnd = preview ? preview.start + preview.length - 1 : noteStart !== undefined ? noteAt(notes, step).start + noteAt(notes, step).length - 1 : undefined;
                  return (
                    <button
                      key={step}
                      className={`piano-roll-cell ${on ? 'piano-roll-cell-on' : ''} ${step === noteStart ? 'piano-roll-cell-head' : ''} ${
                        step === noteEnd ? 'piano-roll-cell-tail' : ''
                      } ${step === activeStep ? 'piano-roll-cell-playhead' : ''} ${step % 4 === 0 ? 'piano-roll-cell-beat' : ''}`}
                      onPointerDown={(e) => handlePointerDownCell(e, index, step)}
                      onPointerEnter={() => handlePointerEnterCell(index, step)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function ComposerPrototype() {
  const engineRef = useRef(null);
  const [songChoices, setSongChoices] = useState(drawSongOptions);
  const [chosenSong, setChosenSong] = useState(null);
  const [bpm, setBpm] = useState(100);
  const [loopPlaying, setLoopPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);

  const [drumPattern, setDrumPattern] = useState(emptyDrumPattern);
  const drumPatternRef = useRef(drumPattern);
  useEffect(() => {
    drumPatternRef.current = drumPattern;
  }, [drumPattern]);

  const [melodyKeyMode, setMelodyKeyMode] = useState('chromatic');
  const [melodyInstrument, setMelodyInstrument] = useState(DEFAULT_INSTRUMENT);
  const [melodyPattern, setMelodyPattern] = useState({});
  useEffect(() => setMelodyPattern({}), [melodyKeyMode]);
  // null = auto (chords go in the first free slot); otherwise an explicit
  // step the player picked to control where the next chord lands.
  const [chordInsertStep, setChordInsertStep] = useState(null);

  const [bassKeyMode, setBassKeyMode] = useState('chromatic');
  const [bassInstrument, setBassInstrument] = useState(DEFAULT_INSTRUMENT);
  const [bassPattern, setBassPattern] = useState({});
  useEffect(() => setBassPattern({}), [bassKeyMode]);

  const tracksRef = useRef(null);
  useEffect(() => {
    tracksRef.current = {
      melody: {
        instrumentId: melodyInstrument,
        rows: (melodyKeyMode === 'scale' ? MELODY_SCALE_STEPS : MELODY_CHROMATIC.steps).map((semitone, i) => ({
          semitone,
          notes: melodyPattern[i] || [],
        })),
      },
      bass: {
        instrumentId: bassInstrument,
        rows: (bassKeyMode === 'scale' ? BASS_SCALE_STEPS : BASS_CHROMATIC.steps).map((semitone, i) => ({
          semitone,
          notes: bassPattern[i] || [],
        })),
      },
    };
  }, [melodyKeyMode, melodyInstrument, melodyPattern, bassKeyMode, bassInstrument, bassPattern]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const recordTimerRef = useRef(null);
  const recordStartRef = useRef(0);

  const [pianoStatus, setPianoStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    const engine = createComposerEngine();
    engineRef.current = engine;
    engine
      .loadPiano()
      .then(() => setPianoStatus('ready'))
      .catch(() => setPianoStatus('error'));
    return () => {
      engineRef.current?.stopLoop();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setBpm(bpm);
  }, [bpm]);

  function changeSong() {
    setChosenSong(null);
    setSongChoices(drawSongOptions());
  }

  function toggleLoop() {
    const engine = engineRef.current;
    if (loopPlaying) {
      engine.stopLoop();
      setLoopPlaying(false);
      setActiveStep(-1);
    } else {
      engine.startLoop(
        (step) => setActiveStep(step),
        () => drumPatternRef.current,
        () => tracksRef.current,
      );
      setLoopPlaying(true);
    }
  }

  function toggleDrumStep(instrumentId, index) {
    setDrumPattern((prev) => ({
      ...prev,
      [instrumentId]: prev[instrumentId].map((v, i) => (i === index ? !v : v)),
    }));
  }

  // Stamps one chord's semitones into `patternSoFar`. `forcedStart`, when
  // given, overrides auto-placement (used when the player has picked an
  // explicit insertion slot instead of leaving it on Auto). Returns null if
  // any semitone isn't a valid row in the current key mode (e.g. a
  // chromatic chord typed while scale-snapped).
  function stampSemitones(patternSoFar, semitones, stepsList, forcedStart) {
    const rowIndices = semitones.map((semi) => stepsList.indexOf(semi));
    if (rowIndices.some((i) => i === -1)) return null;
    const start = forcedStart ?? findFreeSlot(patternSoFar, rowIndices, CHORD_LENGTH);
    const next = { ...patternSoFar };
    rowIndices.forEach((rowIndex) => {
      next[rowIndex] = placeNote(next[rowIndex] || [], start, CHORD_LENGTH);
    });
    return next;
  }

  function stampChord(semitones) {
    const stepsList = melodyKeyMode === 'scale' ? MELODY_SCALE_STEPS : MELODY_CHROMATIC.steps;
    setMelodyPattern((prev) => stampSemitones(prev, semitones, stepsList, chordInsertStep ?? undefined) ?? prev);
    // Auto-advance the insertion point so consecutive chord clicks build a
    // left-to-right progression, while still leaving it player-controlled.
    if (chordInsertStep !== null) {
      setChordInsertStep(Math.min(chordInsertStep + CHORD_LENGTH, STEPS_PER_LOOP - CHORD_LENGTH));
    }
  }

  // Parses a typed chord progression ("C F G Am") and stamps each chord in
  // sequence — starting at the chosen insertion slot (or the first free
  // slot per chord, if left on Auto). Returns the tokens that couldn't be
  // parsed/placed, so the caller can show what went wrong.
  function stampProgression(text) {
    const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
    const stepsList = melodyKeyMode === 'scale' ? MELODY_SCALE_STEPS : MELODY_CHROMATIC.steps;
    let failed = [];
    let cursor = chordInsertStep;
    setMelodyPattern((prev) => {
      failed = []; // reset in case React invokes this updater more than once
      let next = prev;
      cursor = chordInsertStep;
      tokens.forEach((token) => {
        const semitones = parseChordToken(token);
        const forcedStart = cursor !== null ? Math.min(cursor, STEPS_PER_LOOP - CHORD_LENGTH) : undefined;
        const result = semitones && stampSemitones(next, semitones, stepsList, forcedStart);
        if (result) {
          next = result;
          if (cursor !== null) cursor += CHORD_LENGTH;
        } else {
          failed.push(token);
        }
      });
      return next;
    });
    if (chordInsertStep !== null) setChordInsertStep(Math.min(cursor, STEPS_PER_LOOP - CHORD_LENGTH));
    return failed;
  }

  function startRecording() {
    engineRef.current?.startRecording();
    setIsRecording(true);
    setRecordMs(0);
    setRecordedUrl(null);
    recordStartRef.current = Date.now();
    recordTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - recordStartRef.current;
      setRecordMs(elapsed);
      if (elapsed >= RECORD_LIMIT_MS) stopRecording();
    }, 100);
  }

  async function stopRecording() {
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
    const blob = await engineRef.current?.stopRecording();
    if (blob) setRecordedUrl(URL.createObjectURL(blob));
  }

  const secondsLeft = Math.max(0, Math.ceil((RECORD_LIMIT_MS - recordMs) / 1000));

  return (
    <div className="proto-shell">
      <header>
        <h1>Song Recreation — Composer Prototype</h1>
        <p className="muted">
          Throwaway test harness, not part of the real game. A simple DAW-style piano roll: click cells to place
          drum hits and notes on a shared 32-step grid, hit play to hear it loop. Validating: does this feel fun,
          and does the result stay guessable even though it's rough?
        </p>
      </header>

      <section className="panel song-panel">
        {chosenSong ? (
          <>
            <h2>Your song</h2>
            <p className="song-name">
              {chosenSong.title} <span className="muted">— {chosenSong.artist}</span>
            </p>
            <button className="btn" onClick={changeSong}>
              Change song
            </button>
          </>
        ) : (
          <>
            <h2>Pick a song to recreate</h2>
            <div className="song-choices">
              {songChoices.map((song) => (
                <button key={song.title} className="song-choice" onClick={() => setChosenSong(song)}>
                  <span className="song-choice-title">{song.title}</span>
                  <span className="song-choice-artist muted">{song.artist}</span>
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setSongChoices(drawSongOptions())}>
              Shuffle options
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Tracks</h2>
        <p className="muted">Click cells to place notes and drum hits on the grid — no live performance needed.</p>
        <div className="row">
          <button className={`btn ${loopPlaying ? 'btn-active' : ''}`} onClick={toggleLoop}>
            {loopPlaying ? 'Stop' : 'Play'}
          </button>
          <label className="toggle">
            BPM
            <input type="range" min="70" max="150" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
            <span className="muted">{bpm}</span>
          </label>
        </div>

        <PianoRoll
          title="Melody"
          chromaticRange={MELODY_CHROMATIC}
          scaleSteps={MELODY_SCALE_STEPS}
          keyMode={melodyKeyMode}
          onKeyModeChange={setMelodyKeyMode}
          instrument={melodyInstrument}
          onInstrumentChange={setMelodyInstrument}
          pianoStatus={pianoStatus}
          pattern={melodyPattern}
          onChangeRow={(rowIndex, notes) => setMelodyPattern((prev) => ({ ...prev, [rowIndex]: notes }))}
          activeStep={activeStep}
          onPreview={(semitone) => engineRef.current?.previewNote(semitone, melodyInstrument)}
          chordPalette={CHORD_PALETTE}
          onStampChord={stampChord}
          onStampProgression={stampProgression}
          chordInsertStep={chordInsertStep}
          onChordInsertStepChange={setChordInsertStep}
        />

        <PianoRoll
          title="Bass"
          chromaticRange={BASS_CHROMATIC}
          scaleSteps={BASS_SCALE_STEPS}
          keyMode={bassKeyMode}
          onKeyModeChange={setBassKeyMode}
          instrument={bassInstrument}
          onInstrumentChange={setBassInstrument}
          pianoStatus={pianoStatus}
          pattern={bassPattern}
          onChangeRow={(rowIndex, notes) => setBassPattern((prev) => ({ ...prev, [rowIndex]: notes }))}
          activeStep={activeStep}
          onPreview={(semitone) => engineRef.current?.previewNote(semitone, bassInstrument)}
        />

        <h3 className="track-label">Drums</h3>
        <div className="drum-grid">
          {DRUM_ROWS.map((row) => (
            <div className="drum-row" key={row.id}>
              <span className="drum-row-label">{row.label}</span>
              <div className="drum-row-steps">
                {drumPattern[row.id].map((on, i) => (
                  <button
                    key={i}
                    className={`drum-step ${on ? 'drum-step-on' : ''} ${i === activeStep ? 'drum-step-playhead' : ''} ${
                      i % 4 === 0 ? 'drum-step-beat' : ''
                    }`}
                    onClick={() => toggleDrumStep(row.id, i)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Record your take</h2>
        <p className="muted">
          Captures whatever's playing through the speakers right now — hit Play above first, then Record — into one
          take, the same "flawed version" a guesser would hear.
        </p>
        <div className="row">
          {!isRecording ? (
            <button className="btn btn-record" onClick={startRecording}>
              Record
            </button>
          ) : (
            <button className="btn btn-active" onClick={stopRecording}>
              Stop ({secondsLeft}s left)
            </button>
          )}
        </div>
        {recordedUrl && (
          <div className="playback">
            <audio controls src={recordedUrl} />
          </div>
        )}
      </section>

      <p className="muted credit">
        Piano samples: Salamander Grand Piano by Alexander Holm, CC BY 3.0.
      </p>
    </div>
  );
}
