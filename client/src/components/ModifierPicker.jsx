import { VOICE_MODIFIERS } from '../dsp/effectChains.js';
import { MODIFIER_ICONS } from './icons.jsx';

export function ModifierPicker({ value, onChange, disabled }) {
  return (
    <div className="modifier-picker" role="radiogroup" aria-label="Voice modifier">
      {Object.entries(VOICE_MODIFIERS).map(([key, m]) => {
        const Icon = MODIFIER_ICONS[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            disabled={disabled}
            className={`modifier-card ${value === key ? 'modifier-card-selected' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="modifier-emoji">{Icon && <Icon />}</span>
            <span className="modifier-label">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
