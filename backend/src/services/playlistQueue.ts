import { randomUUID } from 'crypto';
import type { PlaylistEntry, PlaylistIndex, PlaylistOrder } from '../types/playlist';
import { HttpError } from '../utils/httpError';

type Entry = { index: PlaylistIndex; entryId: string; addedBy: { id: number; username: string }; remaining: number[];
  order: PlaylistOrder; repeat: boolean; priority: number[]; error: string | null; halted: boolean; failures: number };
export type PlaylistCandidate = { entryId: string; songId: number; userId: number; playlistId: number };
export class PlaylistQueue {
  private entries = new Map<string, Entry>();
  activeEntryId: string | null = null;
  get(entryId: string) {
    const entry = this.entries.get(entryId);
    if (!entry) throw new HttpError(404, '房间中没有这张歌单', 'PLAYLIST_NOT_FOUND');
    return entry;
  }
  snapshots(): PlaylistEntry[] {
    return [...this.entries.values()].map(entry => ({ ...entry.index.playlist, entryId: entry.entryId,
      addedBy: { ...entry.addedBy }, order: entry.order, repeat: entry.repeat,
      played: entry.index.trackIds.length - entry.remaining.length, remaining: entry.remaining.length,
      priorityNext: [...entry.priority], error: entry.error, completed: !entry.remaining.length && !entry.priority.length }));
  }
  add(index: PlaylistIndex, addedBy: { id: number; username: string }) {
    const found = [...this.entries.values()].find(entry => entry.index.playlist.id === index.playlist.id);
    if (found) return found.entryId;
    if (!index.trackIds.length) throw new HttpError(409, '这张歌单暂无歌曲', 'PLAYLIST_EMPTY');
    if (this.entries.size >= 50) throw new HttpError(409, '房间最多保留 50 张歌单');
    const entryId = randomUUID();
    this.entries.set(entryId, { index: { playlist: { ...index.playlist }, trackIds: [...index.trackIds] }, entryId,
      addedBy: { ...addedBy }, remaining: [...index.trackIds], order: 'sequential', repeat: false, priority: [], error: null, halted: false, failures: 0 });
    return entryId;
  }
  activate(entryId: string) {
    const entry = this.get(entryId);
    entry.halted = false; entry.error = null; entry.failures = 0;
    if (!entry.remaining.length && !entry.priority.length) this.resetRound(entry);
    this.activeEntryId = entryId;
  }
  settings(entryId: string, order: PlaylistOrder | undefined, repeat: boolean | undefined) {
    const entry = this.get(entryId);
    if (order !== undefined && order !== entry.order) {
      entry.order = order;
      const remaining = new Set(entry.remaining);
      entry.remaining = entry.index.trackIds.filter(id => remaining.has(id));
      if (order === 'shuffle') this.shuffle(entry.remaining);
    }
    if (repeat !== undefined) entry.repeat = repeat;
  }
  nominate(entryId: string, songId: number) {
    if (entryId !== this.activeEntryId) throw new HttpError(409, '只能为房间当前选定的歌单指定下一首', 'PLAYLIST_NOT_ACTIVE');
    const entry = this.get(entryId);
    if (!entry.index.trackIds.includes(songId)) throw new HttpError(400, '这首歌曲不在歌单内');
    if (!entry.priority.includes(songId)) entry.priority.push(songId);
  }
  peek(): PlaylistCandidate | null {
    if (!this.activeEntryId) return null;
    const entry = this.get(this.activeEntryId);
    if (entry.halted) return null;
    if (!entry.priority.length && !entry.remaining.length && entry.repeat) this.resetRound(entry);
    const songId = entry.priority[0] || entry.remaining[0];
    return songId ? { entryId: entry.entryId, songId, userId: entry.addedBy.id, playlistId: entry.index.playlist.id } : null;
  }
  consume(candidate: PlaylistCandidate, success: boolean) {
    const entry = this.get(candidate.entryId);
    entry.priority = entry.priority.filter(id => id !== candidate.songId);
    entry.remaining = entry.remaining.filter(id => id !== candidate.songId);
    entry.failures = success ? 0 : entry.failures + 1;
    if (entry.failures >= 10) this.block(candidate.entryId, '连续 10 首歌曲无法播放，请重新点击播放此歌单继续');
  }
  block(entryId: string, message: string) {
    const entry = this.get(entryId); entry.error = message; entry.halted = true;
  }
  invalidateSource(userId: number) {
    let active = false;
    for (const entry of this.entries.values()) if (entry.addedBy.id === userId) {
      entry.error = '添加者的网易云绑定已变化，请房主重新播放此歌单'; entry.halted = true;
      if (entry.entryId === this.activeEntryId) active = true;
    }
    return active;
  }
  remove(entryId: string) {
    this.get(entryId); this.entries.delete(entryId);
    if (this.activeEntryId === entryId) this.activeEntryId = null;
  }
  clear() { this.entries.clear(); this.activeEntryId = null; }
  private resetRound(entry: Entry) {
    entry.remaining = [...entry.index.trackIds];
    if (entry.order === 'shuffle') this.shuffle(entry.remaining);
  }
  private shuffle(ids: number[]) {
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  }
}
