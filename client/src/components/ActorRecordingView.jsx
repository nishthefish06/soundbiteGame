import { useState } from 'react';
import { ModifierPicker } from './ModifierPicker.jsx';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.js';

export function ActorRecordingView({ prompt, onSubmitRecording }) {
  const [modifier, setModifier] = useState('ROBOT');
  const [sent, setSent] = useState(false);
  const recorder = useVoiceRecorder();

  const secondsLeft = Math.max(0, Math.ceil((recorder.maxMs - recorder.elapsedMs) / 1000));
  const progress = recorder.elapsedMs / recorder.maxMs;

  async function handleSend() {
    if (!recorder.processedBlob) return;
    const res = await onSubmitRecording(modifier, recorder.processedBlob);
    if (res?.ok) setSent(true);
  }

  return (
    <div className="phase-view actor-recording-view">
      <p className="eyebrow">Your secret prompt</p>
      <h2 className="prompt-reveal">{prompt}</h2>

      <ModifierPicker value={modifier} onChange={setModifier} disabled={recorder.status === 'recording' || sent} />

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

        {recorder.status === 'ready' && !sent && (
          <div className="recording-preview">
            <audio controls src={recorder.previewUrl} />
            <div className="recording-preview-actions">
              <button className="btn btn-ghost" onClick={recorder.reset}>Re-record</button>
              <button className="btn btn-primary" onClick={handleSend}>Send to guessers</button>
            </div>
          </div>
        )}

        {sent && <p className="success-text">Sent! Waiting for guesses…</p>}
      </div>
    </div>
  );
}
