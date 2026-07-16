import { useState } from 'react';
import { ModifierPicker } from './ModifierPicker.jsx';
import { RecordControls } from './RecordControls.jsx';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.js';

// `forcedModifier` covers TELEPHONE mode's chain-origin hop: the modifier is
// fixed for every hop of a relay chain (see RelayRecordingView), including
// this first one, so there's no picker — just the prompt and the record button.
export function ActorRecordingView({ prompt, onSubmitRecording, forcedModifier = null }) {
  const [pickedModifier, setPickedModifier] = useState('ROBOT');
  const [sent, setSent] = useState(false);
  const recorder = useVoiceRecorder();
  const modifier = forcedModifier ?? pickedModifier;

  async function handleSend() {
    if (!recorder.processedBlob) return;
    const res = await onSubmitRecording(modifier, recorder.processedBlob);
    if (res?.ok) setSent(true);
  }

  return (
    <div className="phase-view actor-recording-view">
      <p className="eyebrow">Your secret prompt</p>
      <h2 className="prompt-reveal">{prompt}</h2>

      {!forcedModifier && (
        <ModifierPicker value={modifier} onChange={setPickedModifier} disabled={recorder.status === 'recording' || sent} />
      )}

      <RecordControls recorder={recorder} modifier={modifier} sent={sent} onSend={handleSend} />
    </div>
  );
}
