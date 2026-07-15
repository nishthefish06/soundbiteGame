// Client-only convenience for quick re-joins during dev/testing — not a
// public room directory. There's no server endpoint to list active rooms;
// strangers still need an actual code, this just remembers ones *you've*
// been in so you're not retyping them.
const STORAGE_KEY = 'soundbite:recentRooms';
const MAX_ENTRIES = 5;

export function getRecentRooms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function rememberRoom(code, name) {
  const existing = getRecentRooms().filter((r) => r.code !== code);
  const updated = [{ code, name, lastJoinedAt: Date.now() }, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function forgetRoom(code) {
  const updated = getRecentRooms().filter((r) => r.code !== code);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
