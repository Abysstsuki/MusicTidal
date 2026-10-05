import { neteaseHttp, type NeteaseClient } from '../../utils/neteaseHttp';
import type { Song } from '../../types/song';
import { neteaseSong } from '../music/song';

type NeteaseSong = {
  id?: number;
  name?: string;
  ar?: { name?: string }[];
  artists?: { name?: string }[];
  al?: { picUrl?: string };
  album?: { picUrl?: string };
  dt?: number;
  duration?: number;
};

let requestSequence = 0;

export class HeartModeError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'HeartModeError';
  }
}

export function normalizeRecommendedSongs(input: unknown): Song[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  return input.flatMap((raw: NeteaseSong | null) => {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id! <= 0 || typeof raw.name !== 'string' || !raw.name.trim() || seen.has(raw.id!)) return [];
    seen.add(raw.id!);
    const artists = raw.ar || raw.artists;
    const duration = raw.dt ?? raw.duration ?? 0;
    const cover = raw.al?.picUrl || raw.album?.picUrl;
    return [{
      ...neteaseSong(raw),
      id: raw.id!, name: raw.name.trim(),
      artist: Array.isArray(artists) ? artists.map(artist => artist?.name).filter(name => typeof name === 'string').join(', ') : '',
      prcUrl: typeof cover === 'string' ? cover : '',
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    }];
  });
}

export function normalizeHeartModeSongs(input: unknown): Song[] {
  if (!Array.isArray(input)) return [];
  return normalizeRecommendedSongs(input.map(item =>
    item && typeof item === 'object' && 'songInfo' in item ? item.songInfo : item,
  ));
}

async function requestHeartModeData(client: NeteaseClient, endpoint: string, params: Record<string, string | number> = {}) {
  try {
    const response = await client.get(endpoint, {
      params: { ...params, timestamp: Date.now() + '-' + ++requestSequence },
    });
    const body = response.data;
    if (body?.code === 301 || body?.code === 401) {
      throw new HeartModeError('房间的网易云登录已失效，请更新登录信息后重新开启', false);
    }
    if (body?.code !== 200) throw new HeartModeError('心动模式暂不可用', true);
    return body;
  } catch (error) {
    if (error instanceof HeartModeError) throw error;
    // Never forward upstream responses, cookies or request options to browsers/logs.
    const code = (error as { code?: unknown })?.code;
    if (code === 301 || code === 401) {
      throw new HeartModeError('房间的网易云登录已失效，请更新登录信息后重新开启', false);
    }
    throw new HeartModeError('心动模式请求失败', true);
  }
}

type HeartModeSource = { playlistId: number; seedIds: number[] };

function shuffleSeedIds(seedIds: number[], lastSeedId?: number): number[] {
  const shuffled = [...seedIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.length > 1 && shuffled[0] === lastSeedId) {
    const j = 1 + Math.floor(Math.random() * (shuffled.length - 1));
    [shuffled[0], shuffled[j]] = [shuffled[j], shuffled[0]];
  }
  return shuffled;
}

// A session belongs to one room activation. Stopped requests cannot change a new session's cursor.
export class HeartModeSession {
  private source: HeartModeSource | null = null;
  private sourceExpiresAt = 0;
  private seedIndex = 0;
  private lastSeedId?: number;
  private requestCount = 0;
  private pendingSongs: Song[] = [];

  // Keep the existing factory signature; the first seed now comes from the shuffled list.
  constructor(_initialSongId?: number, private readonly client: NeteaseClient = neteaseHttp) {}

  private async loadSource(): Promise<HeartModeSource> {
    if (this.source && this.sourceExpiresAt > Date.now()) return this.source;
    const account = await requestHeartModeData(this.client, '/user/account');
    const uid = Number(account.profile?.userId || account.account?.id);
    if (!Number.isSafeInteger(uid) || uid <= 0) {
      throw new HeartModeError('房间的网易云账号未登录，登录后才能使用心动模式', false);
    }

    let playlistId = 0;
    // Match the account's liked playlist by type and owner, never by a translated name.
    for (let page = 0; page < 5; page++) {
      const result = await requestHeartModeData(this.client, '/user/playlist', { uid, limit: 100, offset: page * 100 });
      if (!Array.isArray(result.playlist)) throw new HeartModeError('红心歌单暂时无法读取', true);
      const liked = result.playlist.find((playlist: { specialType?: number; userId?: number; creator?: { userId?: number } }) =>
        Number(playlist?.specialType) === 5 && Number(playlist.creator?.userId || playlist.userId) === uid,
      );
      if (liked) { playlistId = Number(liked.id); break; }
      if (result.more === false || result.playlist.length < 100) break;
    }
    if (!Number.isSafeInteger(playlistId) || playlistId <= 0) {
      throw new HeartModeError('没有找到房间网易云账号的红心歌单', false);
    }

    const liked = await requestHeartModeData(this.client, '/likelist', { uid });
    if (!Array.isArray(liked.ids)) throw new HeartModeError('红心歌曲暂时无法读取', true);
    const seedIds = [...new Set<number>(liked.ids.filter((id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0))];
    if (!seedIds.length) throw new HeartModeError('红心歌单为空，请先在网易云收藏歌曲', false);
    let orderedSeedIds: number[];
    if (this.source?.playlistId === playlistId) {
      // Refresh membership without replaying used seeds or reordering the remaining ones.
      const likedIds = new Set(seedIds);
      const knownIds = new Set(this.source.seedIds);
      const consumed = this.source.seedIds.slice(0, this.seedIndex).filter(id => likedIds.has(id));
      const remaining = this.source.seedIds.slice(this.seedIndex).filter(id => likedIds.has(id));
      for (const id of seedIds.filter(id => !knownIds.has(id))) {
        const index = Math.floor(Math.random() * (remaining.length + 1));
        remaining.splice(index, 0, id);
      }
      orderedSeedIds = [...consumed, ...remaining];
      this.seedIndex = consumed.length;
    } else {
      orderedSeedIds = shuffleSeedIds(seedIds, this.lastSeedId);
      this.seedIndex = 0;
      this.requestCount = 0;
    }
    this.source = { playlistId, seedIds: orderedSeedIds };
    this.sourceExpiresAt = Date.now() + 5 * 60_000;
    return this.source;
  }

  async nextSongs(): Promise<Song[]> {
    if (this.pendingSongs.length) return this.pendingSongs.splice(0, 3);
    const source = await this.loadSource();
    if (this.seedIndex >= source.seedIds.length) {
      source.seedIds = shuffleSeedIds(source.seedIds, this.lastSeedId);
      this.seedIndex = 0;
    }
    const seedId = source.seedIds[this.seedIndex];
    const result = await requestHeartModeData(this.client, '/playmode/intelligence/list', {
      id: seedId, pid: source.playlistId, sid: seedId, count: this.requestCount + 1,
    });
    if (!Array.isArray(result.data)) throw new HeartModeError('心动推荐列表暂时无法读取', true);
    this.seedIndex += 1;
    this.lastSeedId = seedId;
    this.requestCount += 1;
    this.pendingSongs = normalizeHeartModeSongs(result.data);
    return this.pendingSongs.splice(0, 3);
  }
}
