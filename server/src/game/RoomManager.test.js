import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './RoomManager.js';

test('createRoom generates a 4-character code and registers the room', () => {
  const manager = new RoomManager();
  const room = manager.createRoom();
  assert.equal(room.code.length, 4);
  assert.equal(manager.getRoom(room.code), room);
});

test('getRoom is case-insensitive', () => {
  const manager = new RoomManager();
  const room = manager.createRoom();
  assert.equal(manager.getRoom(room.code.toLowerCase()), room);
});

test('getRoom returns undefined for unknown code', () => {
  const manager = new RoomManager();
  assert.equal(manager.getRoom('ZZZZ'), undefined);
  assert.equal(manager.getRoom(), undefined);
});

test('pruneEmptyRooms removes rooms with no players', () => {
  const manager = new RoomManager();
  const room = manager.createRoom();
  room.addPlayer('p0', 'Alice');
  room.removePlayer('p0');

  manager.pruneEmptyRooms();
  assert.equal(manager.getRoom(room.code), undefined);
});

test('room codes are unique across many rooms', () => {
  const manager = new RoomManager();
  const codes = new Set();
  for (let i = 0; i < 50; i += 1) {
    codes.add(manager.createRoom().code);
  }
  assert.equal(codes.size, 50);
});
