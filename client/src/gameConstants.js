// Mirrors server/src/game/constants.js — used only for local countdown
// display. The server is authoritative on all actual phase transitions;
// these values just drive the UI's visual timer.
export const PROMPT_OPTIONS_COUNT = 3;
export const PROMPT_SELECTION_DURATION_MS = 15_000;
export const RECORDING_DURATION_MS = 30_000;
export const GUESSING_DURATION_MS = 60_000;
export const REVEAL_DURATION_MS = 8_000;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const VALID_ROUND_COUNTS = [3, 5, 10];

// Mirrors server/src/game/prompts.js's GAME_MODES/PromptCategory — display metadata only.
export const GAME_MODES = ['SOUND_EFFECT', 'CHARACTER'];
export const GAME_MODE_META = {
  SOUND_EFFECT: { label: 'Sound Effect' },
  CHARACTER: { label: 'Character' },
};
