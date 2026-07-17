import { useState } from 'react';
import { ModifierPicker } from './ModifierPicker.jsx';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.js';

// Standalone voice-filter sandbox — no room, no server, just the local
// mic -> DSP pipeline the game itself uses. Reuses useVoiceRecorder/
// ModifierPicker as-is; doesn't reuse RecordControls since that component's
// "send" step doesn't apply here — this loops record -> preview -> re-record.
export function PracticeModeView({ onClose }) {
  const [modifier, setModifier] = useState('ROBOT');
  const recorder = useVoiceRecorder();

  const secondsLeft = Math.max(0, Math.ceil((recorder.maxMs - recorder.elapsedMs) / 1000));
  const progress = recorder.elapsedMs / recorder.maxMs;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card practice-mode-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <h2>Practice</h2>
        <p className="muted">Try out the voice filters on your own — nobody's listening but you.</p>

        <ModifierPicker value={modifier} onChange={setModifier} disabled={recorder.status === 'recording'} />

        <div className="record-controls">
          {recorder.status === 'idle' && (
            <button className="record-button" onClick={() => recorder.start(modifier)}>
              <span className="record-button-dot" />
              Record
            </button>
          )}

          {recorder.status === 'recording' && (
            <button
              className="record-button record-button-active"
              style={{ '--progress': progress }}
              onClick={recorder.stop}
            >
              <span className="record-button-time">{secondsLeft}s</span>
              Stop
            </button>
          )}

          {recorder.status === 'processing' && <p className="muted">Disguising your voice…</p>}

          {recorder.status === 'error' && (
            <div className="recorder-error">
              <p className="error-text">{recorder.error}</p>
              <button className="btn btn-secondary" onClick={() => recorder.start(modifier)}>
                Try again
              </button>
            </div>
          )}

          {recorder.status === 'ready' && (
            <div className="recording-preview">
              <audio controls autoPlay src={recorder.previewUrl} />
              <button className="btn btn-primary" onClick={recorder.reset}>
                Record again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
