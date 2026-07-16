// Dev tool: joins fake players into an existing room so you can hit
// MIN_PLAYERS (3) and test solo without recruiting real people.
//
// Usage:
//   node scripts/bots.mjs <ROOM_CODE> [count]
//   npm run bots -- <ROOM_CODE> [count]
//
// Each bot auto-submits a short dummy recording the instant it becomes
// Actor (bots can't use a real mic), so the round always keeps moving
// instead of stalling for 20s waiting on them. As Guessers, bots stay
// silent — they don't know the real prompt when a human is Actor, so
// there's nothing honest for them to guess. That leaves the round to end
// via your own correct guess or the 60s guessing timeout, same as a real game.
import { io } from 'socket.io-client';

const [roomCode, countArg] = process.argv.slice(2);
const count = Number(countArg) || 2;

if (!roomCode) {
  console.error('Usage: node scripts/bots.mjs <ROOM_CODE> [count]');
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const BOT_NAMES = ['Bob', 'Cara', 'Dee', 'Evan', 'Finn', 'Gina', 'Hank'];

function makeDummyWavBuffer(durationSec = 1, freq = 440, sampleRate = 44100) {
  const numFrames = Math.floor(durationSec * sampleRate);
  const dataSize = numFrames * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numFrames; i += 1) {
    const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

function makeBot(name) {
  const socket = io(SERVER_URL, { transports: ['websocket'] });
  const playerId = `bot-${name}-${Math.random().toString(36).slice(2)}`;

  socket.on('connect', () => {
    socket.emit('room:join', { playerId, name, roomCode }, (res) => {
      console.log(`[${name}] ${res.ok ? `joined ${res.roomCode}` : `error: ${res.error}`}`);
    });
  });

  socket.on('game:stateChanged', (snapshot) => {
    console.log(`[${name}] state -> ${snapshot.state}${snapshot.actorId === playerId ? ' (I am actor)' : ''}`);

    const isRecordingPhase = snapshot.state === 'ACTOR_RECORDING' || snapshot.state === 'RELAY_RECORDING';
    if (isRecordingPhase && snapshot.actorId === playerId) {
      const modifier = snapshot.currentMode === 'TELEPHONE' ? 'DISTORT' : 'ROBOT';
      setTimeout(() => {
        const audio = makeDummyWavBuffer();
        socket.emit('game:submitRecording', { modifier, audio }, (res) => {
          if (!res.ok) console.log(`[${name}] submitRecording failed: ${res.error}`);
        });
      }, 500);
    }
  });

  socket.on('connect_error', (err) => console.error(`[${name}] connect_error:`, err.message));

  return socket;
}

const names = BOT_NAMES.slice(0, count);
names.forEach(makeBot);
console.log(`Connecting ${names.length} bot(s) to room ${roomCode}... (Ctrl+C to stop)`);
