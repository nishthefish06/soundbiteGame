// Maps server error codes (Error.message from socketServer.js/Room.js) to
// copy a player should actually see. Codes without an entry fall back to the
// raw code — better than a blank banner, though worth adding a mapping here
// if a new code turns out to be player-facing.
const ERROR_MESSAGES = {
  // Join/create
  ROOM_NOT_FOUND: "That room doesn't exist (or the game already ended) — double check the code.",
  ROOM_FULL: 'That room is full (max 8 players).',
  INVALID_NAME: 'Enter a name first.',
  NAME_TOO_LONG: "That name's too long — keep it under 20 characters.",
  NAME_NOT_ALLOWED: "That name isn't allowed here — please choose another.",

  // Starting a game
  NOT_ENOUGH_PLAYERS: 'You need at least 3 players to start.',
  INVALID_ROUND_COUNT: 'Pick a valid number of rounds.',
  INVALID_MODE: 'Pick a valid game mode.',
  NOT_ENOUGH_CUSTOM_PROMPTS: 'Add a few more custom prompts before starting.',
  CUSTOM_PROMPT_TOO_LONG: 'One of your prompts is too long — keep each one short.',
  CUSTOM_PROMPT_NOT_ALLOWED: "One of your prompts isn't allowed here — keep it clean and try again.",
  INVALID_CUSTOM_PROMPTS: 'Something went wrong with your prompt list — try again.',

  // Prompt selection / recording
  INVALID_PROMPT_CHOICE: "That prompt wasn't offered — pick one of the options shown.",
  INVALID_MODIFIER: 'Pick a valid voice effect.',
  MISSING_AUDIO: "Your recording didn't come through — try recording again.",
  NOT_ACTOR: "It's not your turn.",

  // Guessing
  INVALID_GUESS: 'Type something before guessing.',
  GUESS_NOT_ALLOWED: "That guess isn't allowed here — keep it clean and try again.",
  ACTOR_CANNOT_GUESS: "You can't guess on your own turn.",
  ALREADY_GUESSED_CORRECTLY: 'You already guessed this one right!',

  // Rating (Act It Out mode)
  ACTOR_CANNOT_RATE: "You can't rate your own performance.",
  INVALID_RATING: 'Pick a star rating from 1 to 5.',
  ALREADY_RATED: 'You already rated this one!',

  // Host controls
  NOT_HOST: 'Only the host can do that.',
  KICKED: 'You were removed from this room by the host.',
  CANNOT_KICK_SELF: "You can't kick yourself.",
  ALREADY_HOST: "They're already the host.",

  // Rare/defensive — shouldn't come up through normal use of the UI
  UNKNOWN_PLAYER: 'Something went wrong — try refreshing the page.',
  INVALID_PLAYER_ID: 'Something went wrong — try refreshing the page.',
};

export function friendlyError(code) {
  if (!code) return code;
  if (code.startsWith('INVALID_STATE')) return 'That action came in too late — the room already moved on.';
  return ERROR_MESSAGES[code] ?? code;
}
