import { Room } from './Room.js';

// Unambiguous alphabet: no 0/O, 1/I, etc.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

// In-memory registry of active rooms, keyed by room code. This is the
// entire "database" for the app — nothing here survives a server restart,
// which is fine for an ephemeral party game on a free-tier host.
export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom() {
    let code;
    do {
      code = generateCode();
    } while (this.rooms.has(code));

    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    if (!code) return undefined;
    return this.rooms.get(code.toUpperCase());
  }

  removeRoom(code) {
    this.rooms.delete(code);
  }

  pruneEmptyRooms() {
    for (const [code, room] of this.rooms) {
      if (room.playerCount === 0) this.rooms.delete(code);
    }
  }

  get roomCount() {
    return this.rooms.size;
  }
}

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
