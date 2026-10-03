import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { roomManager } from '../services/roomManager';
import { HttpError } from '../utils/httpError';
import type { Song } from '../types/song';

function roomFor(req: Request) { return roomManager.member(String(req.params.roomId), (req as AuthRequest).user!.userId); }
function instance(req: Request) {
  if (!Number.isSafeInteger(req.body?.instanceId) || req.body.instanceId <= 0) throw new HttpError(400, '歌曲编号无效');
  return req.body.instanceId as number;
}
export const addSongToQueue = (req: Request, res: Response) => {
  const raw = req.body?.song;
  if (!raw || !Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 300 ||
      typeof raw.artist !== 'string' || raw.artist.length > 500 || typeof raw.prcUrl !== 'string' || raw.prcUrl.length > 2000 ||
      !Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 86_400_000) throw new HttpError(400, '歌曲信息无效');
  const song: Song = { id: raw.id, name: raw.name, artist: raw.artist, prcUrl: raw.prcUrl, duration: raw.duration };
  res.json({ success: true, song: roomFor(req).queue.enqueue(song) });
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
  if (room.authorizationTask) throw new HttpError(409, '网易云授权正在更新，请稍后重试');
  if (room.binding.status !== 'bound') throw new HttpError(409, '请先绑定有效的网易云账号');
  res.json({ success: true, recommendations: await room.queue.startHeartMode() });
};
export const stopRecommendationsHandler = (req: Request, res: Response) => {
  const room = roomManager.host(String(req.params.roomId), (req as AuthRequest).user!.userId);
  res.json({ success: true, recommendations: room.queue.stopRecommendations() });
};
