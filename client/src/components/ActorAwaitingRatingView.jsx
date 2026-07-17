export function ActorAwaitingRatingView({ secondsLeft, ratingProgress }) {
  return (
    <div className="phase-view actor-listening-view">
      <div className="guessing-header">
        <h2>Everyone's rating your performance…</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>
      <p className="muted">
        No peeking at the stars — you'll see how you did at the reveal.
        {ratingProgress ? ` ${ratingProgress.count}/${ratingProgress.total} rated so far.` : ''}
      </p>
    </div>
  );
}
