// src/routes/index.ts
import { Router } from 'express';
import userRoutes from './userRoutes';
import authRoutes from './authRoutes';
import roomRoutes from './roomRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/rooms', roomRoutes);
router.get('/', (req, res) => {
  res.send('MusicParty 后端运行中！');
});

export default router;
