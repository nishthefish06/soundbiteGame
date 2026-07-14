import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.js';
import { GameState } from './constants.js';

function makeRoom(playerCount = 3) {
  const room = new Room('TEST');
  for (let i = 0; i < playerCount; i += 1) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  return room;
}

test('starts in LOBBY with no players', () => {
  const room = new Room('TEST');
  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.playerCount, 0);
});

test('startRound rejects below MIN_PLAYERS', () => {
  const room = makeRoom(2);
  assert.throws(() => room.startRound(), /NOT_ENOUGH_PLAYERS/);
});

test('full round happy path: LOBBY -> ACTOR_RECORDING -> GUESSING_ACTIVE -> ROUND_REVEAL -> LOBBY', () => {
  const room = makeRoom(3);

  room.startRound();
  assert.equal(room.state, GameState.ACTOR_RECORDING);
  assert.ok(room.actorId);
  assert.ok(room.currentPrompt);

  room.submitRecording(room.actorId, 'ROBOT');
  assert.equal(room.state, GameState.GUESSING_ACTIVE);

  const guesserIds = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.equal(guesserIds.length, 2);

  room.submitGuess(guesserIds[0], room.currentPrompt);
  assert.equal(room.state, GameState.GUESSING_ACTIVE, 'not everyone guessed yet');

  room.submitGuess(guesserIds[1], room.currentPrompt);
  assert.equal(room.state, GameState.ROUND_REVEAL, 'last guesser triggers reveal');

  room.finishReveal();
  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.currentPrompt, null);
});

test('correct guess awards points to guesser and actor', () => {
  const room = makeRoom(3);
  room.startRound();
  const actorId = room.actorId;
  room.submitRecording(actorId, 'DEMON');

  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== actorId);
  room.submitGuess(guesserId, room.currentPrompt);

  assert.equal(room.players.get(guesserId).score, 100);
  assert.equal(room.players.get(actorId).score, 25);
});

test('incorrect guess does not award points or change state', () => {
  const room = makeRoom(3);
  room.startRound();
  room.submitRecording(room.actorId, 'ROBOT');
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, 'definitely not the prompt');
  assert.equal(guess.correct, false);
  assert.equal(room.players.get(guesserId).score, 0);
  assert.equal(room.state, GameState.GUESSING_ACTIVE);
});

test('guess matching is case/punctuation/whitespace insensitive', () => {
  const room = makeRoom(3);
  room.startRound();
  room.submitRecording(room.actorId, 'ROBOT');
  room.currentPrompt = 'A Lightsaber, Malfunctioning!';
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  const guess = room.submitGuess(guesserId, '  a lightsaber malfunctioning  ');
  assert.equal(guess.correct, true);
});

test('actor cannot submit a guess', () => {
  const room = makeRoom(3);
  room.startRound();
  room.submitRecording(room.actorId, 'ROBOT');
  assert.throws(() => room.submitGuess(room.actorId, 'anything'), /ACTOR_CANNOT_GUESS/);
});

test('a player cannot guess correctly twice', () => {
  const room = makeRoom(4);
  room.startRound();
  room.submitRecording(room.actorId, 'ROBOT');
  const [guesserId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);

  room.submitGuess(guesserId, room.currentPrompt);
  assert.throws(() => room.submitGuess(guesserId, room.currentPrompt), /ALREADY_GUESSED_CORRECTLY/);
});

test('non-actor cannot submit the recording', () => {
  const room = makeRoom(3);
  room.startRound();
  const [otherId] = room.playerList.map((p) => p.id).filter((id) => id !== room.actorId);
  assert.throws(() => room.submitRecording(otherId, 'ROBOT'), /NOT_ACTOR/);
});

test('invalid voice modifier is rejected', () => {
  const room = makeRoom(3);
  room.startRound();
  assert.throws(() => room.submitRecording(room.actorId, 'BANANA'), /INVALID_MODIFIER/);
});

test('actor rotates across rounds', () => {
  const room = makeRoom(3);
  room.startRound();
  const firstActor = room.actorId;
  room.submitRecording(firstActor, 'ROBOT');
  room.endGuessing();
  room.finishReveal();

  room.startRound();
  assert.notEqual(room.actorId, firstActor);
});

test('actor leaving mid-round aborts back to LOBBY', () => {
  const room = makeRoom(3);
  room.startRound();
  const actorId = room.actorId;
  room.submitRecording(actorId, 'ROBOT');

  room.removePlayer(actorId);
  assert.equal(room.state, GameState.LOBBY);
  assert.equal(room.currentPrompt, null);
});

test('endGuessing forces reveal on timeout even if not everyone guessed', () => {
  const room = makeRoom(4);
  room.startRound();
  room.submitRecording(room.actorId, 'ROBOT');
  room.endGuessing();
  assert.equal(room.state, GameState.ROUND_REVEAL);
});

test('stateChange and playersChanged events fire', () => {
  const room = makeRoom(3);
  const events = [];
  room.on('stateChange', (e) => events.push(['stateChange', e.next]));
  room.on('playersChanged', () => events.push(['playersChanged']));

  room.startRound();
  assert.deepEqual(events[0], ['stateChange', GameState.ACTOR_RECORDING]);
});
