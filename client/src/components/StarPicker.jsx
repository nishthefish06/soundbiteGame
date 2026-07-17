import { StarIcon } from './icons.jsx';

const STAR_VALUES = [1, 2, 3, 4, 5];

export function StarPicker({ value, onChange, disabled }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label="Star rating">
      {STAR_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          className={`star-picker-star ${n <= value ? 'star-picker-star-filled' : ''}`}
          onClick={() => onChange(n)}
          disabled={disabled}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-checked={n === value}
          role="radio"
        >
          <StarIcon />
        </button>
      ))}
    </div>
  );
}
