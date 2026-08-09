import { useState } from 'react';
import { ModifierPicker } from './ModifierPicker.jsx';
import { RecordControls } from './RecordControls.jsx';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { RECORDING_PREP_DURATION_MS } from '../gameConstants.js';

// WHO_SAID_IT mode's recording view: unlike ActorRecordingView, everyone
// eligible sees and uses this at once — there's no single actor, so this
// reuses onSubmitRecording (useGameRoom's plain submitRecording — the wire
// event and payload are identical, the server tells the modes apart) rather
// than a separate action, and shows a "waiting for others" state driven by
// recordingProgress instead of just disappearing once sent.
export function GroupRecordingView({ prompt, onSubmitRecording, phaseEnteredAt, recordingProgress }) {
  const [pickedModifier, setPickedModifier] = useState('ROBOT');
  const [sent, setSent] = useState(false);
  const recorder = useVoiceRecorder();
  const prepRemainingMs = useCountdown(phaseEnteredAt, RECORDING_PREP_DURATION_MS);

  async function handleSend() {
    if (!recorder.processedBlob) return;
    const res = await onSubmitRecording(pickedModifier, recorder.processedBlob);
    if (res?.ok) setSent(true);
  }

  if (sent) {
    return (
      <div className="phase-view group-recording-view">
        <div className="pulse-dot" />
        <h2>Got it — waiting on everyone else…</h2>
        {recordingProgress && (
          <p className="muted">
            {recordingProgress.count}/{recordingProgress.total} players have recorded.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="phase-view group-recording-view">
      <div className="guessing-header">
        <p className="eyebrow" style={{ margin: 0 }}>Everyone records this — disguise your voice!</p>
        {recorder.status === 'idle' && (
          <span className="timer-pill">{Math.ceil(prepRemainingMs / 1000)}s to plan</span>
        )}
      </div>
      <h2 className="prompt-reveal">{prompt}</h2>

      <ModifierPicker value={pickedModifier} onChange={setPickedModifier} disabled={recorder.status === 'recording'} />

      <RecordControls
        recorder={recorder}
        modifier={pickedModifier}
        sent={sent}
        onSend={handleSend}
        sendLabel="Send my clip"
      />
    </div>
  );
}
