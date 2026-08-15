import { useState } from 'react';
import { GuessChat } from './GuessChat.jsx';

// `heading`/`placeholder`, when provided, override the default MicDrop
// copy — used by SONG_RECREATION mode's reuse of this view (see App.jsx's
// SONG_REVEAL_ACTIVE case). The input/chat/scoring mechanism itself is
// unchanged either way — Room.js's submitGuess is what actually tells song
// guesses apart, not anything client-side.
export function GuessingView({
  incomingAudio,
  secondsLeft,
  alreadyCorrect,
  chat,
  players,
  selfId,
  onSubmitGuess,
  heading = "What's the bit?",
  placeholder = 'Type your guess…',
}) {
  const [text, setText] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || alreadyCorrect) return;
    await onSubmitGuess(text);
    setText('');
  }

  return (
    <div className="phase-view guessing-view">
      <div className="guessing-header">
        <h2>{heading}</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>

      {incomingAudio ? (
        <audio controls autoPlay src={incomingAudio.url} className="incoming-audio" />
      ) : (
        <p className="muted">Waiting for the audio to arrive…</p>
      )}

      {alreadyCorrect ? (
        <p className="success-text">🎉 You got it! Waiting for everyone else…</p>
      ) : (
        <form className="guess-form" onSubmit={handleSubmit}>
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Guess</button>
        </form>
      )}

      <GuessChat chat={chat} players={players} selfId={selfId} />
    </div>
  );
}
