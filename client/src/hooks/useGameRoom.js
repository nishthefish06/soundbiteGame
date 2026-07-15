import { useCallback, useEffect, useRef, useState } from 'react';
import { rememberRoom } from '../recentRooms.js';

// Owns all room/game socket wiring so view components stay presentational:
// snapshot (redacted per-viewer by the server already), chat log, the
// incoming disguised-audio URL, and action creators for every client->server
// event. One state-entered timestamp is tracked per phase so the UI can show
// a local countdown without the server needing to send one.
export function useGameRoom(socket, playerId) {
  const [snapshot, setSnapshot] = useState(null);
  const [chat, setChat] = useState([]);
  const [incomingAudio, setIncomingAudio] = useState(null); // { modifier, url }
  const [error, setError] = useState(null);
  const [phaseEnteredAt, setPhaseEnteredAt] = useState(null);

  const incomingAudioUrlRef = useRef(null);
  const lastRoundRef = useRef(null);

  useEffect(() => {
    function onStateChanged(newSnapshot) {
      setSnapshot(newSnapshot);
      setPhaseEnteredAt(Date.now());
      if (newSnapshot.roundNumber !== lastRoundRef.current) {
        lastRoundRef.current = newSnapshot.roundNumber;
        setChat([]);
        setIncomingAudio((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return null;
        });
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

    socket.on('game:stateChanged', onStateChanged);
    socket.on('room:playersChanged', onPlayersChanged);
    socket.on('game:guess', onGuess);
    socket.on('game:audioBroadcast', onAudioBroadcast);
    return () => {
      socket.off('game:stateChanged', onStateChanged);
      socket.off('room:playersChanged', onPlayersChanged);
      socket.off('game:guess', onGuess);
      socket.off('game:audioBroadcast', onAudioBroadcast);
    };
  }, [socket]);

  useEffect(
    () => () => {
      if (incomingAudioUrlRef.current) URL.revokeObjectURL(incomingAudioUrlRef.current);
    },
    [],
  );
  incomingAudioUrlRef.current = incomingAudio?.url ?? null;

  const createRoom = useCallback(
    (name) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('room:create', { playerId, name }, (res) => {
          if (!res.ok) setError(res.error);
          else {
            setSnapshot(res.snapshot);
            rememberRoom(res.roomCode, name);
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
          setPhaseEnteredAt(null);
          lastRoundRef.current = null;
          resolve(res);
        });
      }),
    [socket],
  );

  const startGame = useCallback(
    (roundCount, mode) =>
      new Promise((resolve) => {
        setError(null);
        socket.emit('game:startGame', { roundCount, mode }, (res) => {
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

  return {
    snapshot,
    chat,
    incomingAudio,
    error,
    phaseEnteredAt,
    isActor: Boolean(snapshot && snapshot.actorId === playerId),
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playAgain,
    selectPrompt,
    submitRecording,
    submitGuess,
  };
}
