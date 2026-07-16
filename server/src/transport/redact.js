import { GameState } from '../game/constants.js';

// A room snapshot includes currentPrompt so the actor (and everyone, once
// revealed) can see it, but active guessers must not — that's the whole game.
// promptOptions (the 3 choices offered during selection) are never anyone's
// business but the actor's, in any phase. Kept separate from Room so the
// state machine itself never has to reason about "who is this being sent to."
//
// In TELEPHONE mode `actorId` cycles through the whole relay chain as hops
// pass, but only the chain's first member (chainOrder[0], the originator)
// ever actually saw the prompt — every other hop only ever hears audio. So
// "who can see the prompt" is the originator specifically, not whoever
// currently holds the mic. chainOrder is empty for every other mode, where
// this falls back to today's actorId-based rule.
export function redactSnapshotFor(snapshot, viewerId) {
  const originatorId = snapshot.chainOrder?.length > 0 ? snapshot.chainOrder[0] : snapshot.actorId;
  const isOriginator = viewerId === originatorId;
  const isRevealed = snapshot.state === GameState.ROUND_REVEAL;

  return {
    ...snapshot,
    currentPrompt: isOriginator || isRevealed ? snapshot.currentPrompt : null,
    promptOptions: isOriginator ? snapshot.promptOptions : [],
  };
}

// Guess chat must not leak the answer to players still guessing: a correct
// guess is announced without its text, an incorrect guess is safe to show
// verbatim since it isn't the answer.
export function redactGuessFor(guess, player) {
  const base = { playerId: guess.playerId, name: player?.name, correct: guess.correct, timestamp: guess.timestamp };
  return guess.correct ? base : { ...base, text: guess.text };
}
