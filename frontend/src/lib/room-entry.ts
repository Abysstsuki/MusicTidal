import type { RoomState, RoomSummary } from '@/types/room';

// Private snapshots cross a client-side navigation, never persistent storage.
let prepared: { token: string; expires: number; state: RoomState } | null = null;
export function prepareRoomEntry(state: RoomState, token: string) {
  prepared = { token, state, expires: Date.now() + 15000 };
}
export function preparedRoomEntry(roomId: string, token: string): RoomState | null {
  if (!prepared || prepared.expires <= Date.now() || prepared.token !== token || prepared.state.room.id !== roomId) return null;
  return prepared.state;
}
export function clearRoomEntry() { prepared = null; }

const lobbyKey = 'musictidal-lobby';
export function cachedLobby(): RoomSummary[] | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(lobbyKey) || 'null');
    return saved && saved.expires > Date.now() && Array.isArray(saved.rooms) ? saved.rooms : null;
  } catch { return null; }
}
export function cacheLobby(rooms: RoomSummary[]) {
  try { sessionStorage.setItem(lobbyKey, JSON.stringify({ rooms, expires: Date.now() + 30000 })); }
  catch { /* Fetching remains authoritative when storage is unavailable. */ }
}
