import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomManager } from '../game/RoomManager.js';
import { GAME_MODES } from '../game/prompts.js';
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

test('leaving as the actor mid-round skips to the next round instead of ending the game', async () => {
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
    assert.equal(room.state, 'PROMPT_SELECTION', 'game continues into round 2');
    assert.equal(room.roundNumber, 2);
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

    await ack(host.socket, 'game:startGame', { roundCount: 3, mode: GAME_MODES[0] });

    for (let round = 1; round <= 3; round += 1) {
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
      assert.equal(room.state, round < 3 ? 'PROMPT_SELECTION' : 'GAME_OVER');
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
