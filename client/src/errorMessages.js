// Maps server error codes (Error.message from socketServer.js/Room.js) to
// copy a player should actually see. Codes without an entry fall back to the
// raw code — better than a blank banner, though worth adding a mapping here
// if a new code turns out to be player-facing.
const ERROR_MESSAGES = {
  NAME_NOT_ALLOWED: "That name isn't allowed here — please choose another.",
  GUESS_NOT_ALLOWED: "That guess isn't allowed here — keep it clean and try again.",
  NOT_ENOUGH_CUSTOM_PROMPTS: 'Add a few more custom prompts before starting.',
  CUSTOM_PROMPT_TOO_LONG: "One of your prompts is too long — keep each one short.",
  CUSTOM_PROMPT_NOT_ALLOWED: "One of your prompts isn't allowed here — keep it clean and try again.",
};

export function friendlyError(code) {
  if (!code) return code;
  return ERROR_MESSAGES[code] ?? code;
}
