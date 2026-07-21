export function ActorAwaitingRatingView({ secondsLeft, ratingProgress, isSpectating = false }) {
  return (
    <div className="phase-view actor-listening-view">
      <div className="guessing-header">
        <h2>{isSpectating ? 'Everyone else is rating the performance…' : "Everyone's rating your performance…"}</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>
      <p className="muted">
        {isSpectating
          ? "You joined mid-game, so you're sitting this round out."
          : "No peeking at the stars — you'll see how you did at the reveal."}
        {ratingProgress ? ` ${ratingProgress.count}/${ratingProgress.total} rated so far.` : ''}
      </p>
    </div>
  );
}
