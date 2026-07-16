export function RecordControls({
  recorder,
  modifier,
  sent,
  onSend,
  sendLabel = 'Send to guessers',
  sentLabel = 'Sent! Waiting for guesses…',
}) {
  const secondsLeft = Math.max(0, Math.ceil((recorder.maxMs - recorder.elapsedMs) / 1000));
  const progress = recorder.elapsedMs / recorder.maxMs;

  return (
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
            <button className="btn btn-primary" onClick={onSend}>{sendLabel}</button>
          </div>
        </div>
      )}

      {sent && <p className="success-text">{sentLabel}</p>}
    </div>
  );
}
