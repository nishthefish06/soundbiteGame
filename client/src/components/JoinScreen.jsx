import { useState } from 'react';

export function JoinScreen({ onCreate, onJoin, error }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);

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

  const canSubmit = name.trim().length > 0 && !busy;

  return (
    <div className="join-screen">
      <div className="join-card card">
        <h1 className="logo">
          🎙️ Soundbite
        </h1>
        <p className="tagline">Disguise your voice. Guess the bit.</p>

        <label className="field">
          <span className="field-label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Riley"
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

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
