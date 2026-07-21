// TELEPHONE mode only: chainOrder/actorId/players/selfId let this view show
// the whole relay chain and highlight who currently holds the mic vs who's
// up next — derived purely from data already in the snapshot (actorId is
// always chainOrder[chainIndex], see Room.js's _advanceChain), no new
// server field needed.
export function GuesserWaitingView({
  actorName,
  action = 'is recording',
  subtext = 'Get ready to guess once the clip comes in.',
  chainOrder = [],
  players = [],
  actorId = null,
  selfId = null,
}) {
  const isChainMode = chainOrder.length > 0;
  const nextId = isChainMode ? (chainOrder[chainOrder.indexOf(actorId) + 1] ?? null) : null;

  function nameFor(id) {
    if (id === selfId) return 'You';
    return players.find((p) => p.id === id)?.name ?? 'Someone';
  }

  return (
    <div className="phase-view waiting-view">
      <div className="pulse-dot" />
      <h2>{actorName} {action}…</h2>
      <p className="muted">{subtext}</p>

      {isChainMode && (
        <div className="chain-strip">
          {chainOrder.map((id) => (
            <span
              key={id}
              className={`chain-strip-member ${id === actorId ? 'chain-strip-current' : ''} ${
                id === nextId ? 'chain-strip-next' : ''
              }`}
            >
              {nameFor(id)}
            </span>
          ))}
          {nextId && (
            <p className="muted chain-strip-callout">
              {nextId === selfId ? "You're up next!" : `${nameFor(nextId)} is up next.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
