import { useState } from 'react';
import { StarIcon } from './icons.jsx';
import { computeSuperlatives } from '../gameSuperlatives.js';

export function GameOverView({ players, roundHistory, onPlayAgain }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === topScore && topScore > 0);
  const [showRecap, setShowRecap] = useState(false);
  const superlatives = computeSuperlatives(roundHistory, players);

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

      {superlatives.length > 0 && (
        <ul className="superlatives-row">
          {superlatives.map((s) => (
            <li key={s.key} className="superlative-card">
              <span className="superlative-emoji">{s.emoji}</span>
              <span className="superlative-title">{s.title}</span>
              <span className="superlative-name">{s.name}</span>
              <span className="muted superlative-detail">{s.detail}</span>
            </li>
          ))}
        </ul>
      )}

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
                  ) : entry.mode === 'WHO_SAID_IT' ? (
                    <ul className="round-recap-clip-list">
                      {entry.clipResults.map((result, i) => (
                        <li key={i} className="muted round-recap-outcome">
                          Clip {i + 1}: {result.ownerName} —{' '}
                          {result.correctGuesserNames.length > 0
                            ? `caught by ${result.correctGuesserNames.join(', ')}`
                            : 'nobody guessed it'}
                        </li>
                      ))}
                    </ul>
                  ) : entry.mode === 'SONG_RECREATION' ? (
                    <ul className="round-recap-clip-list">
                      {entry.songResults.map((result, i) => (
                        <li key={i} className="muted round-recap-outcome">
                          {result.composerName} recreated {result.title} — {result.artist} —{' '}
                          {result.correctGuesserNames.length > 0
                            ? `solved by ${result.correctGuesserNames.join(', ')}`
                            : 'nobody fully solved it'}
                        </li>
                      ))}
                    </ul>
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
