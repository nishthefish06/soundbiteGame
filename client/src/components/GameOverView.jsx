import { useState } from 'react';
import { StarIcon } from './icons.jsx';

export function GameOverView({ players, roundHistory, onPlayAgain }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === topScore && topScore > 0);
  const [showRecap, setShowRecap] = useState(false);

  return (
    <div className="phase-view game-over-view">
      <p className="eyebrow">Game over</p>
      <h2>
        {winners.length === 1
          ? `🏆 ${winners[0].name} wins!`
          : winners.length > 1
            ? `🏆 It's a tie: ${winners.map((p) => p.name).join(' & ')}!`
            : 'No points scored this game!'}
      </h2>

      <ol className="final-scoreboard">
        {ranked.map((p, i) => (
          <li key={p.id} className="final-scoreboard-row">
            <span className="final-scoreboard-rank">#{i + 1}</span>
            <span className="final-scoreboard-name">{p.name}</span>
            <span className="final-scoreboard-score">{p.score}</span>
          </li>
        ))}
      </ol>

      {roundHistory.length > 0 && (
        <div className="round-recap">
          <button
            type="button"
            className="btn btn-ghost btn-sm round-recap-toggle"
            onClick={() => setShowRecap((s) => !s)}
          >
            {showRecap ? 'Hide' : 'Show'} round recap ({roundHistory.length})
          </button>

          {showRecap && (
            <ol className="round-recap-list">
              {roundHistory.map((entry) => (
                <li key={entry.turnNumber} className="round-recap-row">
                  <div className="round-recap-row-header">
                    <span className="round-recap-prompt">{entry.prompt}</span>
                    <span className="muted round-recap-performers">{entry.performerNames.join(', ')}</span>
                  </div>

                  {entry.mode === 'PERFORMANCE' ? (
                    entry.ratings.length > 0 ? (
                      <p className="muted round-recap-outcome">
                        <StarIcon className="round-recap-star-icon" />{' '}
                        {(entry.ratings.reduce((sum, r) => sum + r.stars, 0) / entry.ratings.length).toFixed(1)}/5
                        average
                      </p>
                    ) : (
                      <p className="muted round-recap-outcome">Nobody rated this performance.</p>
                    )
                  ) : entry.correctGuesserNames.length > 0 ? (
                    <p className="muted round-recap-outcome">{entry.correctGuesserNames.join(', ')} guessed it!</p>
                  ) : (
                    <p className="muted round-recap-outcome">Nobody guessed it.</p>
                  )}

                  {entry.audio && <audio controls src={entry.audio.url} className="round-recap-audio" />}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <button className="btn btn-primary btn-lg" onClick={onPlayAgain}>
        Play again
      </button>
    </div>
  );
}
