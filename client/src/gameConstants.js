// Mirrors server/src/game/constants.js — used only for local countdown
// display. The server is authoritative on all actual phase transitions;
// these values just drive the UI's visual timer.
export const PROMPT_OPTIONS_COUNT = 3;
export const PROMPT_SELECTION_DURATION_MS = 15_000;
export const RECORDING_PREP_DURATION_MS = 15_000;
export const RECORDING_DURATION_MS = 30_000;
export const GUESSING_DURATION_MS = 60_000;
export const RATING_DURATION_MS = 30_000;
export const GROUP_RECORDING_DURATION_MS = RECORDING_PREP_DURATION_MS + RECORDING_DURATION_MS;
export const MATCHING_DURATION_MS = 20_000;
export const REVEAL_DURATION_MS = 8_000;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const VALID_ROUND_COUNTS = [1, 3, 5];

export const MIN_CUSTOM_PROMPTS = 3;
export const MAX_CUSTOM_PROMPTS = 50;
export const MAX_CUSTOM_PROMPT_LENGTH = 60;

// Mirrors server/src/game/prompts.js's GAME_MODES/PromptCategory, plus CUSTOM,
// TELEPHONE, and WHO_SAID_IT (none has a static server-side category — CUSTOM's
// prompt list comes from the host at game-start time, TELEPHONE and
// WHO_SAID_IT both deal from the Sound Effect pool but play out as a relay
// chain / simultaneous everyone-records-at-once round instead of one
// recording) — display metadata only.
export const GAME_MODES = ['SOUND_EFFECT', 'CHARACTER', 'CUSTOM', 'TELEPHONE', 'PERFORMANCE', 'WHO_SAID_IT'];
export const GAME_MODE_META = {
  SOUND_EFFECT: { label: 'Sound Effect' },
  CHARACTER: { label: 'Character' },
  CUSTOM: { label: 'Custom' },
  TELEPHONE: { label: 'Telephone' },
  PERFORMANCE: { label: 'Act It Out' },
  WHO_SAID_IT: { label: 'Who Said It?' },
};
