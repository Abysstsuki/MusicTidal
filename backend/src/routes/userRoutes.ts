import express from 'express';
import { getUserProfile } from '../controllers/userController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { AuthRequest } from '../middlewares/authMiddleware';
import { neteaseBindings } from '../services/netease/binding.service';
import { roomManager } from '../services/roomManager';

const router = express.Router();

router.get('/me', authenticateToken, getUserProfile);
router.use(authenticateToken);
router.get('/active-room', (req: AuthRequest, res) => { res.json({ room: roomManager.active(req.user!.userId) }); });
router.get('/netease', async (req: AuthRequest, res) => { res.json(await neteaseBindings.status(req.user!.userId)); });
router.post('/netease/qr', async (req: AuthRequest, res) => { res.json(await neteaseBindings.createQr(req.user!.userId)); });
router.post('/netease/qr/:sessionId/check', async (req: AuthRequest, res) => { res.json(await neteaseBindings.checkQr(req.user!.userId, String(req.params.sessionId))); });
router.delete('/netease/qr/:sessionId', async (req: AuthRequest, res) => { await neteaseBindings.cancelQr(req.user!.userId, String(req.params.sessionId)); res.json({ success: true }); });
router.delete('/netease', async (req: AuthRequest, res) => { await neteaseBindings.unbind(req.user!.userId); res.json({ success: true }); });
router.post('/logout', async (req: AuthRequest, res) => {
  await neteaseBindings.cancelAll(req.user!.userId);
  const active = roomManager.active(req.user!.userId);
  if (active) roomManager.leave(active.id, req.user!.userId);
  res.json({ success: true });
});

export default router;
