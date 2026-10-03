import { neteaseHttp } from '../../utils/neteaseHttp';
import type { Song } from '../../types/song';

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
      id: raw.id!, name: raw.name.trim(),
      artist: Array.isArray(artists) ? artists.map(artist => artist?.name).filter(name => typeof name === 'string').join(', ') : '',
      prcUrl: typeof cover === 'string' ? cover : '',
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    }];
  });
}

export async function getPersonalFmSongs(): Promise<Song[]> {
  try {
    const response = await neteaseHttp.get('/personal_fm', {
      // Retain unique request markers; the embedded adapter never caches recommendations.
      params: { timestamp: Date.now() + '-' + ++requestSequence },
    });
    const body = response.data;
    if (body?.code !== 200) throw new Error('Recommendation service unavailable');
    return normalizeRecommendedSongs(body.data);
  } catch {
    // Never forward upstream responses, cookies or request options to browsers/logs.
    throw new Error('私人 FM 暂不可用，请检查网易云登录状态或稍后重试');
  }
}
