import { useState } from 'react';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  VALID_ROUND_COUNTS,
  GAME_MODES,
  GAME_MODE_META,
  MIN_CUSTOM_PROMPTS,
  MAX_CUSTOM_PROMPTS,
} from '../gameConstants.js';
import { MODE_ICONS } from './icons.jsx';

export function LobbyView({ snapshot, onStartGame }) {
  const [roundCount, setRoundCount] = useState(VALID_ROUND_COUNTS[0]);
  const [mode, setMode] = useState(GAME_MODES[0]);
  const [customText, setCustomText] = useState('');

  const playerCount = snapshot.players.length;
  const canStart = playerCount >= MIN_PLAYERS;

  const isCustom = mode === 'CUSTOM';
  const customPrompts = customText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_PROMPTS);
  const customReady = !isCustom || customPrompts.length >= MIN_CUSTOM_PROMPTS;

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

      {isCustom && (
        <div className="custom-prompts-field">
          <span className="field-label">Your prompts (one per line, at least {MIN_CUSTOM_PROMPTS})</span>
          <textarea
            className="input custom-prompts-textarea"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={"e.g.\nDad's terrible fishing story\nOur inside joke about the road trip"}
            rows={5}
          />
          <span className="muted custom-prompts-count">
            {customPrompts.length} prompt{customPrompts.length === 1 ? '' : 's'} ready
          </span>
        </div>
      )}

      <button
        className="btn btn-primary btn-lg"
        onClick={() => onStartGame(roundCount, mode, isCustom ? customPrompts : undefined)}
        disabled={!canStart || !customReady}
      >
        Start Game
      </button>
    </div>
  );
}
