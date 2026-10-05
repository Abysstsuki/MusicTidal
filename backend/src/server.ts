// src/server.ts
import app from './app';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { setupWebSocketServer } from './services/websocketServer';
import { roomManager } from './services/roomManager';

// 加载 .env（默认配置）
dotenv.config();

// 按环境加载覆盖配置：.env.production / .env.development 等
const envOverride = `.env.${process.env.NODE_ENV || 'development'}`;
const envOverridePath = path.resolve(process.cwd(), envOverride);
if (fs.existsSync(envOverridePath)) {
  dotenv.config({ path: envOverridePath, override: true });
  console.log(`已加载环境覆盖配置: ${envOverride}`);
}

const PORT = process.env.PORT || 3001;

async function startServer() {
  await roomManager.initializeSuperRoom();
  const server = http.createServer(app); // 使用 http server 包装 express

  // 启动 WebSocket 服务
  setupWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
  const shutdown = () => { roomManager.dispose(); server.close(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((error) => {
  console.error('启动服务器失败:', error);
  process.exit(1);
});
