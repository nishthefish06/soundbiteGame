export function GuesserWaitingView({ actorName }) {
  return (
    <div className="phase-view waiting-view">
      <div className="pulse-dot" />
      <h2>{actorName} is recording…</h2>
      <p className="muted">Get ready to guess once the clip comes in.</p>
    </div>
  );
}
