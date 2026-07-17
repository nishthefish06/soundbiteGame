import { useState } from 'react';
import { RecordControls } from './RecordControls.jsx';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { RECORDING_PREP_DURATION_MS } from '../gameConstants.js';

// TELEPHONE mode forces this modifier on every hop — no picker, unlike the
// normal recording views. See server/src/game/constants.js's TELEPHONE_MODIFIER.
const RELAY_MODIFIER = 'DISTORT';

export function RelayRecordingView({ incomingAudio, onSubmitRecording, phaseEnteredAt }) {
  const [sent, setSent] = useState(false);
  const recorder = useVoiceRecorder();
  // Only relevant before recording starts — once it does, RecordControls'
  // own countdown (the actual clip-length cap) takes over.
  const prepRemainingMs = useCountdown(phaseEnteredAt, RECORDING_PREP_DURATION_MS);

  async function handleSend() {
    if (!recorder.processedBlob) return;
    const res = await onSubmitRecording(RELAY_MODIFIER, recorder.processedBlob);
    if (res?.ok) setSent(true);
  }

  return (
    <div className="phase-view relay-recording-view">
      <div className="guessing-header">
        <p className="eyebrow" style={{ margin: 0 }}>Telephone — your turn</p>
        {recorder.status === 'idle' && (
          <span className="timer-pill">{Math.ceil(prepRemainingMs / 1000)}s to plan</span>
        )}
      </div>
      <h2>Listen closely, then copy it as best you can</h2>

      {incomingAudio ? (
        <audio className="incoming-audio" controls src={incomingAudio.url} />
      ) : (
        <p className="muted">Waiting for the recording to arrive…</p>
      )}

      <RecordControls
        recorder={recorder}
        modifier={RELAY_MODIFIER}
        sent={sent}
        onSend={handleSend}
        sendLabel="Pass it on"
        sentLabel="Sent! Waiting for the next player…"
      />
    </div>
  );
}
