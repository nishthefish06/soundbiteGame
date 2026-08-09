import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomManager } from '../game/RoomManager.js';
import { GAME_MODES } from '../game/prompts.js';
import { GUESSING_DURATION_MS, PROMPT_SELECTION_DURATION_MS } from '../game/constants.js';
import { attachSocketHandlers } from './socketServer.js';

async function startTestServer() {
  const manager = new RoomManager();
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  attachSocketHandlers(io, manager);

  // Node's http.Server.close() only stops accepting new connections; it does
  // not forcibly tear down sockets already upgraded to WebSocket. Without
  // this, a handful of raw TCP sockets survive io.close() and keep the test
  // process alive indefinitely. Test-only hygiene — a real server just runs.
  const openSockets = new Set();
  httpServer.on('connection', (socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  return {
    manager,
    io,
    url: `http://localhost:${port}`,
    async close() {
      io.close();
      for (const socket of openSockets) socket.destroy();
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

function connect(url) {
  // websocket-only avoids Node's http keep-alive agent used by the polling
  // transport, which otherwise can keep the process alive after sockets close.
  return ioClient(url, { forceNew: true, transports: ['websocket'], reconnection: false });
}

function ack(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// Polls a condition instead of a fixed sleep — more robust than
// `setTimeout` guesswork for assertions that depend on real network
// round-trips (e.g. a broadcast reaching several sockets), which can take
// longer than a short fixed delay under system load.
async function waitUntil(condition, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: condition never became true');
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function makePlayer(url, name, roomCode) {
  const socket = connect(url);
  await waitFor(socket, 'connect');
  const playerId = `${name}-${Math.random().toString(36).slice(2)}`;
  const res = roomCode
    ? await ack(socket, 'room:join', { playerId, name, roomCode })
    : await ack(socket, 'room:create', { playerId, name });
  assert.equal(res.ok, true, JSON.stringify(res));
  return { socket, playerId, roomCode: res.roomCode, snapshot: res.snapshot };
}

test('full lifecycle: create, join, round, guess, reveal, redaction', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');

    // Attach the roster listener before the action that triggers it — event
    // listeners never see emits that happened before they were registered.
    const rosterPromise = waitFor(host.socket, 'room:playersChanged');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const afterP2Roster = await rosterPromise;
    assert.equal(afterP2Roster.length, 2);

    const rosterPromise2 = waitFor(host.socket, 'room:playersChanged');
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);
    const afterP3Roster = await rosterPromise2;
    assert.equal(afterP3Roster.length, 3);

    // Same rule applies here: register game:stateChanged listeners before
    // triggering startGame, or the synchronously-emitted broadcast races the ack.
    const stateChanges = { [host.playerId]: null, [p2.playerId]: null, [p3.playerId]: null };
    host.socket.on('game:stateChanged', (s) => { stateChanges[host.playerId] = s; });
    p2.socket.on('game:stateChanged', (s) => { stateChanges[p2.playerId] = s; });
    p3.socket.on('game:stateChanged', (s) => { stateChanges[p3.playerId] = s; });

    const [mode] = GAME_MODES;
    const startRes = await ack(host.socket, 'game:startGame', { roundCount: 3, mode });
    assert.equal(startRes.ok, true);

    // Figure out who the actor is via the room snapshot from the manager (test-only introspection).
    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.state, 'PROMPT_SELECTION');
    const actorId = room.actorId;
    const actorSocket = [host, p2, p3].find((p) => p.playerId === actorId).socket;
    const guessers = [host, p2, p3].filter((p) => p.playerId !== actorId);

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(stateChanges[actorId].currentMode, mode, 'currentMode is visible to everyone, not redacted');
    assert.equal(stateChanges[actorId].totalRounds, 3, 'totalRounds is visible to everyone');
    assert.equal(stateChanges[actorId].promptOptions.length, 3, 'actor should see 3 prompt options');
    for (const g of guessers) {
      assert.equal(stateChanges[g.playerId].currentMode, mode, 'guessers should also see the chosen mode');
      assert.deepEqual(stateChanges[g.playerId].promptOptions, [], 'guessers must not see the prompt options');
    }

    const [{ text: chosenPrompt }] = room.promptOptions;
    const selectRes = await ack(actorSocket, 'game:selectPrompt', { prompt: chosenPrompt });
    assert.equal(selectRes.ok, true);
    assert.equal(room.state, 'ACTOR_RECORDING');

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(stateChanges[actorId].currentPrompt, chosenPrompt, 'actor should see the chosen prompt');
    for (const g of guessers) {
      assert.equal(stateChanges[g.playerId].currentPrompt, null, 'guessers must not see the prompt');
    }

    const audioReceived = [];
    for (const g of guessers) {
      g.socket.on('game:audioBroadcast', (payload) => audioReceived.push(payload));
    }
    let actorHeardOwnAudio = false;
    actorSocket.on('game:audioBroadcast', () => { actorHeardOwnAudio = true; });

    const fakeAudio = new Uint8Array([1, 2, 3, 4]).buffer;
    const recRes = await ack(actorSocket, 'game:submitRecording', { modifier: 'ROBOT', audio: fakeAudio });
    assert.equal(recRes.ok, true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(audioReceived.length, 2, 'both guessers should receive the audio broadcast');
    assert.equal(actorHeardOwnAudio, false, 'actor should not receive their own broadcast back');
    assert.equal(room.state, 'GUESSING_ACTIVE');
    // Backdate guessingStartedAt past the window so the speed bonus is
    // zeroed out below — this test is about base scoring, not the timing bonus.
    room.guessingStartedAt = Date.now() - GUESSING_DURATION_MS;

    const correctPrompt = room.currentPrompt;
    const guessChat = [];
    for (const p of [host, p2, p3]) {
      p.socket.on('game:guess', (g) => guessChat.push(g));
    }

    // A wrong guess must not end the round while other guessers are still active.
    const wrongGuesser = guessers[0];
    const wrongRes = await ack(wrongGuesser.socket, 'game:submitGuess', { text: 'nonsense answer' });
    assert.equal(wrongRes.ok, true);
    assert.equal(wrongRes.correct, false);
    assert.equal(room.state, 'GUESSING_ACTIVE', 'a single wrong guess should not end the round');

    // Reveal only triggers once every guesser has guessed correctly (or on timeout).
    const rightGuesser = guessers[1];
    const rightRes = await ack(rightGuesser.socket, 'game:submitGuess', { text: correctPrompt });
    assert.equal(rightRes.ok, true);
    assert.equal(rightRes.correct, true);
    assert.equal(room.state, 'GUESSING_ACTIVE', 'reveal should wait for the remaining guesser');

    const wrongGuesserSecondTry = await ack(wrongGuesser.socket, 'game:submitGuess', { text: correctPrompt });
    assert.equal(wrongGuesserSecondTry.ok, true);
    assert.equal(wrongGuesserSecondTry.correct, true);

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(room.state, 'ROUND_REVEAL', 'last remaining guesser correct should trigger reveal');

    const correctChatEntry = guessChat.find((g) => g.playerId === rightGuesser.playerId);
    assert.equal(correctChatEntry.text, undefined, 'chat must not leak the answer text on a correct guess');
    const wrongChatEntry = guessChat.find((g) => g.playerId === wrongGuesser.playerId && g.correct === false);
    assert.equal(wrongChatEntry.text, 'nonsense answer');

    assert.equal(room.players.get(rightGuesser.playerId).score, 100);
    assert.equal(room.players.get(wrongGuesser.playerId).score, 100);
    assert.equal(room.players.get(actorId).score, 50, '25 points per correct guesser, both guessers got it');

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('disconnect then reconnect within grace period preserves the player and score', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const room = server.manager.getRoom(host.roomCode);
    room.players.get(p2.playerId).score = 50;

    p2.socket.close();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(room.players.get(p2.playerId).connected, false);

    // Reconnect using the same stable playerId, as the client would after a refresh.
    const rejoinSocket = connect(server.url);
    await waitFor(rejoinSocket, 'connect');
    const rejoinRes = await ack(rejoinSocket, 'room:join', {
      playerId: p2.playerId,
      name: 'Bob',
      roomCode: host.roomCode,
    });

    assert.equal(rejoinRes.ok, true);
    assert.equal(room.players.get(p2.playerId).connected, true);
    assert.equal(room.players.get(p2.playerId).score, 50, 'score survives reconnect');
    assert.equal(room.playerCount, 3, 'no duplicate player created on rejoin');

    rejoinSocket.close();
    host.socket.close();
    p3.socket.close();
  } finally {
    await server.close();
  }
});

test('room:leave removes the player immediately, no grace period', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.playerCount, 3);

    const rosterPromise = waitFor(host.socket, 'room:playersChanged');
    const leaveRes = await ack(p2.socket, 'room:leave', {});
    assert.equal(leaveRes.ok, true);

    const roster = await rosterPromise;
    assert.equal(roster.length, 2, 'Bob should be gone immediately, not just marked disconnected');
    assert.equal(room.players.has(p2.playerId), false);

    // A stale ack on a room they've already left should fail cleanly.
    const staleRes = await ack(p2.socket, 'game:startGame', { roundCount: 3, mode: 'SOUND_EFFECT' });
    assert.equal(staleRes.ok, false);
    assert.equal(staleRes.error, 'ROOM_NOT_FOUND');

    host.socket.close();
    p2.socket.close();
    p3.socket.close();
  } finally {
    await server.close();
  }
});

test('leaving as the actor mid-turn skips to the next turn instead of ending the game', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    await ack(host.socket, 'game:startGame', { roundCount: 3, mode: GAME_MODES[0] });
    const room = server.manager.getRoom(host.roomCode);
    const actorSocket = [host, p2, p3].find((p) => p.playerId === room.actorId).socket;
    const leavingActorId = room.actorId;

    const leaveRes = await ack(actorSocket, 'room:leave', {});
    assert.equal(leaveRes.ok, true);
    assert.equal(room.state, 'PROMPT_SELECTION', 'game continues into the next turn');
    assert.equal(room.roundNumber, 1, 'still round 1 — only one of three players has gone so far');
    assert.notEqual(room.actorId, leavingActorId);
    assert.equal(room.playerCount, 2);

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('playing a full short game ends at GAME_OVER, and playAgain returns to LOBBY for a new game', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);
    const room = server.manager.getRoom(host.roomCode);

    const roundCount = 3;
    await ack(host.socket, 'game:startGame', { roundCount, mode: GAME_MODES[0] });

    // A round is every player getting a turn, so 3 rounds * 3 players = 9 turns.
    const totalTurns = roundCount * 3;
    for (let turn = 1; turn <= totalTurns; turn += 1) {
      const actorSocket = [host, p2, p3].find((p) => p.playerId === room.actorId).socket;
      const guesserSockets = [host, p2, p3].filter((p) => p.playerId !== room.actorId).map((p) => p.socket);

      await ack(actorSocket, 'game:selectPrompt', { prompt: room.promptOptions[0].text });
      await ack(actorSocket, 'game:submitRecording', { modifier: 'ROBOT', audio: new Uint8Array([1]).buffer });
      const prompt = room.currentPrompt;
      for (const s of guesserSockets) {
        await ack(s, 'game:submitGuess', { text: prompt });
      }
      assert.equal(room.state, 'ROUND_REVEAL', 'everyone guessing correctly triggers reveal');

      // In production REVEAL_DURATION_MS's timer drives this; call directly
      // here rather than waiting out the real timer in a test.
      room.finishReveal();
      assert.equal(room.state, turn < totalTurns ? 'PROMPT_SELECTION' : 'GAME_OVER');
    }

    assert.equal(room.state, 'GAME_OVER');

    const playAgainRes = await ack(host.socket, 'game:playAgain', {});
    assert.equal(playAgainRes.ok, true);
    assert.equal(room.state, 'LOBBY');
    assert.equal(room.totalRounds, 0);

    // A new game can be configured immediately, in the same room.
    const secondGameRes = await ack(host.socket, 'game:startGame', { roundCount: 5, mode: GAME_MODES[1] });
    assert.equal(secondGameRes.ok, true);
    assert.equal(room.state, 'PROMPT_SELECTION');
    assert.equal(room.totalRounds, 5);
    assert.equal(room.currentMode, GAME_MODES[1]);

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('rejects joining a room that does not exist', async () => {
  const server = await startTestServer();
  try {
    const socket = connect(server.url);
    await waitFor(socket, 'connect');
    const res = await ack(socket, 'room:join', { playerId: 'x', name: 'X', roomCode: 'ZZZZ' });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'ROOM_NOT_FOUND');
    socket.close();
  } finally {
    await server.close();
  }
});

test('rejects creating a room with a profane player name', async () => {
  const server = await startTestServer();
  try {
    const socket = connect(server.url);
    await waitFor(socket, 'connect');
    const res = await ack(socket, 'room:create', { playerId: 'x', name: 'shithead' });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'NAME_NOT_ALLOWED');
    socket.close();
  } finally {
    await server.close();
  }
});

test('rejects a profane guess without recording it in the chat or scoring it', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    await ack(host.socket, 'game:startGame', { roundCount: 3, mode: GAME_MODES[0] });
    const room = server.manager.getRoom(host.roomCode);
    const actorSocket = [host, p2, p3].find((p) => p.playerId === room.actorId).socket;
    const guesser = [host, p2, p3].find((p) => p.playerId !== room.actorId);

    await ack(actorSocket, 'game:selectPrompt', { prompt: room.promptOptions[0].text });
    await ack(actorSocket, 'game:submitRecording', { modifier: 'ROBOT', audio: new Uint8Array([1]).buffer });

    const guessChat = [];
    guesser.socket.on('game:guess', (g) => guessChat.push(g));

    const res = await ack(guesser.socket, 'game:submitGuess', { text: 'shit' });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'GUESS_NOT_ALLOWED');
    assert.equal(room.guesses.length, 0, 'the profane guess must not be recorded');
    assert.equal(guessChat.length, 0, 'the profane guess must not reach the chat');
    assert.equal(room.players.get(guesser.playerId).score, 0);

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('game:startGame in CUSTOM mode validates and uses the submitted prompt list', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const tooFewRes = await ack(host.socket, 'game:startGame', {
      roundCount: 3,
      mode: 'CUSTOM',
      customPrompts: ['only one'],
    });
    assert.equal(tooFewRes.ok, false);
    assert.equal(tooFewRes.error, 'NOT_ENOUGH_CUSTOM_PROMPTS');

    const tooLongRes = await ack(host.socket, 'game:startGame', {
      roundCount: 3,
      mode: 'CUSTOM',
      customPrompts: ['fine', 'also fine', 'x'.repeat(200)],
    });
    assert.equal(tooLongRes.ok, false);
    assert.equal(tooLongRes.error, 'CUSTOM_PROMPT_TOO_LONG');

    const profaneRes = await ack(host.socket, 'game:startGame', {
      roundCount: 3,
      mode: 'CUSTOM',
      customPrompts: ['fine', 'also fine', 'shit'],
    });
    assert.equal(profaneRes.ok, false);
    assert.equal(profaneRes.error, 'CUSTOM_PROMPT_NOT_ALLOWED');

    const goodRes = await ack(host.socket, 'game:startGame', {
      roundCount: 3,
      mode: 'CUSTOM',
      customPrompts: ['Dad joke', 'Inside joke', 'Road trip story'],
    });
    assert.equal(goodRes.ok, true);

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.currentMode, 'CUSTOM');
    for (const option of room.promptOptions) {
      assert.ok(['Dad joke', 'Inside joke', 'Road trip story'].includes(option.text));
    }

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('PERFORMANCE mode: raters vote 1-5 stars, values stay hidden until reveal, actor scores the average', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const startRes = await ack(host.socket, 'game:startGame', { roundCount: 1, mode: 'PERFORMANCE' });
    assert.equal(startRes.ok, true);

    const room = server.manager.getRoom(host.roomCode);
    const actorId = room.actorId;
    const players = [host, p2, p3];
    const actor = players.find((p) => p.playerId === actorId);
    const raters = players.filter((p) => p.playerId !== actorId);

    const [{ text: chosenPrompt }] = room.promptOptions;
    await ack(actor.socket, 'game:selectPrompt', { prompt: chosenPrompt });

    const fakeAudio = new Uint8Array([1, 2, 3, 4]).buffer;
    const recRes = await ack(actor.socket, 'game:submitRecording', { modifier: 'ROBOT', audio: fakeAudio });
    assert.equal(recRes.ok, true);
    assert.equal(room.state, 'RATING_ACTIVE');

    const actorCannotRate = await ack(actor.socket, 'game:submitRating', { stars: 5 });
    assert.equal(actorCannotRate.ok, false);
    assert.equal(actorCannotRate.error, 'ACTOR_CANNOT_RATE');

    const stateChanges = {};
    for (const p of players) p.socket.on('game:stateChanged', (s) => { stateChanges[p.playerId] = s; });

    const rate1 = await ack(raters[0].socket, 'game:submitRating', { stars: 5 });
    assert.equal(rate1.ok, true);
    assert.equal(room.state, 'RATING_ACTIVE', 'one rater left');

    const rate2 = await ack(raters[1].socket, 'game:submitRating', { stars: 3 });
    assert.equal(rate2.ok, true);
    assert.equal(room.state, 'ROUND_REVEAL', 'last rater triggers reveal');

    await new Promise((r) => setTimeout(r, 50));
    for (const p of players) {
      assert.deepEqual(
        [...stateChanges[p.playerId].ratings].sort((a, b) => a.stars - b.stars),
        [{ playerId: raters[1].playerId, stars: 3 }, { playerId: raters[0].playerId, stars: 5 }],
        'ratings are visible to everyone, including the actor, once revealed',
      );
    }

    assert.equal(room.players.get(actorId).score, 160, 'average of 5 and 3 stars, times POINTS_PER_STAR (40)');

    for (const p of players) p.socket.close();
  } finally {
    await server.close();
  }
});

test('TELEPHONE mode relays through the chain and replays the original recording at reveal', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);
    const p4 = await makePlayer(server.url, 'Dan', host.roomCode);
    const all = [host, p2, p3, p4];
    const byId = Object.fromEntries(all.map((p) => [p.playerId, p]));

    const startRes = await ack(host.socket, 'game:startGame', { roundCount: 1, mode: 'TELEPHONE' });
    assert.equal(startRes.ok, true);

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.chainOrder.length, 2, '4 players should give a chain of 2');
    const [originatorId, relayerId] = room.chainOrder;
    const originator = byId[originatorId];
    const relayer = byId[relayerId];
    const guessers = all.filter((p) => !room.chainOrder.includes(p.playerId));
    assert.equal(guessers.length, 2);

    const selectRes = await ack(originator.socket, 'game:selectPrompt', { prompt: room.promptOptions[0].text });
    assert.equal(selectRes.ok, true);

    const originalAudio = new Uint8Array([9, 9, 9]).buffer;
    const recRes1 = await ack(originator.socket, 'game:submitRecording', { modifier: 'DISTORT', audio: originalAudio });
    assert.equal(recRes1.ok, true);
    assert.equal(room.state, 'RELAY_RECORDING');

    // Only the relayer should receive the originator's broadcast (not the guessers yet, not the originator themself).
    const relayerHeard = waitFor(relayer.socket, 'game:audioBroadcast');
    await relayerHeard;

    const recRes2 = await ack(relayer.socket, 'game:submitRecording', { modifier: 'DISTORT', audio: new Uint8Array([1]).buffer });
    assert.equal(recRes2.ok, true);
    assert.equal(room.state, 'GUESSING_ACTIVE');

    // Chain members — including the one no longer holding the mic — cannot guess.
    const originatorGuessRes = await ack(originator.socket, 'game:submitGuess', { text: room.currentPrompt });
    assert.equal(originatorGuessRes.ok, false);
    assert.equal(originatorGuessRes.error, 'ACTOR_CANNOT_GUESS');
    const relayerGuessRes = await ack(relayer.socket, 'game:submitGuess', { text: room.currentPrompt });
    assert.equal(relayerGuessRes.ok, false);
    assert.equal(relayerGuessRes.error, 'ACTOR_CANNOT_GUESS');

    const revealPromise = waitFor(guessers[0].socket, 'game:originalAudioReveal');
    for (const g of guessers) {
      const res = await ack(g.socket, 'game:submitGuess', { text: room.currentPrompt });
      assert.equal(res.ok, true);
    }
    assert.equal(room.state, 'ROUND_REVEAL', 'both guessers correct should trigger reveal');

    const revealPayload = await revealPromise;
    assert.equal(revealPayload.modifier, 'DISTORT');
    assert.ok(revealPayload.audio, 'the original hop-1 audio should be replayed at reveal');

    for (const p of all) p.socket.close();
  } finally {
    await server.close();
  }
});

test('WHO_SAID_IT mode: clip audio releases one at a time, and currentClipOwnerId is hidden until reveal', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);
    const all = [host, p2, p3];
    const byId = Object.fromEntries(all.map((p) => [p.playerId, p]));

    const stateChanges = {};
    for (const p of all) {
      p.socket.on('game:stateChanged', (s) => { stateChanges[p.playerId] = s; });
    }
    const audioReceived = { [host.playerId]: [], [p2.playerId]: [], [p3.playerId]: [] };
    for (const p of all) {
      p.socket.on('game:audioBroadcast', (payload) => audioReceived[p.playerId].push(payload));
    }

    const startRes = await ack(host.socket, 'game:startGame', { roundCount: 1, mode: 'WHO_SAID_IT' });
    assert.equal(startRes.ok, true);

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.state, 'GROUP_RECORDING');

    await new Promise((r) => setTimeout(r, 50));
    for (const p of all) {
      assert.equal(
        stateChanges[p.playerId].currentPrompt,
        room.currentPrompt,
        'the shared prompt is visible to everyone up front, unlike every other mode',
      );
    }

    // Each player's clip is a distinguishable buffer so it can be traced
    // back to its owner once broadcast.
    const clipFor = {
      [host.playerId]: new Uint8Array([1, 1, 1]).buffer,
      [p2.playerId]: new Uint8Array([2, 2, 2]).buffer,
      [p3.playerId]: new Uint8Array([3, 3, 3]).buffer,
    };

    await ack(host.socket, 'game:submitRecording', { modifier: 'ROBOT', audio: clipFor[host.playerId] });
    await ack(p2.socket, 'game:submitRecording', { modifier: 'ECHO', audio: clipFor[p2.playerId] });
    await new Promise((r) => setTimeout(r, 50));
    for (const p of all) {
      assert.equal(audioReceived[p.playerId].length, 0, 'no clip should release before everyone has recorded');
    }

    await ack(p3.socket, 'game:submitRecording', { modifier: 'DISTORT', audio: clipFor[p3.playerId] });
    assert.equal(room.state, 'MATCHING_ACTIVE', 'the state transition itself is synchronous with the last submission');

    await waitUntil(() => all.every((p) => audioReceived[p.playerId].length === 1));
    for (const p of all) {
      assert.equal(audioReceived[p.playerId].length, 1, 'exactly one clip released so far, to everyone including its owner');
    }
    const firstOwnerId = room.clipOrder[0];
    const releasedBytes = new Uint8Array(audioReceived[firstOwnerId][0].audio);
    assert.deepEqual([...releasedBytes], [...new Uint8Array(clipFor[firstOwnerId])], 'the released clip matches its true owner, not some other player');

    // Redaction: only the real owner sees currentClipOwnerId as themself; everyone else sees null.
    for (const p of all) {
      const expected = p.playerId === firstOwnerId ? firstOwnerId : null;
      assert.equal(stateChanges[p.playerId].currentClipOwnerId, expected);
    }

    // The two non-owners guess correctly; the round has 3 clips so this only resolves clip 1.
    const guessers = all.filter((p) => p.playerId !== firstOwnerId);
    for (const g of guessers) {
      const res = await ack(g.socket, 'game:submitMatchGuess', { guessedPlayerId: firstOwnerId });
      assert.equal(res.ok, true);
    }
    assert.equal(room.state, 'MATCHING_ACTIVE', 'two more clips still to go');
    assert.equal(room.clipIndex, 1);

    const secondOwnerId = room.clipOrder[1];
    assert.notEqual(secondOwnerId, firstOwnerId);
    await waitUntil(() => all.every((p) => stateChanges[p.playerId].clipIndex === 1));
    for (const p of all) {
      const expected = p.playerId === secondOwnerId ? secondOwnerId : null;
      assert.equal(stateChanges[p.playerId].currentClipOwnerId, expected, 'redaction updates for the new clip');
    }

    // Resolve the remaining two clips so the round reveals.
    while (room.state === 'MATCHING_ACTIVE') {
      const ownerId = room.clipOrder[room.clipIndex];
      const eligible = all.filter((p) => p.playerId !== ownerId);
      for (const g of eligible) {
        await ack(byId[g.playerId].socket, 'game:submitMatchGuess', { guessedPlayerId: ownerId });
      }
    }
    assert.equal(room.state, 'ROUND_REVEAL');
    await waitUntil(() => all.every((p) => stateChanges[p.playerId]?.state === 'ROUND_REVEAL'));

    for (const p of all) {
      assert.equal(
        stateChanges[p.playerId].currentClipOwnerId,
        room.clipOrder[room.clipOrder.length - 1],
        'once revealed, everyone sees the (last) clip owner',
      );
      assert.equal(stateChanges[p.playerId].clipResults.length, 3, 'clipResults are visible to everyone at reveal');
    }

    for (const p of all) p.socket.close();
  } finally {
    await server.close();
  }
});

test('an actor who never picks a prompt gets one auto-selected after the timeout', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    await ack(host.socket, 'game:startGame', { roundCount: 1, mode: GAME_MODES[0] });
    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.state, 'PROMPT_SELECTION');

    // Real-time wait: exercises the actual server-side phase timer rather
    // than a simulated shortcut. Regression test for a bug where the timeout
    // passed the whole prompt object instead of its .text, so selectPrompt
    // always threw and the round got stuck in PROMPT_SELECTION forever
    // whenever the actor never picked (e.g. went AFK).
    await new Promise((r) => setTimeout(r, PROMPT_SELECTION_DURATION_MS + 200));
    assert.equal(room.state, 'ACTOR_RECORDING', 'the timeout should auto-pick a prompt and advance the round');

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

// ---------- host controls ----------

test('game:startGame is rejected for a non-host player', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const res = await ack(p2.socket, 'game:startGame', { roundCount: 3, mode: GAME_MODES[0] });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'NOT_HOST');

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.state, 'LOBBY');

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('game:kickPlayer removes the target, notifies their socket, and bans them from rejoining', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const kickedPromise = waitFor(p2.socket, 'room:kicked');
    const res = await ack(host.socket, 'game:kickPlayer', { targetId: p2.playerId });
    assert.equal(res.ok, true);
    await kickedPromise; // just needs to arrive; no payload to assert on

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.players.has(p2.playerId), false);
    assert.equal(room.playerCount, 2);

    const rejoinRes = await ack(p2.socket, 'room:join', {
      playerId: p2.playerId,
      name: 'Bob',
      roomCode: host.roomCode,
    });
    assert.equal(rejoinRes.ok, false);
    assert.equal(rejoinRes.error, 'KICKED');

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('game:kickPlayer is rejected for a non-host player', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const res = await ack(p2.socket, 'game:kickPlayer', { targetId: p3.playerId });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'NOT_HOST');

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});

test('game:transferHost updates hostId and broadcasts room:hostChanged', async () => {
  const server = await startTestServer();
  try {
    const host = await makePlayer(server.url, 'Alice');
    const p2 = await makePlayer(server.url, 'Bob', host.roomCode);
    const p3 = await makePlayer(server.url, 'Cara', host.roomCode);

    const hostChangedPromise = waitFor(p2.socket, 'room:hostChanged');
    const res = await ack(host.socket, 'game:transferHost', { targetId: p2.playerId });
    assert.equal(res.ok, true);
    const newHostId = await hostChangedPromise;
    assert.equal(newHostId, p2.playerId);

    const room = server.manager.getRoom(host.roomCode);
    assert.equal(room.hostId, p2.playerId);

    // The old host can no longer start the game; the new one can.
    const oldHostStartRes = await ack(host.socket, 'game:startGame', { roundCount: 3, mode: GAME_MODES[0] });
    assert.equal(oldHostStartRes.ok, false);
    assert.equal(oldHostStartRes.error, 'NOT_HOST');

    const newHostStartRes = await ack(p2.socket, 'game:startGame', { roundCount: 3, mode: GAME_MODES[0] });
    assert.equal(newHostStartRes.ok, true);

    for (const p of [host, p2, p3]) p.socket.close();
  } finally {
    await server.close();
  }
});
