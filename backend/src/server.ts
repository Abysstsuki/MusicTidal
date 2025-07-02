// src/server.ts
import app from './app';
import dotenv from 'dotenv';
import http from 'http';
import { setupWebSocketServer } from './services/websocketServer';

dotenv.config();

const PORT = process.env.PORT || 3001;
const server = http.createServer(app); // 使用 http server 包装 express
// 启动 WebSocket 服务
setupWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});