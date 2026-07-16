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
} from './constants.js';
import { GAME_MODES, createPromptDeck, createPromptDecks } from './prompts.js';

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

    const player = { id, name, score: 0, connected: true };
    this.players.set(id, player);
    this.actorOrder.push(id);
    this._emitPlayersChanged();
    return player;
  }

  removePlayer(id) {
    if (!this.players.has(id)) return;

    const wasActor = this.actorId === id;
    this.players.delete(id);
    this.actorOrder = this.actorOrder.filter((pid) => pid !== id);

    if (wasActor && this.state !== GameState.LOBBY && this.state !== GameState.GAME_OVER) {
      // Actor disappeared mid-round: skip this round rather than guess who's next.
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
  startGame(totalRounds, mode) {
    this._assertState(GameState.LOBBY);
    if (this.playerCount < MIN_PLAYERS) {
      throw new Error('NOT_ENOUGH_PLAYERS');
    }
    if (!VALID_ROUND_COUNTS.includes(totalRounds)) {
      throw new Error('INVALID_ROUND_COUNT');
    }
    if (!GAME_MODES.includes(mode)) {
      throw new Error('INVALID_MODE');
    }

    this.totalRounds = totalRounds;
    this.currentMode = mode;
    this.roundNumber = 0;
    for (const player of this.playerList) player.score = 0;
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
    this._assertState(GameState.ACTOR_RECORDING);
    this._assertActor(actorId);
    if (!VOICE_MODIFIERS.includes(modifier)) {
      throw new Error('INVALID_MODIFIER');
    }

    this.currentModifier = modifier;
    this._transition(GameState.GUESSING_ACTIVE);
  }

  submitGuess(playerId, rawText) {
    this._assertState(GameState.GUESSING_ACTIVE);
    if (!this.players.has(playerId)) throw new Error('UNKNOWN_PLAYER');
    if (playerId === this.actorId) throw new Error('ACTOR_CANNOT_GUESS');
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
      guesser.score += POINTS_CORRECT_GUESS;
      const actor = this.players.get(this.actorId);
      if (actor) actor.score += POINTS_ACTOR_PER_CORRECT_GUESSER;
      this._emitPlayersChanged();

      const everyoneGuessed = this.correctGuesserIds.size === this.playerCount - 1;
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
      currentModifier: this.currentModifier,
      promptOptions: this.promptOptions,
      currentPrompt: this.currentPrompt,
      correctGuesserIds: [...this.correctGuesserIds],
      players: this.playerList.map(({ id, name, score, connected }) => ({
        id,
        name,
        score,
        connected,
      })),
    };
  }

  // -- internals --

  _advanceActor() {
    const next = this.actorOrder.shift();
    this.actorOrder.push(next);
    this.actorId = next;
  }

  _startNextRound() {
    this.roundNumber += 1;
    this._advanceActor();

    const deck = this.promptDecks[this.currentMode];
    if (deck.length < PROMPT_OPTIONS_COUNT) {
      this.promptDecks[this.currentMode] = createPromptDeck(this.currentMode);
    }
    this.promptOptions = this.promptDecks[this.currentMode].splice(-PROMPT_OPTIONS_COUNT);
    this.currentPrompt = null;
    this.currentModifier = null;
    this.guesses = [];
    this.correctGuesserIds = new Set();

    this._transition(GameState.PROMPT_SELECTION);
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
    this.promptOptions = [];
    this.currentPrompt = null;
    this.currentPromptAnswers = [];
    this.currentModifier = null;
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
    if (this.state !== expected) {
      throw new Error(`INVALID_STATE: expected ${expected}, got ${this.state}`);
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
