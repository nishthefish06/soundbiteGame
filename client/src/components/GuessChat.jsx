export function GuessChat({ chat, players, selfId }) {
  function nameFor(id) {
    if (id === selfId) return 'You';
    return players.find((p) => p.id === id)?.name ?? 'Someone';
  }

  return (
    <ul className="guess-chat">
      {chat.length === 0 && <li className="guess-chat-empty">No guesses yet…</li>}
      {chat.map((g, i) => (
        <li key={i} className={`guess-chat-row ${g.correct ? 'guess-chat-correct' : ''}`}>
          <span className="guess-chat-name">{nameFor(g.playerId)}</span>
          <span className="guess-chat-text">
            {g.correct ? '🎉 guessed it!' : g.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
