import { PROMPT_SELECTION_DURATION_MS, GAME_MODE_META } from '../gameConstants.js';
import { useCountdown } from '../hooks/useCountdown.js';

export function PromptSelectionView({ mode, options, phaseEnteredAt, onSelectPrompt }) {
  const remainingMs = useCountdown(phaseEnteredAt, PROMPT_SELECTION_DURATION_MS);
  const meta = GAME_MODE_META[mode];

  return (
    <div className="phase-view prompt-selection-view">
      <div className="guessing-header">
        <p className="eyebrow" style={{ margin: 0 }}>
          {meta ? `${meta.emoji} ${meta.label} — pick a prompt` : 'Pick a prompt to act out'}
        </p>
        <span className="timer-pill">{Math.ceil(remainingMs / 1000)}s</span>
      </div>

      <div className="prompt-options">
        {options.map((option) => (
          <button
            key={option.text}
            type="button"
            className="prompt-option-card"
            onClick={() => onSelectPrompt(option.text)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}
