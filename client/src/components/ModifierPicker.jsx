import { VOICE_MODIFIERS } from '../dsp/effectChains.js';

export function ModifierPicker({ value, onChange, disabled }) {
  return (
    <div className="modifier-picker" role="radiogroup" aria-label="Voice modifier">
      {Object.entries(VOICE_MODIFIERS).map(([key, m]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          disabled={disabled}
          className={`modifier-card ${value === key ? 'modifier-card-selected' : ''}`}
          onClick={() => onChange(key)}
        >
          <span className="modifier-emoji">{m.emoji}</span>
          <span className="modifier-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
