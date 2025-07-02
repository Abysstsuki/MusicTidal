// src/routes/index.ts
import { Router } from 'express';
import userRoutes from './userRoutes';
import authRoutes from './authRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.get('/', (req, res) => {
  res.send('MusicParty 后端运行中！');
});

export default router;