import { MicIcon } from './icons.jsx';

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function PlayerList({
  players,
  actorId,
  correctGuesserIds = [],
  selfId,
  hostId,
  isHost,
  onKick,
  onTransferHost,
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  function handleKick(id, name) {
    if (window.confirm(`Remove ${name} from the room?`)) onKick(id);
  }

  return (
    <ul className="player-list">
      {sorted.map((p) => (
        <li key={p.id}>
          <div className={`player-row ${p.connected ? '' : 'player-row-disconnected'}`}>
            <span className="player-avatar">{initials(p.name)}</span>
            <span className="player-name">
              {p.name}
              {p.id === selfId && <span className="player-you"> (you)</span>}
            </span>
            {p.id === hostId && <span className="badge badge-host" title="Host">👑</span>}
            {p.id === actorId && <span className="badge badge-actor" title="Actor"><MicIcon /></span>}
            {correctGuesserIds.includes(p.id) && <span className="badge badge-correct" title="Guessed correctly">✅</span>}
            {!p.connected && <span className="badge badge-offline" title="Disconnected">⚠️</span>}
            {p.streak >= 2 && (
              <span className="badge badge-streak" title={`${p.streak} correct guesses in a row`}>
                🔥{p.streak}
              </span>
            )}
            <span className="player-score">{p.score}</span>
          </div>

          {isHost && p.id !== selfId && (
            <div className="player-actions">
              <button type="button" className="player-action-btn" onClick={() => onTransferHost(p.id)}>
                Make host
              </button>
              <button
                type="button"
                className="player-action-btn player-action-btn-danger"
                onClick={() => handleKick(p.id, p.name)}
              >
                Kick
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
