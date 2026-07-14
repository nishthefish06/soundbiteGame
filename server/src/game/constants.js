export const GameState = Object.freeze({
  LOBBY: 'LOBBY',
  ACTOR_RECORDING: 'ACTOR_RECORDING',
  GUESSING_ACTIVE: 'GUESSING_ACTIVE',
  ROUND_REVEAL: 'ROUND_REVEAL',
});

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

export const RECORDING_DURATION_MS = 15_000;
export const GUESSING_DURATION_MS = 60_000;
export const REVEAL_DURATION_MS = 8_000;

export const VOICE_MODIFIERS = Object.freeze([
  'ROBOT',
  'DEMON',
  'HIGH_PITCH',
  'CHIPMUNK',
  'ECHO',
]);

export const POINTS_CORRECT_GUESS = 100;
export const POINTS_ACTOR_PER_CORRECT_GUESSER = 25;
