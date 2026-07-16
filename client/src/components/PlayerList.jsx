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

export function PlayerList({ players, actorId, correctGuesserIds = [], selfId }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <ul className="player-list">
      {sorted.map((p) => (
        <li key={p.id} className={`player-row ${p.connected ? '' : 'player-row-disconnected'}`}>
          <span className="player-avatar">{initials(p.name)}</span>
          <span className="player-name">
            {p.name}
            {p.id === selfId && <span className="player-you"> (you)</span>}
          </span>
          {p.id === actorId && <span className="badge badge-actor" title="Actor"><MicIcon /></span>}
          {correctGuesserIds.includes(p.id) && <span className="badge badge-correct" title="Guessed correctly">✅</span>}
          {!p.connected && <span className="badge badge-offline" title="Disconnected">⚠️</span>}
          <span className="player-score">{p.score}</span>
        </li>
      ))}
    </ul>
  );
}
