import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../middlewares/authMiddleware';
import { getUserById } from './userService';
import { roomManager, type RoomConnection } from './roomManager';
import { HttpError } from '../utils/httpError';

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
  const lastPong = new Map<WebSocket, number>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (Date.now() - (lastPong.get(ws) || 0) >= 60_000) ws.terminate();
      else if (ws.readyState === WebSocket.OPEN) ws.ping();
    }
  }, 30_000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
  wss.on('connection', ws => {
    let identity: { userId: number; roomId: string } | null = null;
    let authenticating = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const authDeadline = setTimeout(() => ws.close(4001, 'Authentication required'), 10_000);
    lastPong.set(ws, Date.now());
    ws.on('pong', () => lastPong.set(ws, Date.now()));
    const connection: RoomConnection = {
      send: event => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event)); },
      close: () => ws.close(4000, 'Room closed'),
    };
    ws.on('message', async raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (!identity) {
          if (authenticating) return;
          if (message.type !== 'AUTH' || typeof message.roomId !== 'string') throw new HttpError(401, '请先登录并加入房间');
          authenticating = true;
          const access = verifyAccessToken(message.token);
          const user = await getUserById(access.userId);
          if (!user) throw new HttpError(401, '请重新登录');
          if (ws.readyState !== WebSocket.OPEN) return;
          roomManager.member(message.roomId, user.id);
          identity = { userId: user.id, roomId: message.roomId };
          clearTimeout(authDeadline);
          expiry = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ERROR', roomId: identity!.roomId, payload: { error: '登录已过期，请重新登录', code: 'AUTH_EXPIRED' } }));
            ws.close(4001, 'Session expired');
          }, Math.max(0, access.expiresAt - Date.now()));
          roomManager.connect(identity.roomId, identity.userId, connection);
          return;
        }
        if (message.roomId !== identity.roomId) throw new HttpError(403, '房间不匹配');
        if (message.type === 'chat') roomManager.chat(identity.roomId, identity.userId, message.text);
        else throw new HttpError(400, '消息类型无效');
      } catch (error) {
        const problem = error instanceof HttpError ? error : new HttpError(400, '消息无效');
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ERROR', roomId: identity?.roomId, payload: { error: problem.message, code: problem.code || (problem.status === 401 ? 'AUTH_EXPIRED' : 'REQUEST_FAILED') } }));
        if (!identity) ws.close(4001, 'Admission failed');
      } finally { authenticating = false; }
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      clearTimeout(authDeadline); clearTimeout(expiry); lastPong.delete(ws);
      if (identity) roomManager.disconnect(identity.roomId, identity.userId, connection);
    });
  });
  return wss;
}
