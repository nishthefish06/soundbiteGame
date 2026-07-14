import { EventEmitter } from 'node:events';
import {
  GameState,
  MIN_PLAYERS,
  MAX_PLAYERS,
  VOICE_MODIFIERS,
  POINTS_CORRECT_GUESS,
  POINTS_ACTOR_PER_CORRECT_GUESSER,
} from './constants.js';
import { createPromptDeck } from './prompts.js';

// Pure, transport-agnostic game state machine for a single room.
// Holds no socket/timer references; the transport layer wires timers
// (recording/guessing timeouts) to endGuessing()/etc. and relays the
// events emitted here out over Socket.io.
export class Room {
  constructor(code) {
    this.code = code;
    this.emitter = new EventEmitter();

    this.players = new Map(); // id -> { id, name, score, connected }
    this.actorOrder = []; // rotation queue of player ids

    this.state = GameState.LOBBY;
    this.roundNumber = 0;
    this.actorId = null;
    this.currentPrompt = null;
    this.currentModifier = null;
    this.promptDeck = createPromptDeck();
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

    if (wasActor && this.state !== GameState.LOBBY) {
      // Actor disappeared mid-round: abort the round rather than guess who's next.
      this.abortRound();
      return;
    }

    this._emitPlayersChanged();
  }

  // Bails out of the current round back to LOBBY without awarding anything.
  // Used when the actor disconnects, or by the transport layer as a
  // server-side backstop if the actor never submits a recording in time.
  abortRound() {
    if (this.state === GameState.LOBBY) return;
    this._resetRound();
    this._transition(GameState.LOBBY);
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

  // -- round flow --

  startRound() {
    this._assertState(GameState.LOBBY);
    if (this.playerCount < MIN_PLAYERS) {
      throw new Error('NOT_ENOUGH_PLAYERS');
    }

    this.roundNumber += 1;
    this._advanceActor();

    if (this.promptDeck.length === 0) {
      this.promptDeck = createPromptDeck();
    }
    this.currentPrompt = this.promptDeck.pop();
    this.currentModifier = null;
    this.guesses = [];
    this.correctGuesserIds = new Set();

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

    const correct = normalize(rawText) === normalize(this.currentPrompt);
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

  finishReveal() {
    this._assertState(GameState.ROUND_REVEAL);
    this._resetRound();
    this._transition(GameState.LOBBY);
  }

  // Snapshot safe to broadcast. currentPrompt is included for the transport
  // layer to redact per-recipient (actor + revealed guessers see it, active
  // guessers don't).
  toJSON() {
    return {
      code: this.code,
      state: this.state,
      roundNumber: this.roundNumber,
      actorId: this.actorId,
      currentModifier: this.currentModifier,
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

  _resetRound() {
    this.actorId = null;
    this.currentPrompt = null;
    this.currentModifier = null;
    this.guesses = [];
    this.correctGuesserIds = new Set();
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
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
