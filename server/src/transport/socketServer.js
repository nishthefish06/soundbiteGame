import { GameState, PROMPT_SELECTION_DURATION_MS, RECORDING_DURATION_MS, RECORDING_GRACE_MS, GUESSING_DURATION_MS, REVEAL_DURATION_MS, DISCONNECT_GRACE_MS } from '../game/constants.js';
import { redactSnapshotFor, redactGuessFor } from './redact.js';

const MAX_NAME_LENGTH = 20;

// Attaches all room/game socket handlers to an existing Socket.io server.
// This is the only place that knows about socket.io, timers, or which
// socket belongs to which player — Room/RoomManager stay pure and untouched.
export function attachSocketHandlers(io, manager) {
  const playerSocketIds = new Map(); // playerId -> current socket.id
  const disconnectTimers = new Map(); // playerId -> Timeout
  const roomCleanups = new Map(); // roomCode -> () => void (clears that room's phase timer)

  function joinRoom(socket, room, playerId, name) {
    // Let Room reject first (e.g. ROOM_FULL) before we touch any socket state.
    if (room.players.has(playerId)) {
      room.markReconnected(playerId);
    } else {
      room.addPlayer(playerId, name);
    }

    const pending = disconnectTimers.get(playerId);
    if (pending) {
      clearTimeout(pending);
      disconnectTimers.delete(playerId);
    }

    playerSocketIds.set(playerId, socket.id);
    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    socket.join(room.code);
  }

  function withRoom(socket, ack, fn) {
    try {
      const room = manager.getRoom(socket.data.roomCode);
      if (!room) throw new Error('ROOM_NOT_FOUND');
      fn(room);
    } catch (err) {
      reply(ack, { ok: false, error: err.message });
    }
  }

  function scheduleRoomCleanup(room) {
    if (room.playerCount > 0) return;
    roomCleanups.get(room.code)?.();
    roomCleanups.delete(room.code);
    manager.removeRoom(room.code);
  }

  // A deliberate leave (unlike a dropped connection) removes the player
  // immediately — no point holding their seat via the disconnect grace period.
  function leaveRoom(socket, room, playerId) {
    const pending = disconnectTimers.get(playerId);
    if (pending) {
      clearTimeout(pending);
      disconnectTimers.delete(playerId);
    }
    playerSocketIds.delete(playerId);
    room.removePlayer(playerId);
    scheduleRoomCleanup(room);

    socket.leave(room.code);
    delete socket.data.playerId;
    delete socket.data.roomCode;
  }

  io.on('connection', (socket) => {
    socket.on('room:create', (payload = {}, ack) => {
      try {
        const { playerId, name } = payload;
        assertIdentity(playerId, name);
        const room = manager.createRoom();
        roomCleanups.set(room.code, wirePhaseTimers(room));
        wireBroadcasts(room, io, playerSocketIds);
        joinRoom(socket, room, playerId, name.trim());
        reply(ack, { ok: true, roomCode: room.code, snapshot: redactSnapshotFor(room.toJSON(), playerId) });
      } catch (err) {
        reply(ack, { ok: false, error: err.message });
      }
    });

    socket.on('room:join', (payload = {}, ack) => {
      try {
        const { playerId, name, roomCode } = payload;
        assertIdentity(playerId, name);
        const room = manager.getRoom(roomCode);
        if (!room) throw new Error('ROOM_NOT_FOUND');
        joinRoom(socket, room, playerId, name.trim());
        reply(ack, { ok: true, roomCode: room.code, snapshot: redactSnapshotFor(room.toJSON(), playerId) });
      } catch (err) {
        reply(ack, { ok: false, error: err.message });
      }
    });

    socket.on('room:leave', (_payload, ack) => {
      withRoom(socket, ack, (room) => {
        leaveRoom(socket, room, socket.data.playerId);
        reply(ack, { ok: true });
      });
    });

    socket.on('game:startRound', (_payload, ack) => {
      withRoom(socket, ack, (room) => {
        room.startRound();
        reply(ack, { ok: true });
      });
    });

    socket.on('game:selectPrompt', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { prompt } = payload;
        room.selectPrompt(socket.data.playerId, prompt);
        reply(ack, { ok: true });
      });
    });

    socket.on('game:submitRecording', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { modifier, audio } = payload;
        if (!audio) throw new Error('MISSING_AUDIO');
        room.submitRecording(socket.data.playerId, modifier);
        socket.to(room.code).emit('game:audioBroadcast', { modifier, audio });
        reply(ack, { ok: true });
      });
    });

    socket.on('game:submitGuess', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { text } = payload;
        if (typeof text !== 'string' || !text.trim()) throw new Error('INVALID_GUESS');
        const guess = room.submitGuess(socket.data.playerId, text);
        reply(ack, { ok: true, correct: guess.correct });
      });
    });

    socket.on('disconnect', () => {
      const { playerId, roomCode } = socket.data;
      if (!playerId || !roomCode) return;
      if (playerSocketIds.get(playerId) !== socket.id) return; // superseded by a newer connection

      const room = manager.getRoom(roomCode);
      if (!room) return;
      room.markDisconnected(playerId);

      const timeout = setTimeout(() => {
        disconnectTimers.delete(playerId);
        playerSocketIds.delete(playerId);
        room.removePlayer(playerId);
        scheduleRoomCleanup(room);
      }, DISCONNECT_GRACE_MS);
      disconnectTimers.set(playerId, timeout);
    });
  });

  // Phase timers: server-side backstops so a stuck/AFK client can never
  // freeze a room forever. Returns a function that clears the pending timer.
  function wirePhaseTimers(room) {
    let phaseTimer = null;
    const clear = () => {
      if (phaseTimer) {
        clearTimeout(phaseTimer);
        phaseTimer = null;
      }
    };

    room.on('stateChange', ({ next }) => {
      clear();
      if (next === GameState.PROMPT_SELECTION) {
        phaseTimer = setTimeout(
          () => safely(() => room.selectPrompt(room.actorId, room.promptOptions[0])),
          PROMPT_SELECTION_DURATION_MS,
        );
      } else if (next === GameState.ACTOR_RECORDING) {
        phaseTimer = setTimeout(
          () => safely(() => room.abortRound()),
          RECORDING_DURATION_MS + RECORDING_GRACE_MS,
        );
      } else if (next === GameState.GUESSING_ACTIVE) {
        phaseTimer = setTimeout(() => safely(() => room.endGuessing()), GUESSING_DURATION_MS);
      } else if (next === GameState.ROUND_REVEAL) {
        phaseTimer = setTimeout(() => safely(() => room.finishReveal()), REVEAL_DURATION_MS);
      }
    });

    return clear;
  }
}

// Broadcast wiring: relays Room events out to sockets, redacting per-viewer
// where the payload would otherwise leak the answer.
function wireBroadcasts(room, io, playerSocketIds) {
  room.on('playersChanged', ({ players }) => {
    io.to(room.code).emit('room:playersChanged', players);
  });

  room.on('guess', ({ guess }) => {
    const player = room.players.get(guess.playerId);
    io.to(room.code).emit('game:guess', redactGuessFor(guess, player));
  });

  room.on('stateChange', ({ snapshot }) => {
    for (const player of room.playerList) {
      const socketId = playerSocketIds.get(player.id);
      if (socketId) {
        io.to(socketId).emit('game:stateChanged', redactSnapshotFor(snapshot, player.id));
      }
    }
  });
}

function assertIdentity(playerId, name) {
  if (typeof playerId !== 'string' || !playerId.trim()) throw new Error('INVALID_PLAYER_ID');
  if (typeof name !== 'string' || !name.trim()) throw new Error('INVALID_NAME');
  if (name.trim().length > MAX_NAME_LENGTH) throw new Error('NAME_TOO_LONG');
}

function reply(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

// A phase timer racing a player action (e.g. the last guesser guesses right
// just as the guessing timer fires) is an expected, harmless collision —
// the state machine has already moved on via the other path.
function safely(fn) {
  try {
    fn();
  } catch {
    /* room already transitioned by another path; nothing to do */
  }
}
