import { GuessChat } from './GuessChat.jsx';

export function ActorListeningView({ secondsLeft, chat, players, selfId }) {
  return (
    <div className="phase-view actor-listening-view">
      <div className="guessing-header">
        <h2>Guessers are listening…</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>
      <p className="muted">You can't guess your own bit — just watch the chat roll in.</p>
      <GuessChat chat={chat} players={players} selfId={selfId} />
    </div>
  );
}
