// Client-only saved prompt lists for CUSTOM mode — lets a host reuse the
// same friend-group inside jokes across games without retyping them every
// time. Mirrors recentRooms.js's localStorage conventions.
const STORAGE_KEY = 'soundbite:promptPacks';
const MAX_PACKS = 10;

export function getPromptPacks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePromptPack(name, prompts) {
  const trimmedName = name.trim();
  if (!trimmedName || prompts.length === 0) return getPromptPacks();

  const existing = getPromptPacks().filter((p) => p.name !== trimmedName);
  const updated = [{ name: trimmedName, prompts, savedAt: Date.now() }, ...existing].slice(0, MAX_PACKS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function deletePromptPack(name) {
  const updated = getPromptPacks().filter((p) => p.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
