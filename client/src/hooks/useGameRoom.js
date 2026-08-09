import { useCallback, useEffect, useRef, useState } from 'react';
import { rememberRoom } from '../recentRooms.js';
import { playCorrectGuessChime, triggerHaptic } from '../sfx.js';

// Keeps the address bar itself a valid invite link (?room=CODE) — so the
// "Copy invite" button isn't the only way to get a shareable URL; the
// browser's own URL works too, and reloading while in a room preserves it.
function setRoomCodeInUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', code);
  window.history.replaceState(null, '', url);
}

function clearRoomCodeInUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

// Builds one game-over recap entry from a just-left ROUND_REVEAL snapshot.
// Names are resolved now (rather than storing bare ids) so the recap still
// reads correctly even if that player later leaves the room.
function buildHistoryEntry(snapshot, audio) {
  const nameFor = (id) => snapshot.players.find((p) => p.id === id)?.name ?? 'Someone';

  if (snapshot.currentMode === 'WHO_SAID_IT') {
    // Several clips per round, not one — there's no single slot for
    // round-recap audio the way every other mode has, so this omits it
    // (GameOverView already treats `audio: null` as "nothing to play back").
    // correctGuesserNames stays empty on purpose: gameSuperlatives.js's
    // guess-based stats don't extend to per-clip matching in v1, so a
    // WHO_SAID_IT entry simply doesn't contribute to them.
    return {
      turnNumber: snapshot.turnNumber,
      mode: snapshot.currentMode,
      prompt: snapshot.currentPrompt,
      modifier: null,
      performerNames: snapshot.clipResults.map((r) => nameFor(r.clipOwnerId)),
      correctGuesserNames: [],
      ratings: [],
      clipResults: snapshot.clipResults.map((r) => ({
        ownerName: nameFor(r.clipOwnerId),
        correctGuesserNames: r.correctGuesserIds.map(nameFor),
      })),
      audio: null,
    };
  }

  const performerIds = snapshot.chainOrder.length > 0 ? snapshot.chainOrder : [snapshot.actorId];
  return {
    turnNumber: snapshot.turnNumber,
    mode: snapshot.currentMode,
    prompt: snapshot.currentPrompt,
    modifier: snapshot.currentModifier,
    performerNames: performerIds.map(nameFor),
    correctGuesserNames: snapshot.correctGuesserIds.map(nameFor),
    ratings: snapshot.ratings.map((r) => ({ name: nameFor(r.playerId), stars: r.stars })),
    audio, // { modifier, url } | null
  };
}

// Owns all room/game socket wiring so view components stay presentational:
// snapshot (redacted per-viewer by the server already), chat log, the
// incoming disguised-audio URL, and action creators for every client->server
// event. One state-entered timestamp is tracked per phase so the UI can show
// a local countdown without the server needing to send one.
export function useGameRoom(socket, playerId) {
  const [snapshot, setSnapshot] = useState(null);
  const [chat, setChat] = useState([]);
  const [incomingAudio, setIncomingAudio] = useState(null); // { modifier, url }
  const [originalAudio, setOriginalAudio] = useState(null); // { modifier, url } — TELEPHONE mode's reveal-time replay of hop 1
  const [ratingProgress, setRatingProgress] = useState(null); // { count, total } — PERFORMANCE mode's live "N of M rated" headcount
  const [recordingProgress, setRecordingProgress] = useState(null); // { count, total } — WHO_SAID_IT's live "N of M recorded" headcount
  const [roundHistory, setRoundHistory] = useState([]); // one entry per completed+revealed turn this game, for the game-over recap
  const [error, setError] = useState(null);
  const [phaseEnteredAt, setPhaseEnteredAt] = useState(null);

  const incomingAudioUrlRef = useRef(null);
  const originalAudioUrlRef = useRef(null);
  // Keyed on turnNumber, not roundNumber — a round is now every player
  // getting a turn, so roundNumber only changes once per full cycle. Each
  // individual actor's turn still needs its own fresh chat/audio state.
  const lastTurnRef = useRef(null);
  // Mirrors the full snapshot from the previous game:stateChanged event —
  // used to detect "we just left ROUND_REVEAL" for round-recap capture.
  // Kept as a ref (not read from `snapshot` state) so onStateChanged always
  // sees the truly-previous value instead of a stale closure.
  const prevSnapshotRef = useRef(null);
  // Mirrors incomingAudio, but updated synchronously inside onAudioBroadcast
  // rather than derived from React state, for the same stale-closure reason.
  // This is what a *guesser's* client has for "this round's audio".
  const latestAudioRef = useRef(null);
  // The actor's own submitted clip, captured client-side at submit time —
  // the only client that never receives its own audio back over the socket
  // (Socket.IO's socket.to() excludes the sender), so without this the
  // recap would be missing audio for every single-actor-mode turn.
  const ownAudioRef = useRef(null);

  useEffect(() => {
    function onStateChanged(newSnapshot) {
      setSnapshot(newSnapshot);
      setPhaseEnteredAt(Date.now());

      const prevSnapshot = prevSnapshotRef.current;
      // A round is "done" the moment we leave ROUND_REVEAL — whether that's
      // into the next turn's PROMPT_SELECTION (turnNumber changes) or into
      // GAME_OVER on the last round of the game (turnNumber does NOT change,
      // since GAME_OVER carries the same turnNumber as the reveal it follows
      // — see Room.js's _advanceTurnOrEndGame). Aborted rounds (actor
      // disconnects mid-recording) never reach ROUND_REVEAL at all, so they
      // never produce a recap entry, matching how they never got a reveal.
      const leavingReveal = prevSnapshot?.state === 'ROUND_REVEAL' && newSnapshot.state !== 'ROUND_REVEAL';
      let historyAudio = null;
      if (leavingReveal) {
        historyAudio = latestAudioRef.current ?? ownAudioRef.current;
        setRoundHistory((prev) => [...prev, buildHistoryEntry(prevSnapshot, historyAudio)]);
      }

      if (newSnapshot.turnNumber !== lastTurnRef.current) {
        lastTurnRef.current = newSnapshot.turnNumber;
        setChat([]);
        setIncomingAudio((prev) => {
          // Don't revoke a URL the recap just took ownership of.
          if (prev && prev.url !== historyAudio?.url) URL.revokeObjectURL(prev.url);
          return null;
        });
        setOriginalAudio((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return null;
        });
        setRatingProgress(null);
        setRecordingProgress(null);
      }

      if (leavingReveal) {
        if (ownAudioRef.current && ownAudioRef.current.url !== historyAudio?.url) {
          URL.revokeObjectURL(ownAudioRef.current.url);
        }
        latestAudioRef.current = null;
        ownAudioRef.current = null;
      }

      // A fresh game (or "play again") starting: the previous game's recap
      // no longer applies to what's about to be played.
      if (newSnapshot.state === 'LOBBY') {
        setRoundHistory((prev) => {
          for (const entry of prev) {
            if (entry.audio) URL.revokeObjectURL(entry.audio.url);
          }
          return [];
        });
      }

      prevSnapshotRef.current = newSnapshot;
    }

    function onPlayersChanged(players) {
      setSnapshot((prev) => (prev ? { ...prev, players } : prev));
    }

    function onGuess(entry) {
      setChat((prev) => [...prev, entry]);
      // Feedback only for the guesser's own correct guess, not the whole
      // room — the broadcast already reaches the guesser's own socket, so
      // no new event is needed to detect "it was me".
      if (entry.correct && entry.playerId === playerId) {
        playCorrectGuessChime();
        triggerHaptic();
      }
    }

    function onAudioBroadcast({ modifier, audio }) {
      const url = URL.createObjectURL(new Blob([audio], { type: 'audio/wav' }));
      latestAudioRef.current = { modifier, url };
      setIncomingAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { modifier, url };
      });
    }

    function onOriginalAudioReveal({ modifier, audio }) {
      const url = URL.createObjectURL(new Blob([audio], { type: 'audio/wav' }));
      setOriginalAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { modifier, url };
      });
    }

    function onRatingProgress({ count, total }) {
      setRatingProgress({ count, total });
    }

    function onGroupRecordingProgress({ count, total }) {
      setRecordingProgress({ count, total });
    }

    function onHostChanged(hostId) {
      setSnapshot((prev) => (prev ? { ...prev, hostId } : prev));
    }

    // Pushed when the host kicks this player — unlike every other reset
    // here, this isn't a response to something *we* did, so it can arrive
    // at any time. Cleanup mirrors leaveRoom()'s ack callback.
    function onKicked() {
      setSnapshot(null);
      setChat([]);
      setIncomingAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setOriginalAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setRatingProgress(null);
      setRecordingProgress(null);
      setRoundHistory((prev) => {
        for (const entry of prev) {
          if (entry.audio) URL.revokeObjectURL(entry.audio.url);
        }
        return [];
      });
      setPhaseEnteredAt(null);
      lastTurnRef.current = null;
      prevSnapshotRef.current = null;
      latestAudioRef.current = null;
      ownAudioRef.current = null;
      clearRoomCodeInUrl();
      setError('KICKED');
    }

    socket.on('game:stateChanged', onStateChanged);
    socket.on('room:playersChanged', onPlayersChanged);
    socket.on('game:guess', onGuess);
    socket.on('game:audioBroadcast', onAudioBroadcast);
    socket.on('game:originalAudioReveal', onOriginalAudioReveal);
    socket.on('game:ratingProgress', onRatingProgress);
    socket.on('game:groupRecordingProgress', onGroupRecordingProgress);
    socket.on('room:hostChanged', onHostChanged);
    socket.on('room:kicked', onKicked);
    return () => {
      socket.off('game:stateChanged', onStateChanged);
      socket.off('room:playersChanged', onPlayersChanged);
      socket.off('game:guess', onGuess);
      socket.off('game:audioBroadcast', onAudioBroadcast);
      socket.off('game:originalAudioReveal', onOriginalAudioReveal);
      socket.off('game:ratingProgress', onRatingProgress);
      socket.off('game:groupRecordingProgress', onGroupRecordingProgress);
      socket.off('room:hostChanged', onHostChanged);
      socket.off('room:kicked', onKicked);
    };
  }, [socket]);

  useEffect(
    () => () => {
      if (incomingAudioUrlRef.current) URL.revokeObjectURL(incomingAudioUrlRef.current);
      if (originalAudioUrlRef.current) URL.revokeObjectURL(originalAudioUrlRef.current);
    },
    [],
  );
  incomingAudioUrlRef.current = incomingAudio?.url ?? null;
  originalAudioUrlRef.current = originalAudio?.url ?? null;

  const createRoom = useCallback(
    (name) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('room:create', { playerId, name }, (res) => {
          if (!res.ok) setError(res.error);
          else {
            setSnapshot(res.snapshot);
            rememberRoom(res.roomCode, name);
            setRoomCodeInUrl(res.roomCode);
          }
          resolve(res);
        });
      }),
    [socket, playerId],
  );

  const joinRoom = useCallback(
    (name, roomCode) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('room:join', { playerId, name, roomCode: roomCode.trim().toUpperCase() }, (res) => {
          if (!res.ok) setError(res.error);
          else {
            setSnapshot(res.snapshot);
            rememberRoom(res.roomCode, name);
            setRoomCodeInUrl(res.roomCode);
          }
          resolve(res);
        });
      }),
    [socket, playerId],
  );

  const leaveRoom = useCallback(
    () =>
      new Promise((resolve) => {
        socket.emit('room:leave', {}, (res) => {
          setSnapshot(null);
          setChat([]);
          setIncomingAudio((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return null;
          });
          setOriginalAudio((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return null;
          });
          setRatingProgress(null);
          setRecordingProgress(null);
          setRoundHistory((prev) => {
            for (const entry of prev) {
              if (entry.audio) URL.revokeObjectURL(entry.audio.url);
            }
            return [];
          });
          setPhaseEnteredAt(null);
          lastTurnRef.current = null;
          prevSnapshotRef.current = null;
          latestAudioRef.current = null;
          ownAudioRef.current = null;
          clearRoomCodeInUrl();
          resolve(res);
        });
      }),
    [socket],
  );

  const startGame = useCallback(
    (roundCount, mode, customPrompts) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:startGame', { roundCount, mode, customPrompts }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const playAgain = useCallback(
    () =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:playAgain', {}, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const selectPrompt = useCallback(
    (prompt) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:selectPrompt', { prompt }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const submitRecording = useCallback(
    (modifier, blob) =>
      new Promise(async (resolve) => {
        setError(null);
        // Stashed before sending — this client never gets its own audio
        // broadcast back (see ownAudioRef's declaration above), so this is
        // the only chance to capture it for the round recap.
        ownAudioRef.current = { modifier, url: URL.createObjectURL(blob) };
        const audio = await blob.arrayBuffer();
        socket.emit('game:submitRecording', { modifier, audio }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const submitGuess = useCallback(
    (text) =>
      new Promise((resolve) => {
        socket.emit('game:submitGuess', { text }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const submitRating = useCallback(
    (stars) =>
      new Promise((resolve) => {
        socket.emit('game:submitRating', { stars }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  // WHO_SAID_IT mode only: guess at who recorded the clip currently playing.
  // GroupRecordingView reuses submitRecording as-is for the simultaneous
  // recording phase (same `{modifier, audio}` wire shape — the server tells
  // room.currentMode apart internally), so this is the only new action
  // creator this mode needs.
  const submitMatchGuess = useCallback(
    (guessedPlayerId) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:submitMatchGuess', { guessedPlayerId }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const kickPlayer = useCallback(
    (targetId) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:kickPlayer', { targetId }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  const transferHost = useCallback(
    (targetId) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:transferHost', { targetId }, (res) => {
          if (!res.ok) setError(res.error);
          resolve(res);
        });
      }),
    [socket],
  );

  return {
    snapshot,
    chat,
    incomingAudio,
    originalAudio,
    ratingProgress,
    recordingProgress,
    roundHistory,
    error,
    phaseEnteredAt,
    isActor: Boolean(snapshot && snapshot.actorId === playerId),
    // TELEPHONE mode: true for every relay-chain member, not just whoever
    // currently holds the mic — none of them can guess this round.
    isChainMember: Boolean(snapshot?.chainOrder?.includes(playerId)),
    // WHO_SAID_IT mode: true only while *this player's own* clip is the one
    // currently playing — everyone else who recorded is still eligible to
    // guess other players' clips, they just can't guess this one.
    isClipOwner: Boolean(snapshot && snapshot.currentClipOwnerId === playerId),
    isHost: Boolean(snapshot && snapshot.hostId === playerId),
    // Joined mid-game — can watch but can't guess/rate until the round
    // already in progress finishes (see Room.js's addPlayer/_promoteSpectators).
    isSpectating: Boolean(snapshot?.players?.find((p) => p.id === playerId)?.spectating),
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playAgain,
    selectPrompt,
    submitRecording,
    submitGuess,
    submitRating,
    submitMatchGuess,
    kickPlayer,
    transferHost,
  };
}
