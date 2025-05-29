// src/routes/userRoutes.ts
import { Router } from 'express';

const router = Router();

router.get('/test', (req, res) => {
  res.send('User route is working!');
});

export default router;