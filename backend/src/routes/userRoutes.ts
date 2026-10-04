import express from 'express';
import { getUserProfile } from '../controllers/userController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { AuthRequest } from '../middlewares/authMiddleware';
import { neteaseBindings } from '../services/netease/binding.service';
import { roomManager } from '../services/roomManager';
import { userPlaylistRoutes, qqmusicUserPlaylistRoutes } from './playlistRoutes';
import { qqmusicBindings } from '../services/qqmusic/binding.service';

const router = express.Router();

router.get('/me', authenticateToken, getUserProfile);
router.use(authenticateToken);
router.use('/netease/playlists', userPlaylistRoutes);
router.use('/qqmusic/playlists', qqmusicUserPlaylistRoutes);
router.get('/qqmusic', async (req: AuthRequest, res) => { res.json(await qqmusicBindings.status(req.user!.userId)); });
router.post('/qqmusic/qr', async (req: AuthRequest, res) => { res.json(await qqmusicBindings.createQr(req.user!.userId, req.body?.channel)); });
router.post('/qqmusic/qr/:sessionId/check', async (req: AuthRequest, res) => { res.json(await qqmusicBindings.checkQr(req.user!.userId, String(req.params.sessionId))); });
router.delete('/qqmusic/qr/:sessionId', async (req: AuthRequest, res) => { await qqmusicBindings.cancelQr(req.user!.userId, String(req.params.sessionId)); res.json({ success: true }); });
router.delete('/qqmusic', async (req: AuthRequest, res) => { await qqmusicBindings.unbind(req.user!.userId); res.json({ success: true }); });
router.get('/active-room', (req: AuthRequest, res) => { res.json({ room: roomManager.active(req.user!.userId) }); });
router.get('/netease', async (req: AuthRequest, res) => { res.json(await neteaseBindings.status(req.user!.userId)); });
router.post('/netease/qr', async (req: AuthRequest, res) => { res.json(await neteaseBindings.createQr(req.user!.userId)); });
router.post('/netease/qr/:sessionId/check', async (req: AuthRequest, res) => { res.json(await neteaseBindings.checkQr(req.user!.userId, String(req.params.sessionId))); });
router.delete('/netease/qr/:sessionId', async (req: AuthRequest, res) => { await neteaseBindings.cancelQr(req.user!.userId, String(req.params.sessionId)); res.json({ success: true }); });
router.delete('/netease', async (req: AuthRequest, res) => { await neteaseBindings.unbind(req.user!.userId); res.json({ success: true }); });
router.post('/logout', async (req: AuthRequest, res) => {
  await neteaseBindings.cancelAll(req.user!.userId);
  await qqmusicBindings.cancelAll(req.user!.userId);
  const active = roomManager.active(req.user!.userId);
  if (active) roomManager.leave(active.id, req.user!.userId);
  res.json({ success: true });
});

export default router;
