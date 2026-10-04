import { createHash } from 'crypto';
import { neteaseBindings } from './binding.service';
import { createNeteaseClient, NeteaseApiError, type NeteaseClient } from '../../utils/neteaseHttp';
import { HttpError } from '../../utils/httpError';
import type { PlaylistIndex, PlaylistSummary } from '../../types/playlist';
import type { Song } from '../../types/song';

export function positiveId(value: unknown): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '编号无效');
  return id;
}
export function pagination(query: { offset?: unknown; limit?: unknown }) {
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  const limit = query.limit === undefined ? 30 : Number(query.limit);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, '分页参数无效，每页最多 100 首');
  return { offset, limit };
}
function summary(raw: any, uid = ''): PlaylistSummary {
  return { id: positiveId(raw.id), name: String(raw.name || '未命名歌单'), coverUrl: String(raw.coverImgUrl || ''),
    creator: String(raw.creator?.nickname || ''), trackCount: Number(raw.trackCount) || 0,
    isLiked: Number(raw.specialType) === 5 && String(raw.creator?.userId || raw.userId) === uid };
}
type Credential = Awaited<ReturnType<typeof neteaseBindings.credential>>;
export class PlaylistCatalog {
  private cache = new Map<string, { userId: number; expires: number; value: unknown }>();
  private versions = new Map<number, number>();
  constructor(private readonly credentials: (id: number) => Promise<Credential> = id => neteaseBindings.credential(id),
    private readonly clientFactory: (cookie: string) => NeteaseClient = createNeteaseClient,
    private readonly invalidate: (id: number, encrypted: string) => Promise<void> = (id, encrypted) => neteaseBindings.markInvalid(id, encrypted)) {}
  invalidateUser(userId: number) {
    this.versions.set(userId, (this.versions.get(userId) || 0) + 1);
    for (const [key, item] of this.cache) if (item.userId === userId) this.cache.delete(key);
  }
  private async context(userId: number) {
    const version = this.versions.get(userId) || 0;
    const credential = await this.credentials(userId);
    if ((this.versions.get(userId) || 0) !== version) throw new HttpError(409, '网易云绑定已变化，请重新打开歌单', 'NETEASE_BINDING_CHANGED');
    const identity = createHash('sha256').update(credential.cookie).digest('hex');
    const client = this.clientFactory(credential.cookie);
    const get = async (endpoint: string, params: Record<string, string | number>) => {
      try {
        const response = await client.get(endpoint, { params });
        if ((this.versions.get(userId) || 0) !== version) throw new HttpError(409, '网易云绑定已变化，请重新打开歌单', 'NETEASE_BINDING_CHANGED');
        if (response.data?.code !== 200) throw new HttpError(502, '歌单暂时无法读取，请稍后重试', 'PLAYLIST_UNAVAILABLE');
        return response.data;
      } catch (error) {
        if (error instanceof NeteaseApiError && (error.code === 301 || error.code === 401)) {
          if (credential.encrypted) await this.invalidate(userId, credential.encrypted);
          this.invalidateUser(userId);
          throw new HttpError(409, '网易云授权已过期，请重新绑定', 'NETEASE_BINDING_EXPIRED');
        }
        if (error instanceof HttpError) throw error;
        throw new HttpError(502, '歌单暂时无法读取，请稍后重试', 'PLAYLIST_UNAVAILABLE');
      }
    };
    const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
      const cacheKey = `${userId}:${version}:${identity}:${key}`;
      const found = this.cache.get(cacheKey);
      if (found && found.expires > Date.now()) return found.value as T;
      this.cache.delete(cacheKey);
      const value = await load();
      if ((this.versions.get(userId) || 0) !== version) throw new HttpError(409, '网易云绑定已变化，请重试', 'NETEASE_BINDING_CHANGED');
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(cacheKey, { userId, expires: Date.now() + 120000, value });
      return value;
    };
    return { credential, get, cached };
  }
  async list(userId: number, page: { offset: number; limit: number }) {
    const ctx = await this.context(userId);
    if (ctx.credential.binding.status !== 'bound' || !ctx.credential.binding.profile) throw new HttpError(409, '请先绑定网易云账号', 'NETEASE_BINDING_REQUIRED');
    const uid = ctx.credential.binding.profile.uid;
    return ctx.cached(`list:${page.offset}:${page.limit}`, async () => {
      const data = await ctx.get('/playlist/user', { uid, ...page });
      if (!Array.isArray(data.playlist)) throw new HttpError(502, '个人歌单暂不可用');
      const items = data.playlist.map((raw: any) => summary(raw, uid)).sort((a: PlaylistSummary, b: PlaylistSummary) => Number(b.isLiked) - Number(a.isLiked));
      return { items, ...page, hasMore: data.more === true, total: null };
    });
  }
  async search(userId: number, keyword: string, page: { offset: number; limit: number }) {
    if (!keyword.trim() || keyword.length > 100) throw new HttpError(400, '请输入 1–100 字的搜索关键词');
    const ctx = await this.context(userId);
    return ctx.cached(`search:${keyword}:${page.offset}:${page.limit}`, async () => {
      const data = await ctx.get('/playlist/search', { keywords: keyword.trim(), type: 1000, ...page });
      const result = data.result;
      if (!result) throw new HttpError(502, '歌单搜索暂不可用');
      const total = Number(result.playlistCount) || 0;
      return { items: (result.playlists || []).map((raw: any) => summary(raw, ctx.credential.binding.profile?.uid)),
        ...page, total, hasMore: page.offset + page.limit < total };
    });
  }
  async index(userId: number, playlistId: number): Promise<PlaylistIndex> {
    const ctx = await this.context(userId);
    return ctx.cached(`index:${playlistId}`, async () => {
      const data = await ctx.get('/playlist/detail', { id: playlistId });
      if (!data.playlist || !Array.isArray(data.playlist.trackIds)) throw new HttpError(404, '歌单不存在或不可访问', 'PLAYLIST_UNAVAILABLE');
      const trackIds = [...new Set<number>(data.playlist.trackIds.map((track: any) => positiveId(track.id)))];
      return { playlist: { ...summary(data.playlist, ctx.credential.binding.profile?.uid), trackCount: trackIds.length }, trackIds };
    });
  }
  async songs(userId: number, ids: number[]): Promise<Song[]> {
    const ctx = await this.context(userId);
    if (!ids.length) return [];
    if (ids.length > 100) throw new HttpError(400, '每次最多读取 100 首歌曲');
    return ctx.cached(`songs:${ids.join(',')}`, async () => {
      const data = await ctx.get('/song/detail', { ids: ids.join(',') });
      if (!Array.isArray(data.songs)) throw new HttpError(502, '歌曲详情暂不可用');
      const songs = new Map<number, Song>(data.songs.map((raw: any) => [Number(raw.id), {
        id: Number(raw.id), name: String(raw.name || ''), artist: (raw.ar || []).map((artist: any) => artist.name).join(', '),
        prcUrl: String(raw.al?.picUrl || ''), duration: Number(raw.dt) || 0,
      }]));
      return ids.flatMap(id => songs.has(id) ? [songs.get(id)!] : []);
    });
  }
  async tracks(userId: number, playlistId: number, page: { offset: number; limit: number }) {
    const index = await this.index(userId, playlistId);
    return { playlist: index.playlist, items: await this.songs(userId, index.trackIds.slice(page.offset, page.offset + page.limit)),
      ...page, total: index.trackIds.length, hasMore: page.offset + page.limit < index.trackIds.length };
  }
}
export const playlistCatalog = new PlaylistCatalog();
neteaseBindings.on('changed', userId => playlistCatalog.invalidateUser(userId));
