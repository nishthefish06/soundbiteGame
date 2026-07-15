import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { GameState, PROMPT_OPTIONS_COUNT, VALID_ROUND_COUNTS } from './constants.js';
import { GAME_MODES } from './prompts.js';

function makeRoom(playerCount = 3) {
  const room = new Room('TEST');
  for (let i = 0; i < playerCount; i += 1) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  return room;
}

// Starts a game and picks the first offered prompt for the current round,
// returning the prompt text.
function pickPrompt(room) {
  const prompt = room.promptOptions[0].text;
  room.selectPrompt(room.actorId, prompt);
  return prompt;
}

function startGameAndPickPrompt(room, rounds = 3, mode = GAME_MODES[0]) {
  room.startGame(rounds, mode);
  return pickPrompt(room);
}

test('starts in LOBBY with no players', () => {
  const room = new Room('TEST');
  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.playerCount, 0);
});

test('startGame rejects below MIN_PLAYERS', () => {
  const room = makeRoom(2);
  assert.throws(() => room.startGame(3, GAME_MODES[0]), /NOT_ENOUGH_PLAYERS/);
});

test('startGame rejects an invalid round count', () => {
  const room = makeRoom(3);
  assert.throws(() => room.startGame(4, GAME_MODES[0]), /INVALID_ROUND_COUNT/);
});

test('startGame rejects an invalid mode', () => {
  const room = makeRoom(3);
  assert.throws(() => room.startGame(VALID_ROUND_COUNTS[0], 'NOT_A_MODE'), /INVALID_MODE/);
});

test('startGame configures totalRounds/mode and deals the first round\'s prompts', () => {
  const room = makeRoom(3);
  const [mode] = GAME_MODES;
  room.startGame(5, mode);

  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.equal(room.totalRounds, 5);
  assert.equal(room.currentMode, mode);
  assert.equal(room.roundNumber, 1);
  assert.equal(room.promptOptions.length, PROMPT_OPTIONS_COUNT);
  for (const option of room.promptOptions) {
    assert.equal(typeof option.text, 'string');
    assert.ok(Array.isArray(option.synonyms));
  }
  const texts = room.promptOptions.map((o) => o.text);
  assert.equal(new Set(texts).size, PROMPT_OPTIONS_COUNT, 'options should be distinct');
});

test('startGame resets everyone\'s score for the new game', () => {
  const room = makeRoom(3);
  const [firstId] = room.playerList.map((p) => p.id);
  room.players.get(firstId).score = 999;

  room.startGame(3, GAME_MODES[0]);
  assert.equal(room.players.get(firstId).score, 0);
});

test('selectPrompt rejects a choice that was not offered', () => {
  const room = makeRoom(3);
  room.startGame(3, GAME_MODES[0]);
  assert.throws(() => room.selectPrompt(room.actorId, 'not a real option'), /INVALID_PROMPT_CHOICE/);
});

test('selectPrompt rejects a non-actor', () => {
  const room = makeRoom(3);
  room.startGame(3, GAME_MODES[0]);
  const [otherId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.throws(() => room.selectPrompt(otherId, room.promptOptions[0].text), /NOT_ACTOR/);
});

test('finishReveal advances to the next round using the same game mode', () => {
  const room = makeRoom(3);
  const [mode] = GAME_MODES;
  startGameAndPickPrompt(room, 5, mode);
  room.submitRecording(room.actorId, 'ROBOT');
  room.endGuessing(); // force straight to reveal

  room.finishReveal();

  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.equal(room.roundNumber, 2);
  assert.equal(room.currentMode, mode, 'mode stays fixed for the whole game');
});

test('finishReveal ends the game after the last round', () => {
  const room = makeRoom(3);
  room.startGame(3, GAME_MODES[0]);

  for (let round = 1; round <= 3; round += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }

  assert.equal(room.state, GameState.GAME_OVER);
  assert.equal(room.roundNumber, 3);
});

test('returnToLobby resets game state so a new game can be configured', () => {
  const room = makeRoom(3);
  room.startGame(3, GAME_MODES[0]);
  for (let round = 1; round <= 3; round += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.state, GameState.GAME_OVER);

  room.returnToLobby();

  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.totalRounds, 0);
  assert.equal(room.currentMode, null);
  assert.equal(room.roundNumber, 0);

  // A new game can be started right away.
  room.startGame(5, GAME_MODES[1]);
  assert.equal(room.state, GameState.PROMPT_SELECTION);
  assert.equal(room.totalRounds, 5);
  assert.equal(room.currentMode, GAME_MODES[1]);
});

test('full round happy path: PROMPT_SELECTION -> ACTOR_RECORDING -> GUESSING_ACTIVE -> ROUND_REVEAL', () => {
  const room = makeRoom(3);

  const prompt = startGameAndPickPrompt(room, 3);
  assert.equal(room.state, GameState.ACTOR_RECORDING);
  assert.ok(room.actorId);
  assert.equal(room.currentPrompt, prompt);

  room.submitRecording(room.actorId, 'ROBOT');
  assert.equal(room.state, GameState.GUESSING_ACTIVE);

  const guesserIds = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.equal(guesserIds.length, 2);

  room.submitGuess(guesserIds[0], room.currentPrompt);
  assert.equal(room.state, GameState.GUESSING_ACTIVE, 'not everyone guessed yet');

  room.submitGuess(guesserIds[1], room.currentPrompt);
  assert.equal(room.state, GameState.ROUND_REVEAL, 'last guesser triggers reveal');
});

test('correct guess awards points to guesser and actor', () => {
  const room = makeRoom(3);
  const actorId = (startGameAndPickPrompt(room, 3), room.actorId);
  room.submitRecording(actorId, 'DEMON');

  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);
  room.submitGuess(guesserId, room.currentPrompt);

  assert.equal(room.players.get(guesserId).score, 100);
  assert.equal(room.players.get(actorId).score, 25);
});

test('incorrect guess does not award points or change state', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'definitely not the prompt');
  assert.equal(guess.correct, false);
  assert.equal(room.players.get(guesserId).score, 0);
  assert.equal(room.state, GameState.GUESSING_ACTIVE);
});

test('guess matching is case/punctuation/whitespace insensitive', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'A Lightsaber, Malfunctioning!';
  room.currentPromptAnswers = ['A Lightsaber, Malfunctioning!'];
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, '  a lightsaber malfunctioning  ');
  assert.equal(guess.correct, true);
});

test('guess matching treats hyphens as word separators', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'Dial-up modem';
  room.currentPromptAnswers = ['Dial-up modem'];
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'dial up modem');
  assert.equal(guess.correct, true);
});

test('guess matching accepts a listed synonym, not just the exact prompt text', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'Slot machine jackpot';
  room.currentPromptAnswers = ['Slot machine jackpot', 'slot machine', 'jackpot'];
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'jackpot');
  assert.equal(guess.correct, true, 'a synonym should count as correct even though it is not the full prompt text');
});

test('selectPrompt populates currentPromptAnswers from the chosen option\'s text and synonyms', () => {
  const room = makeRoom(3);
  room.startGame(3, GAME_MODES[0]);
  const [chosen] = room.promptOptions;

  room.selectPrompt(room.actorId, chosen.text);

  assert.deepEqual(room.currentPromptAnswers, [chosen.text, ...chosen.synonyms]);
});

test('actor cannot submit a guess', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  assert.throws(() => room.submitGuess(room.actorId, 'anything'), /ACTOR_CANNOT_GUESS/);
});

test('a player cannot guess correctly twice', () => {
  const room = makeRoom(4);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  room.submitGuess(guesserId, room.currentPrompt);
  assert.throws(() => room.submitGuess(guesserId, room.currentPrompt), /ALREADY_GUESSED_CORRECTLY/);
});

test('non-actor cannot submit the recording', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  const [otherId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.throws(() => room.submitRecording(otherId, 'ROBOT'), /NOT_ACTOR/);
});

test('invalid voice modifier is rejected', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 3);
  assert.throws(() => room.submitRecording(room.actorId, 'BANANA'), /INVALID_MODIFIER/);
});

test('actor rotates across rounds', () => {
  const room = makeRoom(3);
  startGameAndPickPrompt(room, 5);
  const firstActor = room.actorId;
  room.submitRecording(firstActor, 'ROBOT');
  room.endGuessing();
  room.finishReveal();

  assert.notEqual(room.actorId, firstActor);
});

test('actor leaving mid-round skips the round rather than ending the game', () => {
  const room = makeRoom(4);
  startGameAndPickPrompt(room, 5);
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');

  room.removePlayer(actorId);

  assert.equal(room.state, GameState.PROMPT_SELECTION, 'game continues into the next round');
  assert.equal(room.roundNumber, 2);
  assert.notEqual(room.actorId, actorId);
});

test('actor leaving on the final round ends the game instead of skipping to a round that does not exist', () => {
  const room = makeRoom(4);
  const [shortestGame] = VALID_ROUND_COUNTS; // 3
  room.startGame(shortestGame, GAME_MODES[0]);

  // Fast-forward to the last round.
  for (let round = 1; round < shortestGame; round += 1) {
    pickPrompt(room);
    room.submitRecording(room.actorId, 'ROBOT');
    room.endGuessing();
    room.finishReveal();
  }
  assert.equal(room.roundNumber, shortestGame);

  const actorId = room.actorId;
  room.removePlayer(actorId);

  assert.equal(room.state, GameState.GAME_OVER);
});

test('endGuessing forces reveal on timeout even if not everyone guessed', () => {
  const room = makeRoom(4);
  startGameAndPickPrompt(room, 3);
  room.submitRecording(room.actorId, 'ROBOT');
  room.endGuessing();
  assert.equal(room.state, GameState.ROUND_REVEAL);
});

test('stateChange and playersChanged events fire', () => {
  const room = makeRoom(3);
  const events = [];
  room.on('stateChange', (e) => events.push(['stateChange', e.next]));
  room.on('playersChanged', () => events.push(['playersChanged']));

  room.startGame(3, GAME_MODES[0]);
  // startGame resets scores (playersChanged) before dealing the first round (stateChange).
  assert.deepEqual(events[0], ['playersChanged']);
  assert.deepEqual(events[1], ['stateChange', GameState.PROMPT_SELECTION]);
});
