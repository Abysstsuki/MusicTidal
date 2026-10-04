import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { roomManager } from '../services/roomManager';
import { HttpError } from '../utils/httpError';
import { songKey, type Song, type SongReference, type BatchQueueFailure, type BatchQueueResult } from '../types/song';
import { musicProvider, neteaseSong, qqSong } from '../services/music/song';

function roomFor(req: Request) { return roomManager.member(String(req.params.roomId), (req as AuthRequest).user!.userId); }
function instance(req: Request) {
  if (!Number.isSafeInteger(req.body?.instanceId) || req.body.instanceId <= 0) throw new HttpError(400, '歌曲编号无效');
  return req.body.instanceId as number;
}
export const addSongToQueue = async (req: Request, res: Response) => {
  const raw = req.body?.song;
  if (!raw || !Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 300 ||
      typeof raw.artist !== 'string' || raw.artist.length > 500 || typeof raw.prcUrl !== 'string' || raw.prcUrl.length > 2000 ||
      !Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 86_400_000) throw new HttpError(400, '歌曲信息无效');
  const provider = musicProvider(raw.provider), room = roomFor(req); room.requireProvider(provider);
  if ((raw.mid !== undefined && (typeof raw.mid !== 'string' || !/^[a-zA-Z0-9]{1,40}$/.test(raw.mid))) ||
    (raw.mediaMid !== undefined && (typeof raw.mediaMid !== 'string' || !/^[a-zA-Z0-9]{0,40}$/.test(raw.mediaMid)))) throw new HttpError(400, '歌曲媒体标识无效');
  let song: Song;
  const version = provider === 'netease' ? room.credentialVersion : room.qqmusicVersion;
  if (provider === 'qqmusic') {
    const metadata = (await room.qqmusicClient.details([raw.id]))[0];
    if (!metadata) throw new HttpError(502, 'QQ 歌曲详情不可用');
    song = qqSong(metadata);
  } else {
    const { data } = await room.client.get('/song/detail', { params: { ids: String(raw.id) } });
    const metadata = data?.songs?.find((item: any) => Number(item.id) === raw.id);
    if (!metadata) throw new HttpError(502, '网易云歌曲详情不可用');
    song = neteaseSong(metadata, data.privileges?.find((item: any) => Number(item.id) === raw.id));
  }
  room.requireProvider(provider);
  if (room.closed || version !== (provider === 'netease' ? room.credentialVersion : room.qqmusicVersion)) throw new HttpError(409, '房主授权已变化，请重新点歌');
  res.json({ success: true, song: room.queue.enqueue(song) });
};

export const addSongsToQueue = async (req: Request, res: Response) => {
  const raw = req.body?.songs;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100 || raw.some(item =>
    !item || !Number.isSafeInteger(item.id) || item.id <= 0 || !['netease', 'qqmusic'].includes(item.provider))) {
    throw new HttpError(400, '每批请选择 1～100 首歌曲，并提供有效的平台和歌曲编号', 'INVALID_BATCH_SONGS');
  }
  const unique = new Map<string, SongReference>();
  for (const item of raw) unique.set(songKey(item), { provider: item.provider, id: item.id });
  const references = [...unique.values()], room = roomFor(req);
  const prepared = new Map<string, Song>();
  const failures = new Map<string, BatchQueueFailure>();
  const versions = { netease: room.credentialVersion, qqmusic: room.qqmusicVersion };
  const reject = (reference: SongReference, code: string, message: string) => {
    failures.set(songKey(reference), { ...reference, code, message });
  };
  await Promise.all((['netease', 'qqmusic'] as const).map(async provider => {
    const items = references.filter(item => item.provider === provider);
    if (!items.length) return;
    try {
      room.requireProvider(provider);
      const ids = items.map(item => item.id);
      let metadata: any[], privileges: any[] = [];
      if (provider === 'qqmusic') metadata = await room.qqmusicClient.details(ids);
      else {
        const { data } = await room.client.get('/song/detail', { params: { ids: ids.join(',') } });
        if (!Array.isArray(data?.songs)) throw new Error('Invalid song details');
        metadata = data.songs; privileges = data.privileges || [];
      }
      const byId = new Map(metadata.map(item => [Number(item.id || item.songid), item]));
      const rights = new Map(privileges.map(item => [Number(item.id), item]));
      for (const reference of items) {
        const detail = byId.get(reference.id);
        if (!detail) { reject(reference, 'SONG_UNAVAILABLE', '歌曲不存在或详情暂不可用'); continue; }
        try {
          const song = provider === 'qqmusic' ? qqSong(detail) : neteaseSong(detail, rights.get(reference.id));
          if (!song.name.trim() || song.id !== reference.id) throw new Error('Invalid song');
          prepared.set(songKey(reference), song);
        } catch { reject(reference, 'SONG_UNAVAILABLE', '歌曲详情暂不可用'); }
      }
    } catch (error) {
      const reason = error instanceof HttpError ? error.message : '歌曲详情服务暂不可用，请稍后重试';
      const code = error instanceof HttpError ? error.code || 'MUSIC_UNAVAILABLE' : 'MUSIC_UNAVAILABLE';
      for (const reference of items) reject(reference, code, reason);
    }
  }));
  // No songs are committed until all cloud requests finish and membership is rechecked.
  const currentRoom = roomFor(req);
  if (currentRoom !== room || room.closed) throw new HttpError(404, '房间已结束', 'ROOM_CLOSED');
  for (const reference of references) {
    const provider = reference.provider;
    if (versions[provider] !== (provider === 'netease' ? room.credentialVersion : room.qqmusicVersion)) {
      reject(reference, 'MUSIC_AUTHORIZATION_CHANGED', '房主授权已变化，请重试');
    } else if (room.bindingFor(provider).status !== 'bound') {
      reject(reference, 'MUSIC_BINDING_REQUIRED', `房主尚未有效绑定${provider === 'qqmusic' ? 'QQ 音乐' : '网易云'}`);
    }
  }
  const songs = references.flatMap(item => !failures.has(songKey(item)) && prepared.has(songKey(item)) ? [prepared.get(songKey(item))!] : []);
  const result: BatchQueueResult = { success: true, added: room.queue.enqueueMany(songs),
    failed: references.flatMap(item => failures.has(songKey(item)) ? [failures.get(songKey(item))!] : []),
    duplicateCount: raw.length - references.length };
  res.json(result);
};
export const getQueue = (req: Request, res: Response) => {
  const room = roomFor(req); res.json({ queue: room.queue.getQueue(), recommendations: room.queue.getRecommendationState(), revision: room.revision });
};
export const getCurrentPlayingSong = (req: Request, res: Response) => {
  const room = roomFor(req); res.json({ success: true, currentSong: room.queue.getPlayback(), revision: room.revision });
};
export const removeFromQueueHandler = (req: Request, res: Response) => { roomFor(req).queue.removeById(instance(req)); res.json({ success: true }); };
export const moveToTopHandler = (req: Request, res: Response) => { roomFor(req).queue.moveToTop(instance(req)); res.json({ success: true }); };
export const skipToNextHandler = (req: Request, res: Response) => {
  if (!Number.isSafeInteger(req.body?.playbackRevision)) throw new HttpError(400, '缺少当前播放版本');
  const room = roomFor(req); room.queue.skipToNext(req.body.playbackRevision);
  res.json({ success: true, playback: room.queue.getPlayback() });
};
export const startHeartModeHandler = async (req: Request, res: Response) => {
  const room = roomManager.host(String(req.params.roomId), (req as AuthRequest).user!.userId);
  const provider = musicProvider(req.body?.provider); room.requireProvider(provider);
  res.json({ success: true, recommendations: await room.queue.startHeartMode(provider) });
};
export const stopRecommendationsHandler = (req: Request, res: Response) => {
  const room = roomManager.host(String(req.params.roomId), (req as AuthRequest).user!.userId);
  res.json({ success: true, recommendations: room.queue.stopRecommendations() });
};
