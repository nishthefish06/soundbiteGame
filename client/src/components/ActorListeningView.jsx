import { GuessChat } from './GuessChat.jsx';

export function ActorListeningView({ secondsLeft, chat, players, selfId, isSpectating = false }) {
  return (
    <div className="phase-view actor-listening-view">
      <div className="guessing-header">
        <h2>Guessers are listening…</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>
      <p className="muted">
        {isSpectating
          ? "You joined mid-game, so you're sitting this round out — just watch the chat roll in."
          : "You can't guess your own bit — just watch the chat roll in."}
      </p>
      <GuessChat chat={chat} players={players} selfId={selfId} />
    </div>
  );
}
