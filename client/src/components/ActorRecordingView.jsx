import { useState } from 'react';
import { ModifierPicker } from './ModifierPicker.jsx';
import { RecordControls } from './RecordControls.jsx';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { RECORDING_PREP_DURATION_MS } from '../gameConstants.js';

// `forcedModifier` covers TELEPHONE mode's chain-origin hop: the modifier is
// fixed for every hop of a relay chain (see RelayRecordingView), including
// this first one, so there's no picker — just the prompt and the record button.
export function ActorRecordingView({ prompt, onSubmitRecording, forcedModifier = null, phaseEnteredAt }) {
  const [pickedModifier, setPickedModifier] = useState('ROBOT');
  const [sent, setSent] = useState(false);
  const recorder = useVoiceRecorder();
  const modifier = forcedModifier ?? pickedModifier;
  // Only relevant before recording starts — once it does, RecordControls'
  // own countdown (the actual clip-length cap) takes over.
  const prepRemainingMs = useCountdown(phaseEnteredAt, RECORDING_PREP_DURATION_MS);

  async function handleSend() {
    if (!recorder.processedBlob) return;
    const res = await onSubmitRecording(modifier, recorder.processedBlob);
    if (res?.ok) setSent(true);
  }

  return (
    <div className="phase-view actor-recording-view">
      <div className="guessing-header">
        <p className="eyebrow" style={{ margin: 0 }}>Your secret prompt</p>
        {recorder.status === 'idle' && (
          <span className="timer-pill">{Math.ceil(prepRemainingMs / 1000)}s to plan</span>
        )}
      </div>
      <h2 className="prompt-reveal">{prompt}</h2>

      {!forcedModifier && (
        <ModifierPicker value={modifier} onChange={setPickedModifier} disabled={recorder.status === 'recording' || sent} />
      )}

      <RecordControls recorder={recorder} modifier={modifier} sent={sent} onSend={handleSend} />
    </div>
  );
}
