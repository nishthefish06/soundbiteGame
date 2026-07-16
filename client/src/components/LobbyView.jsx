import { useState } from 'react';
import { MIN_PLAYERS, MAX_PLAYERS, VALID_ROUND_COUNTS, GAME_MODES, GAME_MODE_META } from '../gameConstants.js';
import { MODE_ICONS } from './icons.jsx';

export function LobbyView({ snapshot, onStartGame }) {
  const [roundCount, setRoundCount] = useState(VALID_ROUND_COUNTS[0]);
  const [mode, setMode] = useState(GAME_MODES[0]);

  const playerCount = snapshot.players.length;
  const canStart = playerCount >= MIN_PLAYERS;

  return (
    <div className="phase-view lobby-view">
      <h2>Set up a game</h2>
      <p className="muted">
        {playerCount}/{MAX_PLAYERS} players in the room
        {!canStart && ` — need at least ${MIN_PLAYERS} to start`}
      </p>

      <div className="lobby-setup">
        <div className="lobby-setup-group">
          <span className="field-label">Rounds</span>
          <div className="pill-picker">
            {VALID_ROUND_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                className={`pill-option ${roundCount === n ? 'pill-option-selected' : ''}`}
                onClick={() => setRoundCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="lobby-setup-group">
          <span className="field-label">Mode</span>
          <div className="pill-picker">
            {GAME_MODES.map((m) => {
              const meta = GAME_MODE_META[m];
              const Icon = MODE_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  className={`pill-option ${mode === m ? 'pill-option-selected' : ''}`}
                  onClick={() => setMode(m)}
                >
                  <Icon className="pill-icon" /> {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <button className="btn btn-primary btn-lg" onClick={() => onStartGame(roundCount, mode)} disabled={!canStart}>
        Start Game
      </button>
    </div>
  );
}
