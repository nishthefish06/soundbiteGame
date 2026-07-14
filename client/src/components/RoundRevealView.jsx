import { REVEAL_DURATION_MS } from '../gameConstants.js';
import { useCountdown } from '../hooks/useCountdown.js';

export function RoundRevealView({ snapshot, phaseEnteredAt }) {
  const remainingMs = useCountdown(phaseEnteredAt, REVEAL_DURATION_MS);
  const actor = snapshot.players.find((p) => p.id === snapshot.actorId);
  const correctGuessers = snapshot.players.filter((p) => snapshot.correctGuesserIds.includes(p.id));

  return (
    <div className="phase-view reveal-view">
      <p className="eyebrow">The prompt was</p>
      <h2 className="prompt-reveal">{snapshot.currentPrompt}</h2>

      {correctGuessers.length > 0 ? (
        <p className="success-text">
          {correctGuessers.map((p) => p.name).join(', ')} got it! {actor?.name} earns bonus points.
        </p>
      ) : (
        <p className="muted">Nobody guessed it this round.</p>
      )}

      <p className="muted">Next round in {Math.ceil(remainingMs / 1000)}s…</p>
    </div>
  );
}
