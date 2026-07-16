export function GuesserWaitingView({
  actorName,
  action = 'is recording',
  subtext = 'Get ready to guess once the clip comes in.',
}) {
  return (
    <div className="phase-view waiting-view">
      <div className="pulse-dot" />
      <h2>{actorName} {action}…</h2>
      <p className="muted">{subtext}</p>
    </div>
  );
}
