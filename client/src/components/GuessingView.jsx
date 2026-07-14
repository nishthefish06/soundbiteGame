import { useState } from 'react';
import { GuessChat } from './GuessChat.jsx';

export function GuessingView({ incomingAudio, secondsLeft, alreadyCorrect, chat, players, selfId, onSubmitGuess }) {
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
        <h2>What's the bit?</h2>
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
            placeholder="Type your guess…"
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Guess</button>
        </form>
      )}

      <GuessChat chat={chat} players={players} selfId={selfId} />
    </div>
  );
}
