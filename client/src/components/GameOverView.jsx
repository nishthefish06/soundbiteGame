export function GameOverView({ players, onPlayAgain }) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === topScore && topScore > 0);

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

      <button className="btn btn-primary btn-lg" onClick={onPlayAgain}>
        Play again
      </button>
    </div>
  );
}
