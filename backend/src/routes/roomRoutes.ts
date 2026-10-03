import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';
import { roomManager } from '../services/roomManager';
import { getUserById } from '../services/userService';
import { HttpError } from '../utils/httpError';
import queueRoutes from './queueRoutes';
import neteaseRoutes from './netease.routes';

const router = Router();
router.get('/', (_req, res) => { res.json({ rooms: roomManager.list() }); });
router.use(authenticateToken);
router.post('/', async (req: AuthRequest, res) => {
  const user = await getUserById(req.user!.userId);
  if (!user) throw new HttpError(401, '请重新登录');
  const room = await roomManager.create(user, req.body?.name, req.body?.password);
  res.status(201).json({ room: room.summary() });
});
router.post('/:roomId/join', async (req: AuthRequest, res) => {
  const user = await getUserById(req.user!.userId);
  if (!user) throw new HttpError(401, '请重新登录');
  const room = await roomManager.join(String(req.params.roomId), user, req.body?.password);
  res.json({ room: room.summary() });
});
router.post('/:roomId/leave', (req: AuthRequest, res) => { roomManager.leave(String(req.params.roomId), req.user!.userId); res.json({ success: true }); });
router.use('/:roomId', (req: AuthRequest, res, next) => {
  res.locals.room = roomManager.member(String(req.params.roomId), req.user!.userId); next();
});
router.get('/:roomId/state', (_req, res) => { res.json(res.locals.room.state()); });
router.use('/:roomId/queue', queueRoutes);
router.use('/:roomId/netease', neteaseRoutes);
export default router;
