// WHO_SAID_IT mode's guessing view: one clip plays at a time (via
// incomingAudio, same as GuessingView) and everyone but that clip's owner
// picks who they think recorded it from the roster, instead of typing a
// free-text guess. isClipOwner/alreadyGuessed both come from useGameRoom's
// snapshot fields, not local state — MATCHING_ACTIVE is re-entered once per
// clip without unmounting this component, so state has to live server-side.
export function MatchingView({
  incomingAudio,
  secondsLeft,
  isClipOwner,
  isSpectating,
  alreadyGuessed,
  players,
  selfId,
  recordedPlayerIds,
  clipNumber,
  totalClips,
  onSubmitMatchGuess,
}) {
  // Restricted to players who actually recorded a clip this round — a
  // straggler who never submitted (e.g. lost mic access, or the phase timer
  // moved on without them) isn't a valid guess target and the server would
  // reject picking them with INVALID_GUESS_TARGET.
  const candidates = players.filter((p) => recordedPlayerIds.includes(p.id) && p.id !== selfId);

  return (
    <div className="phase-view matching-view">
      <div className="guessing-header">
        <h2>Who said it?</h2>
        {secondsLeft != null && <span className="timer-pill">{secondsLeft}s</span>}
      </div>
      {clipNumber != null && totalClips != null && (
        <p className="eyebrow">Clip {clipNumber} of {totalClips}</p>
      )}

      {incomingAudio ? (
        <audio controls autoPlay src={incomingAudio.url} className="incoming-audio" />
      ) : (
        <p className="muted">Waiting for the audio to arrive…</p>
      )}

      {isClipOwner ? (
        <p className="success-text">🎭 That's you! Sit back while everyone else guesses.</p>
      ) : isSpectating ? (
        <p className="muted">You joined mid-game, so you're sitting this round out.</p>
      ) : alreadyGuessed ? (
        <p className="success-text">Guess in — waiting for everyone else…</p>
      ) : (
        <div className="match-guess-grid">
          {candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              className="match-guess-option"
              onClick={() => onSubmitMatchGuess(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
