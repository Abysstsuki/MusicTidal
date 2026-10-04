// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { prisma } from './utils/prisma';

const app = express();

// 通用中间件
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API 响应禁用缓存，阻止浏览器返回 304
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// 路由
app.get('/api/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});
app.use('/api', routes);

// 错误处理
app.use(errorHandler);

export default app;
