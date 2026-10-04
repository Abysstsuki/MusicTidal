import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { roomManager } from '../services/roomManager';
import { HttpError } from '../utils/httpError';
import type { Song } from '../types/song';
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
