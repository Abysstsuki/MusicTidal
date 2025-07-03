// src/server.ts
import app from './app';
import dotenv from 'dotenv';
import http from 'http';
import { setupWebSocketServer } from './services/websocketServer';
import { verifyCookie } from './utils/axiosNetease';

dotenv.config();

const PORT = process.env.PORT || 3001;

async function startServer() {
  const isCookieValid = await verifyCookie();
  if (!isCookieValid) {
    console.warn('警告：网易云 Cookie 无效或未配置，部分功能可能受限');
  }

  const server = http.createServer(app); // 使用 http server 包装 express

  // 启动 WebSocket 服务
  setupWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('启动服务器失败:', error);
  process.exit(1);
});
