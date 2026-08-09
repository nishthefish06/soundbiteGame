import { EventEmitter } from 'node:events';
import {
  GameState,
  MIN_PLAYERS,
  MAX_PLAYERS,
  VALID_ROUND_COUNTS,
  PROMPT_OPTIONS_COUNT,
  isValidModifierCombo,
  POINTS_CORRECT_GUESS,
  POINTS_ACTOR_PER_CORRECT_GUESSER,
  GUESSING_DURATION_MS,
  MAX_SPEED_BONUS,
  STREAK_BONUS_PER_LEVEL,
  MAX_STREAK_LEVEL,
  MIN_CUSTOM_PROMPTS,
  TELEPHONE_MODIFIER,
  MIN_RATING,
  MAX_RATING,
  POINTS_PER_STAR,
  POINTS_CORRECT_MATCH,
  POINTS_PER_EVADED_GUESSER,
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

// Unlike CUSTOM/TELEPHONE, PERFORMANCE *is* a real prompt category (see
// prompts.js) and needs no special-casing for prompt sourcing — this
// constant exists only for the rating-flow branches below.
const PERFORMANCE_MODE = 'PERFORMANCE';

// Also not a static category — every non-spectating player records the same
// prompt at once (see _startWhoSaidItRound()) rather than one actor taking a
// turn, so it reuses the SOUND_EFFECT pool exactly like TELEPHONE does.
const WHO_SAID_IT_MODE = 'WHO_SAID_IT';
const WHO_SAID_IT_SOURCE_CATEGORY = 'SOUND_EFFECT';

// Pure, transport-agnostic game state machine for a single room.
// Holds no socket/timer references; the transport layer wires timers
// (recording/guessing timeouts) to endGuessing()/etc. and relays the
// events emitted here out over Socket.io.
//
// Hierarchy: a Room hosts a series of Games (one at a time); a Game is a
// fixed number of Rounds all played in the same mode, and a Round is every
// current player getting one Turn as the actor. LOBBY is where a game gets
// configured and started; GAME_OVER is where one just ended and the room
// decides whether to configure another.
export class Room {
  constructor(code) {
    this.code = code;
    this.emitter = new EventEmitter();

    this.players = new Map(); // id -> { id, name, score, connected }
    this.actorOrder = []; // rotation queue of player ids
    // Whoever created/first joined the room; reassigned to whoever's left
    // when they leave (see removePlayer()). Gates startGame/kickPlayer/
    // transferHost.
    this.hostId = null;
    // Player ids kicked from this room — checked in addPlayer() so a kick
    // actually sticks instead of the same stable playerId just reconnecting.
    this.bannedPlayerIds = new Set();

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
    this.ratings = []; // PERFORMANCE mode only: [{ playerId, stars }]
    // WHO_SAID_IT mode only: playerId -> modifier, filled during GROUP_RECORDING.
    this.groupRecordings = new Map();
    // WHO_SAID_IT mode only: shuffled playerId order fixed once recording
    // closes — clipOrder[clipIndex] is the current clip's true owner. Always
    // present in toJSON() as currentClipOwnerId; redact.js is what actually
    // hides it from everyone but that owner (until reveal).
    this.clipOrder = [];
    this.clipIndex = 0;
    // WHO_SAID_IT mode only: guesserId -> guessedPlayerId for whichever clip
    // is currently playing, reset each time clipIndex advances.
    this.clipGuesses = new Map();
    // WHO_SAID_IT mode only: accumulated once per resolved clip this round —
    // [{ clipOwnerId, correctGuesserIds }] — so ROUND_REVEAL can show the
    // whole round's clip->owner mapping at once, not just the last clip.
    this.clipResults = [];
    // Monotonic count of actor turns since the game started — never resets
    // at a round boundary, unlike roundNumber. Lets the transport/client
    // layers detect "a new turn just began" independent of round semantics.
    this.turnNumber = 0;
    // Player ids who've already been the actor (or TELEPHONE originator)
    // this round — a round is "everyone gets a turn once", so a new round
    // begins exactly when the next player in line has already gone. See
    // _peekStartsNewRound().
    this.actorsThisRound = new Set();
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

    if (this.bannedPlayerIds.has(id)) {
      throw new Error('KICKED');
    }
    if (this.playerCount >= MAX_PLAYERS) {
      throw new Error('ROOM_FULL');
    }

    const isFirstPlayer = this.playerCount === 0;
    // Joining mid-game (not in the lobby between games, and not after one
    // just ended) makes you a spectator: you can watch but can't guess/rate
    // until the round already in progress finishes, and you don't enter the
    // actor rotation until then either (see _startNextTurn's promotion of
    // spectating players at the next round boundary). Joining in LOBBY/
    // GAME_OVER is the normal case and needs none of this.
    const isMidGame = this.state !== GameState.LOBBY && this.state !== GameState.GAME_OVER;
    const player = { id, name, score: 0, connected: true, streak: 0, spectating: isMidGame };
    this.players.set(id, player);
    if (!isMidGame) this.actorOrder.push(id);
    if (isFirstPlayer) this.hostId = id;
    this._emitPlayersChanged();
    return player;
  }

  removePlayer(id) {
    if (!this.players.has(id)) return;

    // In TELEPHONE mode the round depends on every chain member, not just
    // whoever currently holds the mic — any of them leaving breaks the chain.
    const wasPerforming = this.actorId === id || this.chainOrder.includes(id);
    const wasHost = id === this.hostId;
    this.players.delete(id);
    this.actorOrder = this.actorOrder.filter((pid) => pid !== id);

    if (wasHost) {
      this.hostId = this.playerList[0]?.id ?? null;
      this._emitHostChanged();
    }

    if (wasPerforming && this.state !== GameState.LOBBY && this.state !== GameState.GAME_OVER) {
      // Actor/relayer disappeared mid-round: skip this round rather than guess who's next.
      this.abortRound();
      return;
    }

    this._emitPlayersChanged();
  }

  // Skips the current turn without awarding anything, then continues the
  // game (next turn, possibly starting a new round) or ends it, same as a
  // normal reveal would. Used when the actor disconnects, or by the
  // transport layer as a server-side backstop if the actor never submits in
  // time.
  abortRound() {
    if (this.state === GameState.LOBBY || this.state === GameState.GAME_OVER) return;
    this._advanceTurnOrEndGame();
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

  // Removes and bans a player so their stable playerId can't just reconnect
  // right back in. Reuses removePlayer() for everything else (mid-round
  // abort, host reassignment if the target somehow held both — can't
  // actually happen since a host can't kick themselves, but kept in one
  // place regardless).
  kickPlayer(requesterId, targetId) {
    if (requesterId !== this.hostId) throw new Error('NOT_HOST');
    if (targetId === requesterId) throw new Error('CANNOT_KICK_SELF');
    if (!this.players.has(targetId)) throw new Error('UNKNOWN_PLAYER');

    this.bannedPlayerIds.add(targetId);
    this.removePlayer(targetId);
  }

  transferHost(requesterId, targetId) {
    if (requesterId !== this.hostId) throw new Error('NOT_HOST');
    if (!this.players.has(targetId)) throw new Error('UNKNOWN_PLAYER');
    if (targetId === this.hostId) throw new Error('ALREADY_HOST');

    this.hostId = targetId;
    this._emitHostChanged();
  }

  // -- game/round flow --

  // Configures and kicks off a new game: a fixed number of rounds, all in the
  // same mode. A round is one full cycle of every player getting a turn as
  // the actor (see _startNextTurn()/_peekStartsNewRound()) — totalRounds is
  // how many such cycles to play, not a raw turn count. Scores reset — each
  // game is its own contest. Host-only, like every other requester-gated
  // action here.
  startGame(requesterId, totalRounds, mode, customPrompts = []) {
    this._assertState(GameState.LOBBY);
    if (requesterId !== this.hostId) {
      throw new Error('NOT_HOST');
    }
    if (this.playerCount < MIN_PLAYERS) {
      throw new Error('NOT_ENOUGH_PLAYERS');
    }
    if (!VALID_ROUND_COUNTS.includes(totalRounds)) {
      throw new Error('INVALID_ROUND_COUNT');
    }
    if (
      mode !== CUSTOM_MODE &&
      mode !== TELEPHONE_MODE &&
      mode !== WHO_SAID_IT_MODE &&
      !GAME_MODES.includes(mode)
    ) {
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
    this.turnNumber = 0;
    this.actorsThisRound = new Set();
    for (const player of this.playerList) {
      player.score = 0;
      player.streak = 0;
    }
    this._emitPlayersChanged();

    this._startNextTurn();
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
    } else if (!isValidModifierCombo(modifier)) {
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

    if (this.currentMode === PERFORMANCE_MODE) {
      // No guessing, no speed bonus — the round's score comes entirely from
      // the average star rating once everyone's voted (see _finishRating()).
      this._transition(GameState.RATING_ACTIVE);
      return;
    }

    this.guessingStartedAt = Date.now();
    this._transition(GameState.GUESSING_ACTIVE);
  }

  // WHO_SAID_IT mode only: one non-spectating player's simultaneous
  // recording. Unlike submitRecording there's no single actor to assert —
  // any eligible player may submit once. Once everyone eligible has, moves
  // straight to matching.
  submitGroupRecording(playerId, modifier) {
    this._assertState(GameState.GROUP_RECORDING);
    const player = this.players.get(playerId);
    if (!player) throw new Error('UNKNOWN_PLAYER');
    if (player.spectating) throw new Error('SPECTATING');
    if (this.groupRecordings.has(playerId)) throw new Error('ALREADY_SUBMITTED');
    if (!isValidModifierCombo(modifier)) throw new Error('INVALID_MODIFIER');

    this.groupRecordings.set(playerId, modifier);
    const total = this._eligibleRecorderCount();
    this.emitter.emit('groupRecordingProgress', { room: this.code, count: this.groupRecordings.size, total });

    if (this.groupRecordings.size >= total) {
      this._startMatching();
    }
  }

  // Called by the transport layer when the group-recording timer runs out
  // before everyone eligible has submitted. Proceeds with whoever did; with
  // fewer than 2 clips there's nothing to match against, so the round is
  // skipped instead — same "graceful skip" the single-actor modes use when
  // an actor vanishes mid-round (see removePlayer()/abortRound()).
  finishGroupRecording() {
    this._assertState(GameState.GROUP_RECORDING);
    if (this.groupRecordings.size < 2) {
      this._advanceTurnOrEndGame();
      return;
    }
    this._startMatching();
  }

  submitGuess(playerId, rawText) {
    this._assertState(GameState.GUESSING_ACTIVE);
    const player = this.players.get(playerId);
    if (!player) throw new Error('UNKNOWN_PLAYER');
    if (this._performerIds().has(playerId)) throw new Error('ACTOR_CANNOT_GUESS');
    if (player.spectating) throw new Error('SPECTATING');
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

      const everyoneGuessed = this.correctGuesserIds.size === this._eligiblePlayerCount();
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

  // WHO_SAID_IT mode only: a guess at who recorded the clip currently
  // playing. Structurally parallel to submitGuess but not its text/synonym
  // matching (same reasoning PERFORMANCE got its own submitRating instead of
  // overloading submitGuess) — scores immediately, same as submitGuess does.
  submitMatchGuess(guesserId, guessedPlayerId) {
    this._assertState(GameState.MATCHING_ACTIVE);
    const guesser = this.players.get(guesserId);
    if (!guesser) throw new Error('UNKNOWN_PLAYER');
    if (this._performerIds().has(guesserId)) throw new Error('OWNER_CANNOT_GUESS_OWN_CLIP');
    if (guesser.spectating) throw new Error('SPECTATING');
    if (this.clipGuesses.has(guesserId)) throw new Error('ALREADY_GUESSED');
    if (!this.groupRecordings.has(guessedPlayerId)) throw new Error('INVALID_GUESS_TARGET');

    this.clipGuesses.set(guesserId, guessedPlayerId);

    const ownerId = this.clipOrder[this.clipIndex];
    if (guessedPlayerId === ownerId) {
      guesser.score += POINTS_CORRECT_MATCH;
    } else {
      // Rewards a good disguise: the owner earns this per guesser they
      // evaded, not per guesser who caught them.
      const owner = this.players.get(ownerId);
      if (owner) owner.score += POINTS_PER_EVADED_GUESSER;
    }
    this._emitPlayersChanged();

    if (this.clipGuesses.size === this._eligiblePlayerCount()) {
      this._resolveClip();
    }
  }

  // Called by the transport layer when a clip's matching timer runs out
  // before everyone eligible has guessed.
  endMatching() {
    this._assertState(GameState.MATCHING_ACTIVE);
    this._resolveClip();
  }

  // PERFORMANCE mode only: a rater scores the actor's performance 1-5 stars.
  // Unlike submitGuess, this never scores the rater — only the actor, once
  // every rating is in (see _finishRating()).
  submitRating(playerId, stars) {
    this._assertState(GameState.RATING_ACTIVE);
    const player = this.players.get(playerId);
    if (!player) throw new Error('UNKNOWN_PLAYER');
    if (this._performerIds().has(playerId)) throw new Error('ACTOR_CANNOT_RATE');
    if (player.spectating) throw new Error('SPECTATING');
    if (!Number.isInteger(stars) || stars < MIN_RATING || stars > MAX_RATING) {
      throw new Error('INVALID_RATING');
    }
    if (this.ratings.some((r) => r.playerId === playerId)) throw new Error('ALREADY_RATED');

    this.ratings.push({ playerId, stars });
    const total = this._eligiblePlayerCount();
    this.emitter.emit('ratingProgress', { room: this.code, count: this.ratings.length, total });

    if (this.ratings.length >= total) {
      this._finishRating();
    }
  }

  // Called by the transport layer when the rating timer runs out.
  endRating() {
    this._assertState(GameState.RATING_ACTIVE);
    this._finishRating();
  }

  // Continues to the next turn (possibly starting a new round), or ends the
  // game if that was the last turn of the last round.
  finishReveal() {
    this._assertState(GameState.ROUND_REVEAL);
    this._updateStreaks();
    this._advanceTurnOrEndGame();
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
      hostId: this.hostId,
      totalRounds: this.totalRounds,
      roundNumber: this.roundNumber,
      turnNumber: this.turnNumber,
      currentMode: this.currentMode,
      actorId: this.actorId,
      chainOrder: this.chainOrder,
      currentModifier: this.currentModifier,
      promptOptions: this.promptOptions,
      currentPrompt: this.currentPrompt,
      correctGuesserIds: [...this.correctGuesserIds],
      ratings: this.ratings,
      // WHO_SAID_IT mode only. currentClipOwnerId is the raw truth (who
      // really recorded the clip currently playing) — redact.js is what
      // actually hides it from everyone but that owner before ROUND_REVEAL;
      // it's present here unconditionally the same way currentPrompt is.
      currentClipOwnerId: this.clipOrder[this.clipIndex] ?? null,
      clipIndex: this.clipIndex,
      totalClips: this.clipOrder.length,
      clipResults: this.clipResults,
      // Who has already guessed the current clip — safe to expose raw (no
      // redaction needed) since it only reveals *that* someone answered, not
      // *what* they guessed, same class of info as correctGuesserIds above.
      clipGuesserIds: [...this.clipGuesses.keys()],
      // The *unordered* set of players who recorded a clip this round — safe
      // to expose raw (unlike clipOrder, which is a sequence and would leak
      // the current clip's position/identity). Lets clients build a valid
      // guess-target list without offering a player who never submitted
      // (e.g. one who disconnected, or never got the mic during
      // GROUP_RECORDING) and getting INVALID_GUESS_TARGET back.
      recordedPlayerIds: [...this.groupRecordings.keys()],
      players: this.playerList.map(({ id, name, score, connected, streak, spectating }) => ({
        id,
        name,
        score,
        connected,
        streak,
        spectating,
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
  // always at least 1 player left over to guess. Scaled off actorOrder
  // rather than playerCount — a mid-game spectator isn't in the rotation
  // yet (see addPlayer()), so they shouldn't inflate the chain length
  // beyond what _advanceChain() can actually slice out of actorOrder.
  _telephoneChainLength() {
    const n = this.actorOrder.length;
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
  // actor normally, the whole relay chain in TELEPHONE mode, or — in
  // WHO_SAID_IT — just the current clip's owner (everyone else who recorded
  // is eligible to guess it, including players who'll own a later clip).
  _performerIds() {
    if (this.currentMode === TELEPHONE_MODE) return new Set(this.chainOrder);
    if (this.currentMode === WHO_SAID_IT_MODE) {
      const ownerId = this.clipOrder[this.clipIndex];
      return ownerId ? new Set([ownerId]) : new Set();
    }
    return new Set([this.actorId]);
  }

  // WHO_SAID_IT mode only: how many non-spectating players must submit a
  // recording before GROUP_RECORDING can close. Unlike _eligiblePlayerCount()
  // this counts everyone, not "everyone but the performer(s)" — during
  // GROUP_RECORDING there's no clip owner yet to exclude.
  _eligibleRecorderCount() {
    let count = 0;
    for (const player of this.playerList) {
      if (!player.spectating) count += 1;
    }
    return count;
  }

  // Players who can currently guess/rate: not a performer this round, and
  // not still spectating (joined mid-game, waiting for the next round
  // boundary — see addPlayer()/_promoteSpectators()). Used as the
  // "everyone's weighed in" denominator for both guessing and rating, since
  // a spectator structurally can't do either and shouldn't be counted as
  // someone the round is still waiting on.
  _eligiblePlayerCount() {
    const performers = this._performerIds();
    let count = 0;
    for (const player of this.playerList) {
      if (performers.has(player.id) || player.spectating) continue;
      count += 1;
    }
    return count;
  }

  // Promotes every player who joined mid-game (still `spectating`) into the
  // actor rotation. Called at the start of a new round so a mid-round joiner
  // has watched at least one full round before they can be picked as actor.
  _promoteSpectators() {
    let promoted = false;
    for (const player of this.playerList) {
      if (!player.spectating) continue;
      player.spectating = false;
      this.actorOrder.push(player.id);
      promoted = true;
    }
    if (promoted) this._emitPlayersChanged();
  }

  // A new round begins exactly when the next player in the rotation has
  // already been the actor this round — i.e. everyone currently in the room
  // has had a turn and we're about to wrap back around. Also true for the
  // very first turn of the game. Peeking (rather than checking after
  // advancing) lets both _startNextTurn() and _advanceTurnOrEndGame() ask
  // "is what comes next a new round?" without side effects.
  _peekStartsNewRound() {
    if (this.roundNumber === 0) return true;
    // No multi-turn-per-round concept here — every player records
    // simultaneously, so round and turn coincide.
    if (this.currentMode === WHO_SAID_IT_MODE) return true;
    return this.actorsThisRound.has(this.actorOrder[0]);
  }

  _startNextTurn() {
    if (this._peekStartsNewRound()) {
      this.roundNumber += 1;
      this.actorsThisRound = new Set();
      this._promoteSpectators();
    }
    this.turnNumber += 1;

    if (this.currentMode === WHO_SAID_IT_MODE) {
      this._startWhoSaidItRound();
      return;
    }

    if (this.currentMode === TELEPHONE_MODE) {
      this._advanceChain(this._telephoneChainLength());
    } else {
      this.chainOrder = [];
      this.chainIndex = 0;
      this._advanceActor();
    }
    this.actorsThisRound.add(this.actorId);

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
    this.ratings = [];

    this._transition(GameState.PROMPT_SELECTION);
  }

  // WHO_SAID_IT mode's round start: no actor rotation, no PROMPT_SELECTION —
  // nobody picks among options, so the single drawn prompt is shown to
  // everyone directly inside the recording view. Goes straight to
  // GROUP_RECORDING; matching (and its own prompt-free clip-by-clip flow)
  // starts once every eligible player has submitted (see _startMatching()).
  _startWhoSaidItRound() {
    this.actorId = null;
    this.chainOrder = [];
    this.chainIndex = 0;
    this.promptOptions = [];
    this.groupRecordings = new Map();
    this.clipOrder = [];
    this.clipIndex = 0;
    this.clipGuesses = new Map();
    this.clipResults = [];
    this.currentModifier = null;

    const deck = this.promptDecks[WHO_SAID_IT_SOURCE_CATEGORY];
    if (deck.length < 1) {
      this.promptDecks[WHO_SAID_IT_SOURCE_CATEGORY] = createPromptDeck(WHO_SAID_IT_SOURCE_CATEGORY);
    }
    const chosen = this.promptDecks[WHO_SAID_IT_SOURCE_CATEGORY].pop();
    this.currentPrompt = chosen.text;
    this.currentPromptAnswers = [];

    this._transition(GameState.GROUP_RECORDING);
  }

  // WHO_SAID_IT mode: recording has closed (everyone eligible submitted, or
  // the phase timer forced it) — fix the shuffled clip order and start
  // guessing the first clip.
  _startMatching() {
    this.clipOrder = shuffle([...this.groupRecordings.keys()]);
    this.clipIndex = 0;
    this.clipGuesses = new Map();
    // One "turn" per clip so the client's existing per-turn reset (clearing
    // chat/incoming audio on a turnNumber change) also clears them between
    // clips, without needing any new client-side bookkeeping.
    this.turnNumber += 1;
    this._transition(GameState.MATCHING_ACTIVE);
  }

  // WHO_SAID_IT mode: the current clip has been guessed by everyone eligible
  // (or its matching timer ran out) — record the recap entry, then either
  // move to the next clip or, if that was the last one, reveal the round.
  // Scores are already applied per-guess in submitMatchGuess, mirroring
  // submitGuess's immediate-scoring style — this only builds the recap.
  _resolveClip() {
    const ownerId = this.clipOrder[this.clipIndex];
    const correctGuesserIds = [...this.clipGuesses.entries()]
      .filter(([, guessedId]) => guessedId === ownerId)
      .map(([guesserId]) => guesserId);
    this.clipResults.push({ clipOwnerId: ownerId, correctGuesserIds });

    if (this.clipIndex < this.clipOrder.length - 1) {
      this.clipIndex += 1;
      this.clipGuesses = new Map();
      this.turnNumber += 1;
      this._transition(GameState.MATCHING_ACTIVE);
    } else {
      this._transition(GameState.ROUND_REVEAL);
    }
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

  // PERFORMANCE mode only: once every rater has voted (or the rating timer
  // ran out), score the actor off the average and move to reveal. Zero
  // ratings (everyone eligible left mid-round) scores nothing rather than
  // throwing.
  _finishRating() {
    const average =
      this.ratings.length > 0 ? this.ratings.reduce((sum, r) => sum + r.stars, 0) / this.ratings.length : 0;
    const actor = this.players.get(this.actorId);
    if (actor) actor.score += Math.round(average * POINTS_PER_STAR);
    this._emitPlayersChanged();
    this._transition(GameState.ROUND_REVEAL);
  }

  // Called once a round's guessing has actually concluded (not when a round
  // is skipped/aborted before anyone got to guess). Guessers who nailed this
  // round build their streak; everyone else's resets. Performers don't guess
  // this round, so their streak carries over untouched — same for
  // spectators, who structurally couldn't guess either.
  _updateStreaks() {
    // PERFORMANCE mode raters aren't guessing anything right or wrong, so
    // streaks (a guessing-mode concept) don't apply here. WHO_SAID_IT scores
    // per-clip matches immediately (see submitMatchGuess) rather than once
    // per round, so a single per-round streak doesn't map onto it either.
    if (this.currentMode === PERFORMANCE_MODE || this.currentMode === WHO_SAID_IT_MODE) return;

    const performers = this._performerIds();
    for (const player of this.playerList) {
      if (performers.has(player.id) || player.spectating) continue;
      player.streak = this.correctGuesserIds.has(player.id) ? player.streak + 1 : 0;
    }
    this._emitPlayersChanged();
  }

  // Ends the game only once the last round is fully done — i.e. totalRounds
  // has been reached AND the upcoming turn would otherwise start a round
  // that was never configured. Mid-round (someone in the current round
  // hasn't gone yet), the game always continues even if roundNumber already
  // equals totalRounds.
  _advanceTurnOrEndGame() {
    if (this.roundNumber >= this.totalRounds && this._peekStartsNewRound()) {
      this._resetRound();
      this._transition(GameState.GAME_OVER);
    } else {
      this._startNextTurn();
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
    this.ratings = [];
    this.groupRecordings = new Map();
    this.clipOrder = [];
    this.clipIndex = 0;
    this.clipGuesses = new Map();
    this.clipResults = [];
  }

  _resetGame() {
    this.totalRounds = 0;
    this.currentMode = null;
    this.roundNumber = 0;
    this.turnNumber = 0;
    this.actorsThisRound = new Set();
    // A spectator who joined during the *last* round of the game never hits
    // a round boundary (_startNextTurn/_promoteSpectators) before GAME_OVER,
    // so without this they'd stay benched forever — never entering
    // actorOrder even in the next game started in this room. Back in LOBBY,
    // "mid-game" no longer applies to anyone.
    this._promoteSpectators();
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

  // Separate from _transition()'s 'stateChange' event — re-emitting that
  // would reset the transport layer's phase timer (see wirePhaseTimers in
  // socketServer.js) and wrongly restart e.g. an in-progress recording
  // countdown just because the host changed.
  _emitHostChanged() {
    this.emitter.emit('hostChanged', { room: this.code, hostId: this.hostId });
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
