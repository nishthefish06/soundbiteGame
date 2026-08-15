import { MAX_MODIFIERS_PER_COMBO, MODIFIER_COMBO_SEPARATOR, VOICE_MODIFIERS } from '../dsp/effectChains.js';
import { MODIFIER_ICONS } from './icons.jsx';

// `value`/`onChange` stay single-string (e.g. "ROBOT" or "ROBOT+ECHO") so
// callers (ActorRecordingView, PracticeModeView) don't need to know mixing
// exists — this component owns the multi-select behavior and just joins/
// splits on MODIFIER_COMBO_SEPARATOR. Selection order is preserved (first
// picked = primary, whose playbackRate wins — see effectChains.resolveModifier)
// so tapping a third effect bumps the oldest rather than the newest.
export function ModifierPicker({ value, onChange, disabled }) {
  const selected = value ? value.split(MODIFIER_COMBO_SEPARATOR) : [];

  function toggle(key) {
    if (selected.includes(key)) {
      // Always keep at least one effect selected.
      if (selected.length <= 1) return;
      onChange(selected.filter((k) => k !== key).join(MODIFIER_COMBO_SEPARATOR));
      return;
    }

    const next =
      selected.length >= MAX_MODIFIERS_PER_COMBO ? [...selected.slice(1), key] : [...selected, key];
    onChange(next.join(MODIFIER_COMBO_SEPARATOR));
  }

  return (
    <div className="modifier-picker" role="group" aria-label="Voice modifier">
      {Object.entries(VOICE_MODIFIERS).map(([key, m]) => {
        const Icon = MODIFIER_ICONS[key];
        const isSelected = selected.includes(key);
        const order = isSelected ? selected.indexOf(key) + 1 : null;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            className={`modifier-card ${isSelected ? 'modifier-card-selected' : ''}`}
            onClick={() => toggle(key)}
          >
            {order && <span className="modifier-order-badge">{order}</span>}
            <span className="modifier-emoji">{Icon && <Icon />}</span>
            <span className="modifier-label">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
