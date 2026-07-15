export function GuesserWaitingView({ actorName, action = 'is recording' }) {
  return (
    <div className="phase-view waiting-view">
      <div className="pulse-dot" />
      <h2>{actorName} {action}…</h2>
      <p className="muted">Get ready to guess once the clip comes in.</p>
    </div>
  );
}
