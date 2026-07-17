import { REVEAL_DURATION_MS } from '../gameConstants.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { StarIcon } from './icons.jsx';

const POINTS_PER_STAR = 40; // mirrors server/src/game/constants.js — display only, server is authoritative

export function RoundRevealView({ snapshot, phaseEnteredAt, originalAudio }) {
  const remainingMs = useCountdown(phaseEnteredAt, REVEAL_DURATION_MS);
  const isChainMode = snapshot.chainOrder.length > 0;
  const isPerformanceMode = snapshot.currentMode === 'PERFORMANCE';
  const performers = isChainMode
    ? snapshot.players.filter((p) => snapshot.chainOrder.includes(p.id))
    : snapshot.players.filter((p) => p.id === snapshot.actorId);
  const correctGuessers = snapshot.players.filter((p) => snapshot.correctGuesserIds.includes(p.id));

  const averageRating =
    isPerformanceMode && snapshot.ratings.length > 0
      ? snapshot.ratings.reduce((sum, r) => sum + r.stars, 0) / snapshot.ratings.length
      : 0;

  return (
    <div className="phase-view reveal-view">
      <p className="eyebrow">The prompt was</p>
      <h2 className="prompt-reveal">{snapshot.currentPrompt}</h2>

      {isChainMode && originalAudio && (
        <div className="reveal-audio">
          <p className="eyebrow">The original recording</p>
          <audio controls src={originalAudio.url} />
        </div>
      )}

      {isPerformanceMode ? (
        snapshot.ratings.length > 0 ? (
          <>
            <p className="success-text">
              <StarIcon className="reveal-star-icon" /> {averageRating.toFixed(1)}/5 average — {performers
                .map((p) => p.name)
                .join(', ')}{' '}
              earn{performers.length === 1 ? 's' : ''} {Math.round(averageRating * POINTS_PER_STAR)} points!
            </p>
            <ul className="rating-breakdown">
              {snapshot.ratings.map((r) => (
                <li key={r.playerId}>
                  {snapshot.players.find((p) => p.id === r.playerId)?.name ?? 'Someone'}: {r.stars}★
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">Nobody rated this performance.</p>
        )
      ) : correctGuessers.length > 0 ? (
        <p className="success-text">
          {correctGuessers.map((p) => p.name).join(', ')} got it! {performers.map((p) => p.name).join(', ')} earn
          bonus points.
        </p>
      ) : (
        <p className="muted">Nobody guessed it this round.</p>
      )}

      <p className="muted">Next round in {Math.ceil(remainingMs / 1000)}s…</p>
    </div>
  );
}
