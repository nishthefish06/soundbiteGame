import { GuessChat } from './GuessChat.jsx';

// `subtext`, when provided, overrides the default "can't guess your own bit"
// copy — used by SONG_RECREATION mode's reuse of this view, where "bit"
// doesn't fit a composed track.
export function ActorListeningView({ secondsLeft, chat, players, selfId, isSpectating = false, subtext }) {
  const defaultSubtext = isSpectating
    ? "You joined mid-game, so you're sitting this round out — just watch the chat roll in."
    : "You can't guess your own bit — just watch the chat roll in.";
  return (
    <div className="phase-view actor-listening-view">
      <div className="guessing-header">
        <h2>Guessers are listening…</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>
      <p className="muted">{subtext ?? defaultSubtext}</p>
      <GuessChat chat={chat} players={players} selfId={selfId} />
    </div>
  );
}
