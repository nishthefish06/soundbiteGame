import { EventEmitter } from 'node:events';
import {
  GameState,
  MIN_PLAYERS,
  MAX_PLAYERS,
  VALID_ROUND_COUNTS,
  PROMPT_OPTIONS_COUNT,
  VOICE_MODIFIERS,
  POINTS_CORRECT_GUESS,
  POINTS_ACTOR_PER_CORRECT_GUESSER,
  GUESSING_DURATION_MS,
  MAX_SPEED_BONUS,
  STREAK_BONUS_PER_LEVEL,
  MAX_STREAK_LEVEL,
  MIN_CUSTOM_PROMPTS,
  TELEPHONE_MODIFIER,
} from './constants.js';
import { GAME_MODES, createPromptDeck, createPromptDecks } from './prompts.js';

// Neither is a static server-side category like SOUND_EFFECT/CHARACTER, so
// both are handled as special cases everywhere GAME_MODES would otherwise be
// consulted. CUSTOM's prompt list comes from the host at game-start time.
// TELEPHONE deals from an existing category (see TELEPHONE_SOURCE_CATEGORY)
// but plays out as a relay chain instead of a single recording.
const CUSTOM_MODE = 'CUSTOM';
const TELEPHONE_MODE = 'TELEPHONE';
const TELEPHONE_SOURCE_CATEGORY = 'SOUND_EFFECT';

// Pure, transport-agnostic game state machine for a single room.
// Holds no socket/timer references; the transport layer wires timers
// (recording/guessing timeouts) to endGuessing()/etc. and relays the
// events emitted here out over Socket.io.
//
// Hierarchy: a Room hosts a series of Games (one at a time); a Game is a
// fixed number of Rounds all played in the same mode. LOBBY is where a game
// gets configured and started; GAME_OVER is where one just ended and the
// room decides whether to configure another.
export class Room {
  constructor(code) {
    this.code = code;
    this.emitter = new EventEmitter();

    this.players = new Map(); // id -> { id, name, score, connected }
    this.actorOrder = []; // rotation queue of player ids

    this.state = GameState.LOBBY;
    this.totalRounds = 0;
    this.roundNumber = 0;
    this.currentMode = null;
    this.actorId = null;
    this.promptOptions = [];
    this.currentPrompt = null;
    this.currentPromptAnswers = []; // accepted guesses for currentPrompt — never serialized
    this.currentModifier = null;
    this.promptDecks = createPromptDecks(); // one deck per game mode
    this.customPromptSource = []; // host's submitted list, for CUSTOM mode — kept around so the deck can reshuffle once exhausted
    this.customPromptDeck = [];
    // TELEPHONE mode only: the players relaying this round, originator first.
    // Empty for every other mode — redaction and scoring both fall back to
    // treating `actorId` alone as "the performer(s)" when this is empty.
    this.chainOrder = [];
    this.chainIndex = 0;
    this.guessingStartedAt = null;
    this.guesses = [];
    this.correctGuesserIds = new Set();
  }

  on(event, listener) {
    this.emitter.on(event, listener);
    return this;
  }

  off(event, listener) {
    this.emitter.off(event, listener);
    return this;
  }

  get playerList() {
    return [...this.players.values()];
  }

  get playerCount() {
    return this.players.size;
  }

  // -- roster management --

  addPlayer(id, name) {
    const existing = this.players.get(id);
    if (existing) return existing;

    if (this.playerCount >= MAX_PLAYERS) {
      throw new Error('ROOM_FULL');
    }

    const player = { id, name, score: 0, connected: true, streak: 0 };
    this.players.set(id, player);
    this.actorOrder.push(id);
    this._emitPlayersChanged();
    return player;
  }

  removePlayer(id) {
    if (!this.players.has(id)) return;

    // In TELEPHONE mode the round depends on every chain member, not just
    // whoever currently holds the mic — any of them leaving breaks the chain.
    const wasPerforming = this.actorId === id || this.chainOrder.includes(id);
    this.players.delete(id);
    this.actorOrder = this.actorOrder.filter((pid) => pid !== id);

    if (wasPerforming && this.state !== GameState.LOBBY && this.state !== GameState.GAME_OVER) {
      // Actor/relayer disappeared mid-round: skip this round rather than guess who's next.
      this.abortRound();
      return;
    }

    this._emitPlayersChanged();
  }

  // Skips the current round without awarding anything, then continues the
  // game (next round) or ends it, same as a normal reveal would. Used when
  // the actor disconnects, or by the transport layer as a server-side
  // backstop if the actor never submits in time.
  abortRound() {
    if (this.state === GameState.LOBBY || this.state === GameState.GAME_OVER) return;
    this._advanceRoundOrEndGame();
  }

  markDisconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
    this._emitPlayersChanged();
  }

  markReconnected(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = true;
    this._emitPlayersChanged();
  }

  // -- game/round flow --

  // Configures and kicks off a new game: a fixed number of rounds, all in the
  // same mode. Scores reset — each game is its own contest.
  startGame(totalRounds, mode, customPrompts = []) {
    this._assertState(GameState.LOBBY);
    if (this.playerCount < MIN_PLAYERS) {
      throw new Error('NOT_ENOUGH_PLAYERS');
    }
    if (!VALID_ROUND_COUNTS.includes(totalRounds)) {
      throw new Error('INVALID_ROUND_COUNT');
    }
    if (mode !== CUSTOM_MODE && mode !== TELEPHONE_MODE && !GAME_MODES.includes(mode)) {
      throw new Error('INVALID_MODE');
    }

    if (mode === CUSTOM_MODE) {
      if (!Array.isArray(customPrompts) || customPrompts.length < MIN_CUSTOM_PROMPTS) {
        throw new Error('NOT_ENOUGH_CUSTOM_PROMPTS');
      }
      this.customPromptSource = customPrompts.map((text) => ({ text, synonyms: [] }));
      this.customPromptDeck = shuffle([...this.customPromptSource]);
    }

    this.totalRounds = totalRounds;
    this.currentMode = mode;
    this.roundNumber = 0;
    for (const player of this.playerList) {
      player.score = 0;
      player.streak = 0;
    }
    this._emitPlayersChanged();

    this._startNextRound();
  }

  selectPrompt(actorId, promptText) {
    this._assertState(GameState.PROMPT_SELECTION);
    this._assertActor(actorId);
    const chosen = this.promptOptions.find((option) => option.text === promptText);
    if (!chosen) {
      throw new Error('INVALID_PROMPT_CHOICE');
    }

    this.currentPrompt = chosen.text;
    this.currentPromptAnswers = [chosen.text, ...chosen.synonyms];
    this.promptOptions = [];
    this._transition(GameState.ACTOR_RECORDING);
  }

  submitRecording(actorId, modifier) {
    this._assertState([GameState.ACTOR_RECORDING, GameState.RELAY_RECORDING]);
    this._assertActor(actorId);

    const isTelephone = this.currentMode === TELEPHONE_MODE;
    if (isTelephone) {
      if (modifier !== TELEPHONE_MODIFIER) throw new Error('INVALID_MODIFIER');
    } else if (!VOICE_MODIFIERS.includes(modifier)) {
      throw new Error('INVALID_MODIFIER');
    }

    this.currentModifier = modifier;

    if (isTelephone && this.chainIndex < this.chainOrder.length - 1) {
      // More hops to go — the next chain member relays what they just heard.
      this.chainIndex += 1;
      this.actorId = this.chainOrder[this.chainIndex];
      this._transition(GameState.RELAY_RECORDING);
      return;
    }

    this.guessingStartedAt = Date.now();
    this._transition(GameState.GUESSING_ACTIVE);
  }

  submitGuess(playerId, rawText) {
    this._assertState(GameState.GUESSING_ACTIVE);
    if (!this.players.has(playerId)) throw new Error('UNKNOWN_PLAYER');
    if (this._performerIds().has(playerId)) throw new Error('ACTOR_CANNOT_GUESS');
    if (this.correctGuesserIds.has(playerId)) throw new Error('ALREADY_GUESSED_CORRECTLY');

    const guessWords = significantWords(rawText);
    const correct =
      guessWords.length > 0 &&
      this.currentPromptAnswers.some((answer) => {
        const answerWords = significantWords(answer);
        return guessWords.every((word) => answerWords.includes(word));
      });
    const guess = { playerId, text: rawText, correct, timestamp: Date.now() };
    this.guesses.push(guess);
    this.emitter.emit('guess', { room: this.code, guess });

    if (correct) {
      this.correctGuesserIds.add(playerId);

      const guesser = this.players.get(playerId);
      const speedBonus = this._speedBonus();
      const streakBonus = Math.min(guesser.streak, MAX_STREAK_LEVEL) * STREAK_BONUS_PER_LEVEL;
      guesser.score += POINTS_CORRECT_GUESS + speedBonus + streakBonus;

      // Every performer (the lone actor normally, the whole relay chain in
      // TELEPHONE mode) shares credit for each correct guess.
      for (const performerId of this._performerIds()) {
        const performer = this.players.get(performerId);
        if (performer) performer.score += POINTS_ACTOR_PER_CORRECT_GUESSER;
      }
      this._emitPlayersChanged();

      const everyoneGuessed = this.correctGuesserIds.size === this.playerCount - this._performerIds().size;
      if (everyoneGuessed) {
        this._transition(GameState.ROUND_REVEAL);
      }
    }

    return guess;
  }

  // Called by the transport layer when the guessing timer runs out.
  endGuessing() {
    this._assertState(GameState.GUESSING_ACTIVE);
    this._transition(GameState.ROUND_REVEAL);
  }

  // Continues to the next round, or ends the game if that was the last one.
  finishReveal() {
    this._assertState(GameState.ROUND_REVEAL);
    this._updateStreaks();
    this._advanceRoundOrEndGame();
  }

  // From GAME_OVER, back to LOBBY to configure another game in this room.
  returnToLobby() {
    this._assertState(GameState.GAME_OVER);
    this._resetGame();
    this._transition(GameState.LOBBY);
  }

  // Snapshot safe to broadcast. currentMode/totalRounds are never sensitive
  // (everyone can see what kind of game this is); currentPrompt/promptOptions
  // are included for the transport layer to redact per-recipient (only the
  // actor ever sees promptOptions; currentPrompt is visible to the actor and,
  // once revealed, to everyone).
  toJSON() {
    return {
      code: this.code,
      state: this.state,
      totalRounds: this.totalRounds,
      roundNumber: this.roundNumber,
      currentMode: this.currentMode,
      actorId: this.actorId,
      chainOrder: this.chainOrder,
      currentModifier: this.currentModifier,
      promptOptions: this.promptOptions,
      currentPrompt: this.currentPrompt,
      correctGuesserIds: [...this.correctGuesserIds],
      players: this.playerList.map(({ id, name, score, connected, streak }) => ({
        id,
        name,
        score,
        connected,
        streak,
      })),
    };
  }

  // -- internals --

  _advanceActor() {
    const next = this.actorOrder.shift();
    this.actorOrder.push(next);
    this.actorId = next;
  }

  // TELEPHONE mode's chain length scales with room size: roughly half the
  // room relays, half guesses, with at least 2 in the chain (an originator
  // plus one relayer — otherwise there's no "telephone" effect at all) and
  // always at least 1 player left over to guess.
  _telephoneChainLength() {
    const n = this.playerCount;
    return Math.min(n - 1, Math.max(2, Math.round(n / 2)));
  }

  // Rotates the same fairness queue single-actor rotation uses, then takes a
  // window of `chainLength` consecutive players as this round's chain — so
  // both who starts the chain and who else is in it shift round to round.
  _advanceChain(chainLength) {
    const next = this.actorOrder.shift();
    this.actorOrder.push(next);
    this.chainOrder = [next, ...this.actorOrder.slice(0, chainLength - 1)];
    this.chainIndex = 0;
    this.actorId = next;
  }

  // "Performers" are whoever isn't eligible to guess this round: the lone
  // actor normally, or the whole relay chain in TELEPHONE mode.
  _performerIds() {
    return this.currentMode === TELEPHONE_MODE ? new Set(this.chainOrder) : new Set([this.actorId]);
  }

  _startNextRound() {
    this.roundNumber += 1;

    if (this.currentMode === TELEPHONE_MODE) {
      this._advanceChain(this._telephoneChainLength());
    } else {
      this.chainOrder = [];
      this.chainIndex = 0;
      this._advanceActor();
    }

    if (this.currentMode === CUSTOM_MODE) {
      if (this.customPromptDeck.length < PROMPT_OPTIONS_COUNT) {
        this.customPromptDeck = shuffle([...this.customPromptSource]);
      }
      this.promptOptions = this.customPromptDeck.splice(-PROMPT_OPTIONS_COUNT);
    } else if (this.currentMode === TELEPHONE_MODE) {
      const deck = this.promptDecks[TELEPHONE_SOURCE_CATEGORY];
      if (deck.length < PROMPT_OPTIONS_COUNT) {
        this.promptDecks[TELEPHONE_SOURCE_CATEGORY] = createPromptDeck(TELEPHONE_SOURCE_CATEGORY);
      }
      this.promptOptions = this.promptDecks[TELEPHONE_SOURCE_CATEGORY].splice(-PROMPT_OPTIONS_COUNT);
    } else {
      const deck = this.promptDecks[this.currentMode];
      if (deck.length < PROMPT_OPTIONS_COUNT) {
        this.promptDecks[this.currentMode] = createPromptDeck(this.currentMode);
      }
      this.promptOptions = this.promptDecks[this.currentMode].splice(-PROMPT_OPTIONS_COUNT);
    }
    this.currentPrompt = null;
    this.currentModifier = null;
    this.guessingStartedAt = null;
    this.guesses = [];
    this.correctGuesserIds = new Set();

    this._transition(GameState.PROMPT_SELECTION);
  }

  // Elapsed time is measured from when the recording was submitted (i.e. when
  // guessing actually opened), decaying linearly to 0 by the time the
  // guessing timer would run out.
  _speedBonus() {
    if (!this.guessingStartedAt) return 0;
    const elapsed = Date.now() - this.guessingStartedAt;
    const remainingFrac = Math.max(0, 1 - elapsed / GUESSING_DURATION_MS);
    return Math.round(MAX_SPEED_BONUS * remainingFrac);
  }

  // Called once a round's guessing has actually concluded (not when a round
  // is skipped/aborted before anyone got to guess). Guessers who nailed this
  // round build their streak; everyone else's resets. Performers don't guess
  // this round, so their streak carries over untouched.
  _updateStreaks() {
    const performers = this._performerIds();
    for (const player of this.playerList) {
      if (performers.has(player.id)) continue;
      player.streak = this.correctGuesserIds.has(player.id) ? player.streak + 1 : 0;
    }
    this._emitPlayersChanged();
  }

  _advanceRoundOrEndGame() {
    if (this.roundNumber < this.totalRounds) {
      this._startNextRound();
    } else {
      this._resetRound();
      this._transition(GameState.GAME_OVER);
    }
  }

  _resetRound() {
    this.actorId = null;
    this.chainOrder = [];
    this.chainIndex = 0;
    this.promptOptions = [];
    this.currentPrompt = null;
    this.currentPromptAnswers = [];
    this.currentModifier = null;
    this.guessingStartedAt = null;
    this.guesses = [];
    this.correctGuesserIds = new Set();
  }

  _resetGame() {
    this.totalRounds = 0;
    this.currentMode = null;
    this.roundNumber = 0;
    this._resetRound();
  }

  _assertState(expected) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(this.state)) {
      throw new Error(`INVALID_STATE: expected ${allowed.join(' or ')}, got ${this.state}`);
    }
  }

  _assertActor(id) {
    if (this.actorId !== id) throw new Error('NOT_ACTOR');
  }

  _transition(next) {
    const prev = this.state;
    this.state = next;
    this.emitter.emit('stateChange', { room: this.code, prev, next, snapshot: this.toJSON() });
  }

  _emitPlayersChanged() {
    this.emitter.emit('playersChanged', { room: this.code, players: this.playerList });
  }
}

// CUSTOM mode's prompt list is short and player-submitted, so it gets its own
// shuffle here rather than reusing prompts.js's createPromptDeck, which
// shuffles a fixed static category array.
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ') // hyphens are word separators ("dial-up" ~ "dial up"), not just noise to drop
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Filler words a guesser naturally drops ("snapping" for "Snapping your
// fingers") that shouldn't be required for a match.
const STOPWORDS = new Set(['a', 'an', 'the', 'your', 'is', 'on', 'in', 'at', 'to', 'of', 'and']);

// A guess is correct if every word it contains also appears in the answer —
// so a guess can be a shorter/partial phrasing of the answer, but can't add
// words the answer doesn't have. Keeps the curated `synonyms` list for
// genuinely different phrasings (nicknames, alternate wording) while no
// longer requiring every subset of an answer's words to be enumerated by hand.
function significantWords(str) {
  return normalize(str)
    .split(' ')
    .filter((word) => word && !STOPWORDS.has(word));
}
