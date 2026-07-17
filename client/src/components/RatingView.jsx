import { useState } from 'react';
import { StarPicker } from './StarPicker.jsx';

export function RatingView({ incomingAudio, secondsLeft, ratingProgress, onSubmitRating }) {
  const [stars, setStars] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stars || submitted) return;
    const res = await onSubmitRating(stars);
    if (res?.ok) setSubmitted(true);
  }

  return (
    <div className="phase-view rating-view">
      <div className="guessing-header">
        <h2>Rate the performance</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>

      {incomingAudio ? (
        <audio controls autoPlay src={incomingAudio.url} className="incoming-audio" />
      ) : (
        <p className="muted">Waiting for the audio to arrive…</p>
      )}

      {submitted ? (
        <p className="success-text">
          🌟 Rating submitted! {ratingProgress ? `${ratingProgress.count}/${ratingProgress.total} rated so far…` : 'Waiting for everyone else…'}
        </p>
      ) : (
        <form className="rating-form" onSubmit={handleSubmit}>
          <StarPicker value={stars} onChange={setStars} />
          <button className="btn btn-primary" type="submit" disabled={!stars}>
            Submit rating
          </button>
        </form>
      )}
    </div>
  );
}
