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
//
// WHO_SAID_IT mode has no single secret-holder for the prompt at all — every
// non-spectating player records the same one, so it's shown to everyone from
// the start. What *is* secret there is per-clip: which player recorded the
// clip currently playing (currentClipOwnerId) — known only to that clip's
// actual owner (so their client can show "that's you!" instead of a guess
// picker) until the whole round's clipResults are revealed at once.
export function redactSnapshotFor(snapshot, viewerId) {
  const isWhoSaidIt = snapshot.currentMode === 'WHO_SAID_IT';
  const originatorId = snapshot.chainOrder?.length > 0 ? snapshot.chainOrder[0] : snapshot.actorId;
  const isOriginator = viewerId === originatorId;
  const isRevealed = snapshot.state === GameState.ROUND_REVEAL;

  return {
    ...snapshot,
    currentPrompt: isWhoSaidIt || isOriginator || isRevealed ? snapshot.currentPrompt : null,
    promptOptions: isOriginator ? snapshot.promptOptions : [],
    // PERFORMANCE mode: individual star ratings must stay hidden from
    // everyone — actor included — until reveal, same as the prompt itself.
    ratings: isRevealed ? snapshot.ratings : [],
    currentClipOwnerId:
      isRevealed || viewerId === snapshot.currentClipOwnerId ? snapshot.currentClipOwnerId : null,
    clipResults: isRevealed ? snapshot.clipResults : [],
  };
}

// Guess chat must not leak the answer to players still guessing: a correct
// guess is announced without its text, an incorrect guess is safe to show
// verbatim since it isn't the answer.
export function redactGuessFor(guess, player) {
  const base = { playerId: guess.playerId, name: player?.name, correct: guess.correct, timestamp: guess.timestamp };
  return guess.correct ? base : { ...base, text: guess.text };
}
