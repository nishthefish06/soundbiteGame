import { PROMPT_SELECTION_DURATION_MS, GAME_MODE_META } from '../gameConstants.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { MODE_ICONS } from './icons.jsx';

export function PromptSelectionView({ mode, options, phaseEnteredAt, onSelectPrompt }) {
  const remainingMs = useCountdown(phaseEnteredAt, PROMPT_SELECTION_DURATION_MS);
  const meta = GAME_MODE_META[mode];
  const Icon = MODE_ICONS[mode];

  return (
    <div className="phase-view prompt-selection-view">
      <div className="guessing-header">
        <p className="eyebrow eyebrow-row" style={{ margin: 0 }}>
          {meta && Icon && <Icon className="eyebrow-icon" />}
          {meta ? `${meta.label} — pick a prompt` : 'Pick a prompt to act out'}
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
