import { useCallback, useEffect, useRef, useState } from 'react';
import { MicIcon, RobotIcon, DemonIcon, ChipmunkIcon, HighPitchIcon, EchoIcon, DistortIcon } from './icons.jsx';

const ICONS = [MicIcon, RobotIcon, DemonIcon, ChipmunkIcon, HighPitchIcon, EchoIcon, DistortIcon];
const GAME_SECONDS = 20;
const SPAWN_MS = 600;
const HIGH_SCORE_KEY = 'soundbite:micDropHighScore';

function loadHighScore() {
  const raw = Number(localStorage.getItem(HIGH_SCORE_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

export function MicDropGame({ onClose }) {
  const [targets, setTargets] = useState([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [highScore, setHighScore] = useState(loadHighScore);
  const [ended, setEnded] = useState(false);
  const nextId = useRef(0);

  const removeTarget = useCallback((id) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  function handleHit(id) {
    removeTarget(id);
    setScore((s) => s + 1);
  }

  useEffect(() => {
    if (ended) return undefined;
    const spawn = setInterval(() => {
      const Icon = ICONS[Math.floor(Math.random() * ICONS.length)];
      const id = nextId.current++;
      const left = 6 + Math.random() * 82;
      const duration = 1.3 + Math.random() * 1.2;
      setTargets((prev) => [...prev, { id, Icon, left, duration }]);
    }, SPAWN_MS);
    return () => clearInterval(spawn);
  }, [ended]);

  useEffect(() => {
    if (ended) return undefined;
    if (timeLeft <= 0) {
      setEnded(true);
      return undefined;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, ended]);

  useEffect(() => {
    if (!ended) return;
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem(HIGH_SCORE_KEY, String(score));
    }
  }, [ended, score, highScore]);

  function handlePlayAgain() {
    setTargets([]);
    setScore(0);
    setTimeLeft(GAME_SECONDS);
    setEnded(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card minigame-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        <h2>Mic Drop!</h2>
        <p className="muted">You found it. Tap the mics before they hit the floor.</p>

        <div className="minigame-hud">
          <span>Score <strong>{score}</strong></span>
          <span>Best <strong>{highScore}</strong></span>
          <span>{ended ? 'Time!' : `0:${String(timeLeft).padStart(2, '0')}`}</span>
        </div>

        <div className="minigame-field">
          {targets.map(({ id, Icon, left, duration }) => (
            <button
              key={id}
              type="button"
              className="minigame-target"
              style={{ left: `${left}%`, animationDuration: `${duration}s` }}
              onClick={() => handleHit(id)}
              onAnimationEnd={() => removeTarget(id)}
              aria-label="Tap the mic"
            >
              <Icon />
            </button>
          ))}

          {ended && (
            <div className="minigame-overlay">
              <p className="minigame-overlay-score">Score: {score}</p>
              <button type="button" className="btn btn-primary" onClick={handlePlayAgain}>
                Play again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
