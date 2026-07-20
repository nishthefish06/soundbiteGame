import { useCallback, useEffect, useRef, useState } from 'react';
import { rememberRoom } from '../recentRooms.js';

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
  const [error, setError] = useState(null);
  const [phaseEnteredAt, setPhaseEnteredAt] = useState(null);

  const incomingAudioUrlRef = useRef(null);
  const originalAudioUrlRef = useRef(null);
  // Keyed on turnNumber, not roundNumber — a round is now every player
  // getting a turn, so roundNumber only changes once per full cycle. Each
  // individual actor's turn still needs its own fresh chat/audio state.
  const lastTurnRef = useRef(null);

  useEffect(() => {
    function onStateChanged(newSnapshot) {
      setSnapshot(newSnapshot);
      setPhaseEnteredAt(Date.now());
      if (newSnapshot.turnNumber !== lastTurnRef.current) {
        lastTurnRef.current = newSnapshot.turnNumber;
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
      }
    }

    function onPlayersChanged(players) {
      setSnapshot((prev) => (prev ? { ...prev, players } : prev));
    }

    function onGuess(entry) {
      setChat((prev) => [...prev, entry]);
    }

    function onAudioBroadcast({ modifier, audio }) {
      const url = URL.createObjectURL(new Blob([audio], { type: 'audio/wav' }));
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
      setPhaseEnteredAt(null);
      lastTurnRef.current = null;
      clearRoomCodeInUrl();
      setError('KICKED');
    }

    socket.on('game:stateChanged', onStateChanged);
    socket.on('room:playersChanged', onPlayersChanged);
    socket.on('game:guess', onGuess);
    socket.on('game:audioBroadcast', onAudioBroadcast);
    socket.on('game:originalAudioReveal', onOriginalAudioReveal);
    socket.on('game:ratingProgress', onRatingProgress);
    socket.on('room:hostChanged', onHostChanged);
    socket.on('room:kicked', onKicked);
    return () => {
      socket.off('game:stateChanged', onStateChanged);
      socket.off('room:playersChanged', onPlayersChanged);
      socket.off('game:guess', onGuess);
      socket.off('game:audioBroadcast', onAudioBroadcast);
      socket.off('game:originalAudioReveal', onOriginalAudioReveal);
      socket.off('game:ratingProgress', onRatingProgress);
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
          setPhaseEnteredAt(null);
          lastTurnRef.current = null;
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
    error,
    phaseEnteredAt,
    isActor: Boolean(snapshot && snapshot.actorId === playerId),
    // TELEPHONE mode: true for every relay-chain member, not just whoever
    // currently holds the mic — none of them can guess this round.
    isChainMember: Boolean(snapshot?.chainOrder?.includes(playerId)),
    isHost: Boolean(snapshot && snapshot.hostId === playerId),
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playAgain,
    selectPrompt,
    submitRecording,
    submitGuess,
    submitRating,
    kickPlayer,
    transferHost,
  };
}
