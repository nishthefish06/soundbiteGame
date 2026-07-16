import { useState } from 'react';
import { getRecentRooms, forgetRoom } from '../recentRooms.js';
import { MicIcon } from './icons.jsx';

// Prefills the room code from a shared invite link (?room=XXXX) — see the
// header's "Copy invite" button in App.jsx, which is what generates these.
function roomCodeFromUrl() {
  return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() ?? '';
}

export function JoinScreen({ onCreate, onJoin, error }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(roomCodeFromUrl);
  const [busy, setBusy] = useState(false);
  const [recentRooms, setRecentRooms] = useState(getRecentRooms);

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    await onCreate(name.trim());
    setBusy(false);
  }

  async function handleJoin(e) {
    e.preventDefault();
    setBusy(true);
    await onJoin(name.trim(), roomCode.trim());
    setBusy(false);
  }

  async function handleQuickJoin(code) {
    setRoomCode(code);
    if (!name.trim()) return; // nothing to submit with yet — just prefilled the code
    setBusy(true);
    await onJoin(name.trim(), code);
    setBusy(false);
  }

  function handleForget(e, code) {
    e.stopPropagation();
    forgetRoom(code);
    setRecentRooms(getRecentRooms());
  }

  const canSubmit = name.trim().length > 0 && !busy;

  return (
    <div className="join-screen">
      <div className="join-card card">
        <h1 className="logo">
          <MicIcon className="logo-icon" /> Soundbite
        </h1>
        <p className="tagline">Disguise your voice. Guess the bit.</p>

        <label className="field">
          <span className="field-label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bob"
            maxLength={20}
            autoFocus
          />
        </label>

        <form onSubmit={handleCreate}>
          <button className="btn btn-primary btn-block" type="submit" disabled={!canSubmit}>
            Create a room
          </button>
        </form>

        <div className="divider"><span>or join one</span></div>

        <form className="join-row" onSubmit={handleJoin}>
          <input
            className="input input-code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={4}
          />
          <button className="btn btn-secondary" type="submit" disabled={!canSubmit || roomCode.trim().length === 0}>
            Join
          </button>
        </form>

        {recentRooms.length > 0 && (
          <div className="recent-rooms">
            <span className="field-label">Recent</span>
            <div className="recent-rooms-list">
              {recentRooms.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  className="recent-room-chip"
                  onClick={() => handleQuickJoin(r.code)}
                  disabled={busy}
                  title={name.trim() ? `Rejoin ${r.code}` : `Fill in your name, then rejoin ${r.code}`}
                >
                  {r.code}
                  <span className="recent-room-remove" onClick={(e) => handleForget(e, r.code)}>×</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
