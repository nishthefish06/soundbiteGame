import { MODE_ICONS } from './icons.jsx';

const MODE_BLURBS = [
  ['SOUND_EFFECT', 'Sound Effect', 'Make the sound with your own voice — no words, just noise.'],
  ['CHARACTER', 'Character', "Do your best impression of who you're given."],
  ['CUSTOM', 'Custom', "Guess the host's own prompts — inside jokes, anything goes."],
  ['TELEPHONE', 'Telephone', 'The prompt gets relayed (and distorted) person to person before everyone guesses the original.'],
  ['PERFORMANCE', 'Showtime', "Act out a wacky prompt with your voice — everyone else rates the performance 1-5 stars."],
];

export function HowToPlayModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <h2>How to play</h2>

        <ol className="how-to-play-steps">
          <li>Get everyone into the same room, then start a game.</li>
          <li>Each round, everyone takes a turn as the Actor — get a secret prompt and record it through a disguised voice effect.</li>
          <li>Everyone else hears only the disguised recording and guesses what the prompt was.</li>
          <li>Guess fast for a bigger bonus, and keep a streak going across turns for even more.</li>
        </ol>

        <p className="eyebrow">Modes</p>
        <ul className="how-to-play-modes">
          {MODE_BLURBS.map(([key, label, blurb]) => {
            const Icon = MODE_ICONS[key];
            return (
              <li key={key}>
                <Icon className="how-to-play-mode-icon" />
                <div>
                  <strong>{label}</strong>
                  <p className="muted">{blurb}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <button className="btn btn-primary btn-block" onClick={onClose}>
          Got it!
        </button>
      </div>
    </div>
  );
}
