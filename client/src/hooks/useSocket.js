import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// One socket connection per app lifetime, with a stable per-browser playerId
// so a page refresh reconnects into the same room/seat (see Room.markReconnected
// on the server) instead of registering as a brand-new player.
function getStablePlayerId() {
  const key = 'soundbite:playerId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function useSocket() {
  const socketRef = useRef(null);
  const playerIdRef = useRef(null);
  const [connected, setConnected] = useState(false);
  if (!socketRef.current) {
    socketRef.current = io(SERVER_URL, { autoConnect: true });
  }
  // Computed once per mount, not on every render — localStorage.getItem is
  // live, so re-reading it on every render would silently change this tab's
  // identity mid-session if another same-origin tab ever writes a different
  // value to the same key (e.g. two tabs of the app open at once racing to
  // generate the initial id before either has written it back).
  if (!playerIdRef.current) {
    playerIdRef.current = getStablePlayerId();
  }

  useEffect(() => {
    const socket = socketRef.current;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketRef.current, connected, playerId: playerIdRef.current };
}
