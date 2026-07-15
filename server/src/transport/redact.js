import { GameState } from '../game/constants.js';

// A room snapshot includes currentPrompt so the actor (and everyone, once
// revealed) can see it, but active guessers must not — that's the whole game.
// promptOptions (the 3 choices offered during selection) are never anyone's
// business but the actor's, in any phase. Kept separate from Room so the
// state machine itself never has to reason about "who is this being sent to."
export function redactSnapshotFor(snapshot, viewerId) {
  const isActor = viewerId === snapshot.actorId;
  const isRevealed = snapshot.state === GameState.ROUND_REVEAL;

  return {
    ...snapshot,
    currentPrompt: isActor || isRevealed ? snapshot.currentPrompt : null,
    promptOptions: isActor ? snapshot.promptOptions : [],
  };
}

// Guess chat must not leak the answer to players still guessing: a correct
// guess is announced without its text, an incorrect guess is safe to show
// verbatim since it isn't the answer.
export function redactGuessFor(guess, player) {
  const base = { playerId: guess.playerId, name: player?.name, correct: guess.correct, timestamp: guess.timestamp };
  return guess.correct ? base : { ...base, text: guess.text };
}
