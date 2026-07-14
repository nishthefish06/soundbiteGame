import { MIN_PLAYERS, MAX_PLAYERS } from '../gameConstants.js';

export function LobbyView({ snapshot, onStartRound }) {
  const count = snapshot.players.length;
  const canStart = count >= MIN_PLAYERS;

  return (
    <div className="phase-view lobby-view">
      {snapshot.roundNumber > 0 ? (
        <h2>Round {snapshot.roundNumber} complete!</h2>
      ) : (
        <h2>Waiting to start</h2>
      )}
      <p className="muted">
        {count}/{MAX_PLAYERS} players in the room
        {!canStart && ` — need at least ${MIN_PLAYERS} to start`}
      </p>
      <button className="btn btn-primary btn-lg" onClick={onStartRound} disabled={!canStart}>
        {snapshot.roundNumber > 0 ? 'Start next round' : 'Start round'}
      </button>
    </div>
  );
}
