import { Router } from 'express';
import type { AuthRequest } from '../middlewares/authMiddleware';
import { playlistCatalog, pagination, positiveId } from '../services/netease/playlist.service';
import { roomManager } from '../services/roomManager';
import { HttpError } from '../utils/httpError';

export const userPlaylistRoutes = Router();
userPlaylistRoutes.get('/', async (req: AuthRequest, res) => { res.json(await playlistCatalog.list(req.user!.userId, pagination(req.query))); });
userPlaylistRoutes.get('/search', async (req: AuthRequest, res) => { res.json(await playlistCatalog.search(req.user!.userId, String(req.query.keywords || ''), pagination(req.query))); });
userPlaylistRoutes.get('/:playlistId/tracks', async (req: AuthRequest, res) => { res.json(await playlistCatalog.tracks(req.user!.userId, positiveId(req.params.playlistId), pagination(req.query))); });
userPlaylistRoutes.get('/:playlistId', async (req: AuthRequest, res) => { res.json({ playlist: (await playlistCatalog.index(req.user!.userId, positiveId(req.params.playlistId))).playlist }); });

export const roomPlaylistRoutes = Router({ mergeParams: true });
const member = (req: AuthRequest) => roomManager.member(String(req.params.roomId), req.user!.userId);
const host = (req: AuthRequest) => roomManager.host(String(req.params.roomId), req.user!.userId);
roomPlaylistRoutes.get('/', (req: AuthRequest, res) => { res.json(member(req).queue.getPlaylistState()); });
roomPlaylistRoutes.post('/', async (req: AuthRequest, res) => {
  member(req);
  const index = await playlistCatalog.index(req.user!.userId, positiveId(req.body?.playlistId));
  const room = member(req), addedBy = room.members.get(req.user!.userId)!;
  const entryId = room.queue.addPlaylist(index, { id: addedBy.id, username: addedBy.username });
  res.json({ entryId, state: room.queue.getPlaylistState() });
});
roomPlaylistRoutes.get('/:entryId/tracks', async (req: AuthRequest, res) => {
  const room = member(req), entry = room.queue.playlists.get(String(req.params.entryId)), page = pagination(req.query);
  await playlistCatalog.index(entry.addedBy.id, entry.index.playlist.id);
  const items = await playlistCatalog.songs(entry.addedBy.id, entry.index.trackIds.slice(page.offset, page.offset + page.limit));
  member(req).queue.playlists.get(entry.entryId);
  res.json({ playlist: entry.index.playlist, items, ...page, total: entry.index.trackIds.length, hasMore: page.offset + page.limit < entry.index.trackIds.length });
});
roomPlaylistRoutes.post('/:entryId/activate', async (req: AuthRequest, res) => {
  const room = host(req), entry = room.queue.playlists.get(String(req.params.entryId));
  await playlistCatalog.index(entry.addedBy.id, entry.index.playlist.id);
  host(req).queue.activatePlaylist(entry.entryId); res.json(room.queue.getPlaylistState());
});
roomPlaylistRoutes.patch('/:entryId/settings', (req: AuthRequest, res) => {
  const room = host(req), order = req.body?.order, repeat = req.body?.repeat;
  if ((order !== undefined && order !== 'sequential' && order !== 'shuffle') || (repeat !== undefined && typeof repeat !== 'boolean') || (order === undefined && repeat === undefined)) throw new HttpError(400, '播放设置无效');
  room.queue.setPlaylistSettings(String(req.params.entryId), order, repeat); res.json(room.queue.getPlaylistState());
});
roomPlaylistRoutes.post('/:entryId/next', (req: AuthRequest, res) => {
  const room = member(req); room.queue.nominatePlaylistSong(String(req.params.entryId), positiveId(req.body?.songId)); res.json(room.queue.getPlaylistState());
});
roomPlaylistRoutes.delete('/:entryId', (req: AuthRequest, res) => {
  const room = host(req); room.queue.removePlaylist(String(req.params.entryId)); res.json(room.queue.getPlaylistState());
});
