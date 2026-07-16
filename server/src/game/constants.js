export const GameState = Object.freeze({
  LOBBY: 'LOBBY',
  PROMPT_SELECTION: 'PROMPT_SELECTION',
  ACTOR_RECORDING: 'ACTOR_RECORDING',
  // TELEPHONE mode only: hop 2+ of the relay chain — the current relayer
  // listens to the previous hop's audio and re-records their best mimic of
  // it (never the original prompt, only the actual originator sees that).
  RELAY_RECORDING: 'RELAY_RECORDING',
  GUESSING_ACTIVE: 'GUESSING_ACTIVE',
  ROUND_REVEAL: 'ROUND_REVEAL',
  GAME_OVER: 'GAME_OVER',
});

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

// A game is configured once (round count + mode) when it starts, then plays
// through that many rounds before landing on GAME_OVER. A room can host many
// games back to back — GAME_OVER's "play again" returns to LOBBY to configure
// the next one.
export const VALID_ROUND_COUNTS = Object.freeze([1, 3, 5]);

export const PROMPT_OPTIONS_COUNT = 3;
export const PROMPT_SELECTION_DURATION_MS = 15_000;
export const RECORDING_DURATION_MS = 30_000;
export const GUESSING_DURATION_MS = 60_000;
export const REVEAL_DURATION_MS = 8_000;

// Transport-layer grace periods (not used by the pure state machine itself).
// Extra time allowed past RECORDING_DURATION_MS before the server force-aborts
// a round where the actor never submitted (e.g. they went AFK or disconnected
// without triggering the removePlayer path yet).
export const RECORDING_GRACE_MS = 5_000;
// How long a disconnected player's seat is held before they're removed for good.
export const DISCONNECT_GRACE_MS = 30_000;

export const VOICE_MODIFIERS = Object.freeze([
  'NONE',
  'ROBOT',
  'DEMON',
  'HIGH_PITCH',
  'CHIPMUNK',
  'ECHO',
  'DISTORT',
]);

// TELEPHONE mode forces this modifier on every hop of the relay chain —
// degradation there comes from human mimicry compounding, not from picking
// different effects, so the choice isn't left up to the players.
export const TELEPHONE_MODIFIER = 'DISTORT';

export const POINTS_CORRECT_GUESS = 100;
export const POINTS_ACTOR_PER_CORRECT_GUESSER = 25;

// Speed bonus decays linearly from MAX_SPEED_BONUS (an instant correct guess)
// to 0 (a correct guess right as the guessing timer runs out).
export const MAX_SPEED_BONUS = 50;

// Streak bonus rewards guessing correctly in consecutive rounds. Capped so a
// long game doesn't let one player's streak bonus dwarf the base points.
export const STREAK_BONUS_PER_LEVEL = 10;
export const MAX_STREAK_LEVEL = 5;

// A custom-prompt game needs at least enough prompts to fill one round's
// options; there's no server-side category to fall back on.
export const MIN_CUSTOM_PROMPTS = PROMPT_OPTIONS_COUNT;
export const MAX_CUSTOM_PROMPTS = 50;
export const MAX_CUSTOM_PROMPT_LENGTH = 60;
