import { PROMPT_SELECTION_DURATION_MS } from '../gameConstants.js';
import { useCountdown } from '../hooks/useCountdown.js';

export function PromptSelectionView({ options, phaseEnteredAt, onSelectPrompt }) {
  const remainingMs = useCountdown(phaseEnteredAt, PROMPT_SELECTION_DURATION_MS);

  return (
    <div className="phase-view prompt-selection-view">
      <div className="guessing-header">
        <p className="eyebrow" style={{ margin: 0 }}>Pick a prompt to act out</p>
        <span className="timer-pill">{Math.ceil(remainingMs / 1000)}s</span>
      </div>

      <div className="prompt-options">
        {options.map((prompt) => (
          <button key={prompt} type="button" className="prompt-option-card" onClick={() => onSelectPrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
