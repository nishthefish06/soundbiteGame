import { GameState, PROMPT_SELECTION_DURATION_MS, RECORDING_PREP_DURATION_MS, RECORDING_DURATION_MS, RECORDING_GRACE_MS, GUESSING_DURATION_MS, RATING_DURATION_MS, GROUP_RECORDING_DURATION_MS, MATCHING_DURATION_MS, COMPOSING_DURATION_MS, SONG_REVEAL_DURATION_MS, REVEAL_DURATION_MS, DISCONNECT_GRACE_MS, MAX_CUSTOM_PROMPTS, MAX_CUSTOM_PROMPT_LENGTH } from '../game/constants.js';
import { redactSnapshotFor, redactGuessFor } from './redact.js';
import { isProfane } from '../game/profanity.js';

const MAX_NAME_LENGTH = 20;

// Attaches all room/game socket handlers to an existing Socket.io server.
// This is the only place that knows about socket.io, timers, or which
// socket belongs to which player — Room/RoomManager stay pure and untouched.
export function attachSocketHandlers(io, manager) {
  const playerSocketIds = new Map(); // playerId -> current socket.id
  const disconnectTimers = new Map(); // playerId -> Timeout
  const roomCleanups = new Map(); // roomCode -> () => void (clears that room's phase timer)
  // TELEPHONE mode only: the first hop's raw audio, kept around just long
  // enough to replay next to the prompt at ROUND_REVEAL. Room itself never
  // touches audio bytes, so this lives here rather than on the Room instance.
  const telephoneOriginalAudio = new Map(); // roomCode -> { modifier, audio }
  // WHO_SAID_IT mode only: every submitted clip, held here (not broadcast)
  // until matching actually needs it — releasing them all immediately, the
  // way every other mode's audio relay works, would let a client who
  // finishes recording early hear everyone else's clip before shuffling/
  // ordering is decided. Cleared once the round reaches ROUND_REVEAL.
  const whoSaidItClips = new Map(); // roomCode -> Map<playerId, { modifier, audio }>
  // SONG_RECREATION mode only: every submitted composition's audio, held
  // here (not broadcast) until reveal needs it — same "don't leak clips
  // early" reasoning as whoSaidItClips. Cleared once the round reaches
  // ROUND_REVEAL. No `modifier` field (voice effects don't apply to a
  // composed track).
  const songCompositionClips = new Map(); // roomCode -> Map<playerId, { audio }>

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
    telephoneOriginalAudio.delete(room.code);
    whoSaidItClips.delete(room.code);
    songCompositionClips.delete(room.code);
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
        wireBroadcasts(room, io, playerSocketIds, telephoneOriginalAudio, whoSaidItClips, songCompositionClips);
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

    socket.on('game:startGame', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { roundCount, mode, customPrompts } = payload;
        room.startGame(
          socket.data.playerId,
          roundCount,
          mode,
          mode === 'CUSTOM' ? sanitizeCustomPrompts(customPrompts) : undefined,
        );
        reply(ack, { ok: true });
      });
    });

    socket.on('game:playAgain', (_payload, ack) => {
      withRoom(socket, ack, (room) => {
        room.returnToLobby();
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

        if (room.currentMode === 'WHO_SAID_IT') {
          // Stashed *before* calling submitGroupRecording — on the last
          // submission that call synchronously transitions the room into
          // MATCHING_ACTIVE, whose stateChange handler (see wireBroadcasts'
          // MATCHING_ACTIVE branch below) synchronously reads this same map
          // to release clip 0's audio. Stashing after the call would lose
          // the race whenever the shuffle picks the very submission that
          // just closed the room as clip 0's owner — their clip wouldn't be
          // in the map yet and the broadcast would silently no-op.
          const clips = whoSaidItClips.get(room.code) ?? new Map();
          clips.set(socket.data.playerId, { modifier, audio });
          whoSaidItClips.set(room.code, clips);
          room.submitGroupRecording(socket.data.playerId, modifier);
          reply(ack, { ok: true });
          return;
        }

        // Capture before submitRecording() mutates chainIndex — this is only
        // true for TELEPHONE mode's very first hop, the one the originator sees.
        const isChainOriginHop = room.currentMode === 'TELEPHONE' && room.chainIndex === 0;
        room.submitRecording(socket.data.playerId, modifier);
        if (isChainOriginHop) telephoneOriginalAudio.set(room.code, { modifier, audio });
        socket.to(room.code).emit('game:audioBroadcast', { modifier, audio });
        reply(ack, { ok: true });
      });
    });

    // SONG_RECREATION mode only: mirrors game:submitRecording's WHO_SAID_IT
    // branch — stashed *before* calling room.submitComposition for the same
    // race reason (the last submission can synchronously transition into
    // SONG_REVEAL_ACTIVE, whose stateChange handler synchronously reads this
    // map to release composition 0's audio).
    socket.on('game:submitComposition', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { song, audio } = payload;
        if (!audio) throw new Error('MISSING_AUDIO');

        const clips = songCompositionClips.get(room.code) ?? new Map();
        clips.set(socket.data.playerId, { audio });
        songCompositionClips.set(room.code, clips);
        room.submitComposition(socket.data.playerId, song);
        reply(ack, { ok: true });
      });
    });

    socket.on('game:submitMatchGuess', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { guessedPlayerId } = payload;
        room.submitMatchGuess(socket.data.playerId, guessedPlayerId);
        reply(ack, { ok: true });
      });
    });

    socket.on('game:submitGuess', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { text } = payload;
        if (typeof text !== 'string' || !text.trim()) throw new Error('INVALID_GUESS');
        if (isProfane(text)) throw new Error('GUESS_NOT_ALLOWED');
        const guess = room.submitGuess(socket.data.playerId, text);
        reply(ack, { ok: true, correct: guess.correct });
      });
    });

    socket.on('game:submitRating', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { stars } = payload;
        room.submitRating(socket.data.playerId, stars);
        reply(ack, { ok: true });
      });
    });

    socket.on('game:kickPlayer', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { targetId } = payload;
        room.kickPlayer(socket.data.playerId, targetId);

        // The kicked player's own socket stays connected as far as
        // Socket.IO is concerned — without this, they'd just silently stop
        // receiving updates instead of being told why.
        const targetSocketId = playerSocketIds.get(targetId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('room:kicked');
          const targetSocket = io.sockets.sockets.get(targetSocketId);
          if (targetSocket) {
            targetSocket.leave(room.code);
            delete targetSocket.data.playerId;
            delete targetSocket.data.roomCode;
          }
          playerSocketIds.delete(targetId);
        }
        const pendingDisconnect = disconnectTimers.get(targetId);
        if (pendingDisconnect) {
          clearTimeout(pendingDisconnect);
          disconnectTimers.delete(targetId);
        }

        reply(ack, { ok: true });
      });
    });

    socket.on('game:transferHost', (payload = {}, ack) => {
      withRoom(socket, ack, (room) => {
        const { targetId } = payload;
        room.transferHost(socket.data.playerId, targetId);
        reply(ack, { ok: true });
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
          () => safely(() => room.selectPrompt(room.actorId, room.promptOptions[0].text)),
          PROMPT_SELECTION_DURATION_MS,
        );
      } else if (next === GameState.ACTOR_RECORDING || next === GameState.RELAY_RECORDING) {
        // Budget covers both the planning window and the recording itself —
        // the phase timer starts the moment the prompt/audio is shown, before
        // the actor has even hit Record.
        phaseTimer = setTimeout(
          () => safely(() => room.abortRound()),
          RECORDING_PREP_DURATION_MS + RECORDING_DURATION_MS + RECORDING_GRACE_MS,
        );
      } else if (next === GameState.GUESSING_ACTIVE) {
        phaseTimer = setTimeout(() => safely(() => room.endGuessing()), GUESSING_DURATION_MS);
      } else if (next === GameState.RATING_ACTIVE) {
        phaseTimer = setTimeout(() => safely(() => room.endRating()), RATING_DURATION_MS);
      } else if (next === GameState.GROUP_RECORDING) {
        phaseTimer = setTimeout(() => safely(() => room.finishGroupRecording()), GROUP_RECORDING_DURATION_MS);
      } else if (next === GameState.MATCHING_ACTIVE) {
        phaseTimer = setTimeout(() => safely(() => room.endMatching()), MATCHING_DURATION_MS);
      } else if (next === GameState.COMPOSING) {
        phaseTimer = setTimeout(() => safely(() => room.finishComposing()), COMPOSING_DURATION_MS);
      } else if (next === GameState.SONG_REVEAL_ACTIVE) {
        phaseTimer = setTimeout(() => safely(() => room.endSongReveal()), SONG_REVEAL_DURATION_MS);
      } else if (next === GameState.ROUND_REVEAL) {
        phaseTimer = setTimeout(() => safely(() => room.finishReveal()), REVEAL_DURATION_MS);
      }
    });

    return clear;
  }
}

// Broadcast wiring: relays Room events out to sockets, redacting per-viewer
// where the payload would otherwise leak the answer.
function wireBroadcasts(room, io, playerSocketIds, telephoneOriginalAudio, whoSaidItClips, songCompositionClips) {
  room.on('playersChanged', ({ players }) => {
    io.to(room.code).emit('room:playersChanged', players);
  });

  room.on('guess', ({ guess }) => {
    const player = room.players.get(guess.playerId);
    io.to(room.code).emit('game:guess', redactGuessFor(guess, player));
  });

  // Just a live headcount ("3 of 5 have rated") — never the star values
  // themselves, so no redaction is needed here.
  room.on('ratingProgress', ({ count, total }) => {
    io.to(room.code).emit('game:ratingProgress', { count, total });
  });

  // Same idea, for WHO_SAID_IT's simultaneous recording phase.
  room.on('groupRecordingProgress', ({ count, total }) => {
    io.to(room.code).emit('game:groupRecordingProgress', { count, total });
  });

  // Same idea, for SONG_RECREATION's simultaneous composing phase.
  room.on('composingProgress', ({ count, total }) => {
    io.to(room.code).emit('game:composingProgress', { count, total });
  });

  room.on('hostChanged', ({ hostId }) => {
    io.to(room.code).emit('room:hostChanged', hostId);
  });

  room.on('stateChange', ({ next, snapshot }) => {
    if (next === GameState.ROUND_REVEAL) {
      const original = telephoneOriginalAudio.get(room.code);
      if (original) {
        io.to(room.code).emit('game:originalAudioReveal', original);
        telephoneOriginalAudio.delete(room.code);
      }
      whoSaidItClips.delete(room.code);
      songCompositionClips.delete(room.code);
    }

    // WHO_SAID_IT: release exactly one clip's audio per entry into
    // MATCHING_ACTIVE — room.clipOrder/clipIndex (the real Room instance,
    // not the redacted snapshot) say which clip that is. io.to (not
    // socket.to) since this is a server-initiated batch replay to everyone,
    // including that clip's own owner — harmless, and simpler than a
    // per-clip version of the "sender never gets their own broadcast back"
    // workaround every other mode's client needs.
    if (next === GameState.MATCHING_ACTIVE) {
      const clip = whoSaidItClips.get(room.code)?.get(room.clipOrder[room.clipIndex]);
      if (clip) io.to(room.code).emit('game:audioBroadcast', clip);
    }

    // SONG_RECREATION: same one-at-a-time release, keyed by songOrder/
    // songIndex instead. No `modifier` field on the stashed clip (composed
    // tracks don't have one) — the payload still carries the key so
    // useGameRoom's shared onAudioBroadcast handler doesn't need a
    // mode-specific branch.
    if (next === GameState.SONG_REVEAL_ACTIVE) {
      const clip = songCompositionClips.get(room.code)?.get(room.songOrder[room.songIndex]);
      if (clip) io.to(room.code).emit('game:audioBroadcast', { modifier: null, audio: clip.audio });
    }

    for (const player of room.playerList) {
      const socketId = playerSocketIds.get(player.id);
      if (socketId) {
        io.to(socketId).emit('game:stateChanged', redactSnapshotFor(snapshot, player.id));
      }
    }
  });
}

// Trims/dedupes/caps the host's freeform prompt list before it ever reaches
// Room.startGame — Room only checks the resulting count (NOT_ENOUGH_CUSTOM_PROMPTS),
// it doesn't know about raw payload hygiene or profanity.
function sanitizeCustomPrompts(customPrompts) {
  if (!Array.isArray(customPrompts)) throw new Error('INVALID_CUSTOM_PROMPTS');

  const cleaned = [...new Set(customPrompts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean))].slice(
    0,
    MAX_CUSTOM_PROMPTS,
  );

  if (cleaned.some((p) => p.length > MAX_CUSTOM_PROMPT_LENGTH)) throw new Error('CUSTOM_PROMPT_TOO_LONG');
  if (cleaned.some((p) => isProfane(p))) throw new Error('CUSTOM_PROMPT_NOT_ALLOWED');

  return cleaned;
}

function assertIdentity(playerId, name) {
  if (typeof playerId !== 'string' || !playerId.trim()) throw new Error('INVALID_PLAYER_ID');
  if (typeof name !== 'string' || !name.trim()) throw new Error('INVALID_NAME');
  if (name.trim().length > MAX_NAME_LENGTH) throw new Error('NAME_TOO_LONG');
  if (isProfane(name)) throw new Error('NAME_NOT_ALLOWED');
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
