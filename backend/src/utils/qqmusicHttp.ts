import type { Song, PlayInfo } from '../types/song';
import type { NeteaseClient } from './neteaseHttp';
import { HttpError } from './httpError';
import { qqSong } from '../services/music/song';
const api = require('../../vendor/qqmusic');
export class QqMusicClient implements NeteaseClient {
  private disposed = false;
  private controller = new AbortController();
  private cache = new Map<number, any>();
  private searches = new Map<string, { expires: number; value: any }>();
  private credentialVersion = 0;
  constructor(private cookie: string, private onExpired?: () => void | Promise<void>) {}
  updateCredential(cookie: string, onExpired?: () => void | Promise<void>) {
    if (this.disposed) return;
    this.cookie = cookie; this.onExpired = onExpired; ++this.credentialVersion;
  }
  dispose() { this.disposed = true; this.controller.abort(); this.cache.clear(); this.searches.clear(); }
  private async call<T>(work: (signal: AbortSignal) => Promise<T>, retried = false): Promise<T> {
    if (this.disposed) throw new HttpError(409, 'QQ 音乐绑定已变化', 'QQMUSIC_BINDING_CHANGED');
    const version = this.credentialVersion;
    try {
      const value = await work(this.controller.signal);
      if (this.disposed) throw new HttpError(409, 'QQ 音乐绑定已变化', 'QQMUSIC_BINDING_CHANGED');
      return value;
    } catch (error) {
      if (this.disposed) throw new HttpError(409, 'QQ 音乐绑定已变化', 'QQMUSIC_BINDING_CHANGED');
      if ((error as any).code === 'SEARCH_REJECTED') {
        throw new HttpError(502, this.cookie ? 'QQ 音乐搜索暂不可用，请稍后重试' : 'QQ 音乐匿名搜索暂不可用', 'QQMUSIC_SEARCH_UNAVAILABLE');
      }
      if ([1000, 104400, 104401].includes(Number((error as any).code))) {
        if (version !== this.credentialVersion) {
          if (!retried) return this.call(work, true);
          throw new HttpError(409, 'QQ 音乐授权已更新，请重试', 'QQMUSIC_BINDING_CHANGED');
        }
        await this.onExpired?.();
        if (!this.disposed && version !== this.credentialVersion && !retried) return this.call(work, true);
        throw new HttpError(409, 'QQ 音乐授权已过期，请重新绑定', 'QQMUSIC_BINDING_EXPIRED');
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, 'QQ 音乐接口暂不可用，请稍后重试', 'QQMUSIC_UNAVAILABLE');
    }
  }
  private remember(tracks: any[]) {
    for (const raw of tracks) {
      const id = Number(raw.id || raw.songid);
      if (!Number.isSafeInteger(id) || id < 1) continue;
      if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, raw);
    }
  }
  async details(ids: number[]): Promise<any[]> {
    const missing = ids.filter(id => !this.cache.has(id));
    if (missing.length) {
      const data: any = await this.call(signal => api.details(this.cookie, missing, signal));
      this.remember(data.tracks || data.songlist || []);
    }
    return ids.flatMap(id => this.cache.has(id) ? [this.cache.get(id)] : []);
  }
  async search(keyword: string, offset: number, limit: number) {
    const key = `${keyword}:${offset}:${limit}`, found = this.searches.get(key);
    if (found && found.expires > Date.now()) return found.value;
    const data: any = await this.call(signal => api.search(this.cookie, keyword, offset, limit, 0, signal));
    const raw = data.body?.song?.list || data.song?.list || [];
    this.remember(raw);
    const value = { songs: raw.map(qqSong), total: Number(data.meta?.sum || data.body?.song?.sum || data.song?.totalnum) || raw.length };
    if (this.searches.size >= 50) this.searches.delete(this.searches.keys().next().value!);
    this.searches.set(key, { value, expires: Date.now() + 30000 }); return value;
  }
  async play(song: Song): Promise<PlayInfo> {
    // Resolve metadata through the platform; client-supplied MID cannot select another song.
    const raw = (await this.details([song.id]))[0];
    if (!raw) throw new HttpError(502, 'QQ 歌曲详情不可用');
    const duration = Number(raw.interval) * 1000 || song.duration;
    const choose = (data: any) => {
      const item = data.midurlinfo?.find((info: any) => info.purl);
      const cdn = data.sip?.find((url: string) => /^https:\/\//.test(url)) || data.sip?.find((url: string) => /^http:\/\//.test(url));
      if (!item || !cdn) return null;
      const url = new URL(item.purl, cdn).toString();
      return { url, format: String(item.filename || item.purl).match(/\.(mp3|m4a|ogg|flac)(?:\?|$)/i)?.[1]?.toLowerCase() || 'mp3' };
    };
    let full: ReturnType<typeof choose> = null;
    try { full = choose(await this.call(signal => api.urls(this.cookie, raw, false, signal))); }
    catch (error) { if ((error as HttpError).code === 'QQMUSIC_BINDING_EXPIRED' || this.disposed) throw error; }
    if (full) return { ...full, time: duration, trial: false, originalDuration: duration, lyricOffset: 0, audioOffset: 0 };
    const start = Number(raw.file?.try_begin || 0), end = Number(raw.file?.try_end || 0);
    if (!(end > start)) throw new HttpError(502, 'QQ 音乐没有可用的完整或试听音频', 'NO_PLAYABLE_AUDIO');
    const trial = choose(await this.call(signal => api.urls(this.cookie, raw, true, signal)));
    if (!trial) throw new HttpError(502, 'QQ 音乐没有可用试听音频', 'NO_PLAYABLE_AUDIO');
    return { ...trial, time: end - start, trial: true, lyricOffset: start, audioOffset: 0, originalDuration: duration };
  }
  async lyric(id: number) { const raw = (await this.details([id]))[0]; return this.call(signal => api.lyric(this.cookie, id, raw?.mid || raw?.songmid, signal)); }
  async profile(): Promise<any> { return this.call(signal => api.profile(this.cookie, signal)); }
  async roam(previous: number[]): Promise<Song[]> {
    const data: any = await this.call(signal => api.roam(this.cookie, previous, signal));
    const songs = (data.tracks || data.songlist || []).map((item: any) => item.track_info || item.songInfo || item);
    this.remember(songs); return songs.map(qqSong).filter((song: Song) => song.id > 0);
  }
  // Preserve the existing bounded, per-user playlist catalog and REST shape.
  async get(endpoint: string, options: { params?: any } = {}): Promise<{ data: any }> {
    const p = options.params || {};
    if (endpoint === '/song/detail') return { data: { code: 200, songs: (await this.details(String(p.ids).split(',').map(Number))).map(raw => ({ ...qqSong(raw), normalized: true })) } };
    const map = (raw: any) => ({ provider: 'qqmusic', id: raw.tid || raw.dissid || raw.disstid || raw.id,
      name: raw.title || raw.dissname || raw.name, coverImgUrl: raw.picurl || raw.logo || raw.cover || '',
      creator: { nickname: raw.creator?.name || raw.creator?.nick || raw.nickname || '' }, trackCount: raw.songnum || raw.song_count || 0 });
    if (endpoint === '/playlist/user') {
      const data = await this.profile(), lists = data.mydiss?.list || data.createdDissList || data.createdList || [];
      if (!Array.isArray(lists)) throw new HttpError(502, 'QQ 个人歌单暂不可用');
      const liked = Array.isArray(data.mymusic) ? data.mymusic.find((item: any) => Number(item.id) === 201 || Number(item.type) === 0) : null;
      const items = [{ ...map(liked || {}), id: 201, name: '我喜欢', specialType: 5, userId: p.uid }, ...lists.map(map)];
      const seen = new Set(items.map(item => Number(item.id))); let more = false;
      for (let offset = 0; offset < 50000; offset += 100) {
        const result: any = await this.call(signal => api.collected(this.cookie, offset, 100, signal));
        const batch = result.cdlist || result.list || [];
        for (const raw of batch) { const item = map(raw); if (!seen.has(Number(item.id))) { items.push(item); seen.add(Number(item.id)); } }
        more = result.hasmore === 1 || result.hasmore === true || Number(result.total || result.totalnum || 0) > offset + batch.length || batch.length === 100;
        if (!more || items.length > p.offset + p.limit || !batch.length) break;
      }
      return { data: { code: 200, playlist: items.slice(p.offset, p.offset + p.limit), more: more || p.offset + p.limit < items.length } };
    }
    if (endpoint === '/playlist/search') {
      const data: any = await this.call(signal => api.search(this.cookie, p.keywords, p.offset, p.limit, 3, signal));
      const items = data.body?.songlist?.list || data.body?.songlist?.listlist || data.songlist?.list || [];
      return { data: { code: 200, result: { playlists: items.map(map), playlistCount: Number(data.meta?.sum || data.body?.songlist?.sum) || items.length } } };
    }
    if (endpoint === '/playlist/detail' || endpoint === '/playlist/tracks') {
      const pageOnly = endpoint === '/playlist/tracks', offset = pageOnly ? Number(p.offset || 0) : 0, limit = pageOnly ? Number(p.limit || 30) : 100;
      const first: any = await this.call(signal => api.playlist(this.cookie, p.id, offset, limit, signal));
      if (!Array.isArray(first.songlist)) throw new HttpError(502, 'QQ 歌单歌曲暂不可用');
      const total = Number(first.total_song_num || first.songnum || first.dirinfo?.songnum || first.dissinfo?.songnum || 0);
      const playlist = { ...map(first.dirinfo || first.dissinfo || {}), id: p.id, trackCount: total,
        ...(p.id === 201 ? { name: '我喜欢', specialType: 5, userId: api.cookies(this.cookie).qqmusic_uin || api.cookies(this.cookie).uin } : {}) };
      const initial = first.songlist || []; this.remember(initial);
      if (pageOnly) return { data: { code: 200, playlist, songs: initial.map(qqSong), total: total || offset + initial.length,
        more: Boolean(first.hasmore) || offset + initial.length < total } };
      if (total > 50000) throw new HttpError(502, 'QQ 歌单歌曲数量超过读取上限');
      const batches = new Map<number, any[]>([[0, initial]]);
      if (total > 100 && initial.length) {
        // Full indexes are needed for shared shuffle/repeat; load at most three pages concurrently.
        let next = 100;
        await Promise.all(Array.from({ length: 3 }, async () => {
          while (next < total) {
            const begin = next; next += 100;
            const data: any = await this.call(signal => api.playlist(this.cookie, p.id, begin, 100, signal));
            batches.set(begin, data.songlist || []); this.remember(data.songlist || []);
          }
        }));
      } else if (first.hasmore && initial.length) {
        // Keep compatibility with responses that do not report a total.
        for (let begin = 100; begin < 50000; begin += 100) {
          const data: any = await this.call(signal => api.playlist(this.cookie, p.id, begin, 100, signal));
          const batch = data.songlist || []; batches.set(begin, batch); this.remember(batch);
          if (!batch.length || !data.hasmore) break;
          if (begin === 49900) throw new HttpError(502, 'QQ 歌单歌曲数量超过读取上限');
        }
      }
      const tracks = [...batches].sort(([left], [right]) => left - right).flatMap(([,batch]) => batch);
      return { data: { code: 200, playlist: { ...playlist, trackIds: tracks.map(raw => ({ id: Number(raw.id || raw.songid) })) } } };
    }
    throw new HttpError(404, 'QQ 音乐接口不存在');
  }
}
export const createQqMusicClient = (cookie: string, onExpired?: () => void | Promise<void>) => new QqMusicClient(cookie, onExpired);
