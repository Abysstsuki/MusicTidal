import { Router } from 'express';
import type { AuthRequest } from '../middlewares/authMiddleware';
import { playlistCatalog, pagination, positiveId } from '../services/netease/playlist.service';
import { roomManager } from '../services/roomManager';
import { HttpError } from '../utils/httpError';
import { qqmusicPlaylistCatalog } from '../services/qqmusic/playlist.service';
import { musicProvider } from '../services/music/song';

function personalRoutes(catalog: typeof playlistCatalog) {
  const router = Router();
  router.get('/', async (req: AuthRequest, res) => { res.json(await catalog.list(req.user!.userId, pagination(req.query))); });
  router.get('/search', async (req: AuthRequest, res) => { res.json(await catalog.search(req.user!.userId, String(req.query.keywords || ''), pagination(req.query))); });
  router.get('/:playlistId/tracks', async (req: AuthRequest, res) => { res.json(await catalog.tracks(req.user!.userId, positiveId(req.params.playlistId), pagination(req.query))); });
  router.get('/:playlistId', async (req: AuthRequest, res) => { res.json({ playlist: (await catalog.index(req.user!.userId, positiveId(req.params.playlistId))).playlist }); });
  return router;
}
export const userPlaylistRoutes = personalRoutes(playlistCatalog);
export const qqmusicUserPlaylistRoutes = personalRoutes(qqmusicPlaylistCatalog);
const catalogFor = (provider: unknown) => musicProvider(provider) === 'qqmusic' ? qqmusicPlaylistCatalog : playlistCatalog;

export const roomPlaylistRoutes = Router({ mergeParams: true });
const member = (req: AuthRequest) => roomManager.member(String(req.params.roomId), req.user!.userId);
const controller = (req: AuthRequest) => roomManager.playbackController(String(req.params.roomId), req.user!.userId);
roomPlaylistRoutes.get('/', (req: AuthRequest, res) => { res.json(member(req).queue.getPlaylistState()); });
roomPlaylistRoutes.post('/', async (req: AuthRequest, res) => {
  const provider = musicProvider(req.body?.provider); member(req).requireProvider(provider);
  const index = await catalogFor(provider).index(req.user!.userId, positiveId(req.body?.playlistId));
  const room = member(req), addedBy = room.members.get(req.user!.userId)!;
  room.requireProvider(provider);
  const entryId = room.queue.addPlaylist(index, { id: addedBy.id, username: addedBy.username });
  res.json({ entryId, state: room.queue.getPlaylistState() });
});
roomPlaylistRoutes.get('/:entryId/tracks', async (req: AuthRequest, res) => {
  const room = member(req), entry = room.queue.playlists.get(String(req.params.entryId)), page = pagination(req.query);
  const catalog = catalogFor(entry.index.playlist.provider);
  const readerId = room.kind === 'super' ? req.user!.userId : entry.addedBy.id;
  await catalog.index(readerId, entry.index.playlist.id);
  const items = await catalog.songs(readerId, entry.index.trackIds.slice(page.offset, page.offset + page.limit));
  member(req).queue.playlists.get(entry.entryId);
  res.json({ playlist: entry.index.playlist, items, ...page, total: entry.index.trackIds.length, hasMore: page.offset + page.limit < entry.index.trackIds.length });
});
roomPlaylistRoutes.post('/:entryId/activate', async (req: AuthRequest, res) => {
  const room = controller(req), entry = room.queue.playlists.get(String(req.params.entryId));
  const provider = musicProvider(entry.index.playlist.provider); room.requireProvider(provider);
  if (room.kind !== 'super') await catalogFor(provider).index(entry.addedBy.id, entry.index.playlist.id);
  controller(req).requireProvider(provider); room.queue.activatePlaylist(entry.entryId); res.json(room.queue.getPlaylistState());
});
roomPlaylistRoutes.patch('/:entryId/settings', (req: AuthRequest, res) => {
  const room = controller(req), order = req.body?.order, repeat = req.body?.repeat;
  if ((order !== undefined && order !== 'sequential' && order !== 'shuffle') || (repeat !== undefined && typeof repeat !== 'boolean') || (order === undefined && repeat === undefined)) throw new HttpError(400, '播放设置无效');
  room.queue.setPlaylistSettings(String(req.params.entryId), order, repeat); res.json(room.queue.getPlaylistState());
});
roomPlaylistRoutes.post('/:entryId/next', (req: AuthRequest, res) => {
  const room = member(req); room.requireProvider(musicProvider(room.queue.playlists.get(String(req.params.entryId)).index.playlist.provider));
  room.queue.nominatePlaylistSong(String(req.params.entryId), positiveId(req.body?.songId)); res.json(room.queue.getPlaylistState());
});
roomPlaylistRoutes.delete('/:entryId', (req: AuthRequest, res) => {
  const room = controller(req); room.queue.removePlaylist(String(req.params.entryId)); res.json(room.queue.getPlaylistState());
});
