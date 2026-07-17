// Mirrors server/src/game/constants.js — used only for local countdown
// display. The server is authoritative on all actual phase transitions;
// these values just drive the UI's visual timer.
export const PROMPT_OPTIONS_COUNT = 3;
export const PROMPT_SELECTION_DURATION_MS = 15_000;
export const RECORDING_PREP_DURATION_MS = 15_000;
export const RECORDING_DURATION_MS = 30_000;
export const GUESSING_DURATION_MS = 60_000;
export const RATING_DURATION_MS = 30_000;
export const REVEAL_DURATION_MS = 8_000;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const VALID_ROUND_COUNTS = [1, 3, 5];

export const MIN_CUSTOM_PROMPTS = 3;
export const MAX_CUSTOM_PROMPTS = 50;

// Mirrors server/src/game/prompts.js's GAME_MODES/PromptCategory, plus CUSTOM
// and TELEPHONE (neither has a static server-side category — CUSTOM's prompt
// list comes from the host at game-start time, TELEPHONE deals from the
// Sound Effect pool but plays out as a relay chain instead of one recording)
// — display metadata only.
export const GAME_MODES = ['SOUND_EFFECT', 'CHARACTER', 'CUSTOM', 'TELEPHONE', 'PERFORMANCE'];
export const GAME_MODE_META = {
  SOUND_EFFECT: { label: 'Sound Effect' },
  CHARACTER: { label: 'Character' },
  CUSTOM: { label: 'Custom' },
  TELEPHONE: { label: 'Telephone' },
  PERFORMANCE: { label: 'Showtime' },
};
