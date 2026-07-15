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
