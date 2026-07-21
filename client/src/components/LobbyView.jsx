import { useState } from 'react';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  VALID_ROUND_COUNTS,
  GAME_MODES,
  GAME_MODE_META,
  MIN_CUSTOM_PROMPTS,
  MAX_CUSTOM_PROMPTS,
  MAX_CUSTOM_PROMPT_LENGTH,
} from '../gameConstants.js';
import { getPromptPacks, savePromptPack, deletePromptPack } from '../promptPacks.js';
import { MODE_ICONS } from './icons.jsx';

// Round count/mode/custom text are owned by App (not local state here) so
// they survive LobbyView unmounting between rounds — otherwise every
// "Play again" reset the host back to the defaults.
export function LobbyView({
  snapshot,
  isHost,
  onStartGame,
  roundCount,
  onRoundCountChange,
  mode,
  onModeChange,
  customText,
  onCustomTextChange,
}) {
  const playerCount = snapshot.players.length;
  const canStart = playerCount >= MIN_PLAYERS;

  const isCustom = mode === 'CUSTOM';
  const customPrompts = customText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_PROMPTS);
  const customReady = !isCustom || customPrompts.length >= MIN_CUSTOM_PROMPTS;

  // Packs live entirely in localStorage — no need to lift this state up to
  // App.jsx the way roundCount/mode/customText are, since the packs
  // themselves (not the textarea's current contents) are the source of truth.
  const [packs, setPacks] = useState(getPromptPacks);

  function handleLoadPack(pack) {
    onCustomTextChange(pack.prompts.join('\n'));
  }

  function handleSavePack() {
    const name = window.prompt("Name this prompt pack (e.g. \"Friend group inside jokes\")");
    if (!name) return;
    const validPrompts = customPrompts.filter((p) => p.length <= MAX_CUSTOM_PROMPT_LENGTH);
    setPacks(savePromptPack(name, validPrompts));
  }

  function handleDeletePack(e, name) {
    e.stopPropagation();
    setPacks(deletePromptPack(name));
  }

  // Non-hosts don't get the config form — the round count/mode a non-host
  // sees locally isn't synced from the server (nothing broadcasts the
  // host's in-progress picks), so showing it — even disabled — would risk
  // looking like a live reflection of what's actually about to start.
  if (!isHost) {
    return (
      <div className="phase-view waiting-view">
        <div className="pulse-dot" />
        <h2>Waiting for the host to start the game…</h2>
        <p className="muted">
          {playerCount}/{MAX_PLAYERS} players in the room
          {!canStart && ` — need at least ${MIN_PLAYERS} to start`}
        </p>
      </div>
    );
  }

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
                onClick={() => onRoundCountChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="muted rounds-hint">
            Every player gets a turn as the Actor each round — that's {roundCount * playerCount} turn
            {roundCount * playerCount === 1 ? '' : 's'} total.
          </span>
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
                  onClick={() => onModeChange(m)}
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
          {packs.length > 0 && (
            <div className="prompt-packs">
              <span className="field-label">Saved packs</span>
              <div className="prompt-packs-list">
                {packs.map((pack) => (
                  <button
                    key={pack.name}
                    type="button"
                    className="recent-room-chip"
                    onClick={() => handleLoadPack(pack)}
                    title={`Load "${pack.name}" (${pack.prompts.length} prompts)`}
                  >
                    {pack.name}
                    <span className="recent-room-remove" onClick={(e) => handleDeletePack(e, pack.name)}>×</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="custom-prompts-label-row">
            <span className="field-label">Your prompts (one per line, at least {MIN_CUSTOM_PROMPTS})</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleSavePack}
              disabled={!customReady}
            >
              Save as pack
            </button>
          </div>
          <textarea
            className="input custom-prompts-textarea"
            value={customText}
            onChange={(e) => onCustomTextChange(e.target.value)}
            placeholder={"e.g.\nSound effects from your favorite game\nYour friend group's inside joke\nA popular TikTok sound"}
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
