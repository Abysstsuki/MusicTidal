// src/routes/index.ts
import { Router } from 'express';
import userRoutes from './userRoutes';

const router = Router();

router.use('/users', userRoutes);
router.get('/', (req, res) => {
  res.send('MusicParty 后端运行中');
});

export default router;