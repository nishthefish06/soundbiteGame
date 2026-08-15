import ComposerPrototype from '../composerPrototype/ComposerPrototype.jsx';
import '../composerPrototype/style.css';
import { useCountdown } from '../hooks/useCountdown.js';
import { COMPOSING_DURATION_MS } from '../gameConstants.js';

// SONG_RECREATION mode's composing phase: everyone builds a track at once
// (like GroupRecordingView, but with the composer instead of a voice
// recording). The composer owns its own record/submit UI end to end (see
// ComposerPrototype's onSubmit/composingProgress props) — this view is just
// the phase countdown wrapped around it. Deliberately NOT proto-page.css
// (that file is the standalone composer-prototype.html harness's own
// :root/body bootstrap — index.css already provides the real app's).
export function ComposingView({ onSubmitComposition, phaseEnteredAt, composingProgress }) {
  const remainingMs = useCountdown(phaseEnteredAt, COMPOSING_DURATION_MS);

  return (
    <div className="phase-view composing-view">
      <div className="guessing-header">
        <p className="eyebrow" style={{ margin: 0 }}>Recreate a song with the instruments below</p>
        <span className="timer-pill">{Math.ceil(remainingMs / 1000)}s left</span>
      </div>
      <ComposerPrototype onSubmit={onSubmitComposition} composingProgress={composingProgress} />
    </div>
  );
}
