// services/websocketServer.ts
import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const onlineUsers = new Set<string>();
const recentMessages: { username: string; text: string }[] = [];
const MAX_HISTORY = 25;

let wss: WebSocketServer;

export function setupWebSocketServer(server: Server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        let username: string | undefined;

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'join':
                        username = message.username;
                        if (username) {
                            onlineUsers.add(username);
                            broadcastOnlineUsers();

                            // 推送历史聊天记录
                            ws.send(JSON.stringify({
                                type: 'history',
                                messages: recentMessages,
                            }));
                        }
                        break;

                    case 'leave':
                        if (message.username) {
                            onlineUsers.delete(message.username);
                            broadcastOnlineUsers();
                        }
                        break;

                    case 'chat':
                        if (message.username && message.text) {
                            if (recentMessages.length >= MAX_HISTORY) {
                                recentMessages.shift();
                            }
                            recentMessages.push({
                                username: message.username,
                                text: message.text,
                            });

                            broadcast(JSON.stringify({
                                type: 'chat',
                                username: message.username,
                                text: message.text,
                            }));
                        }
                        break;

                    default:
                        console.warn('Unknown message type:', message.type);
                        break;
                }
            } catch (e) {
                console.error('Invalid message format', e);
            }
        });

        ws.on('close', () => {
            if (username) {
                onlineUsers.delete(username);
                broadcastOnlineUsers();
            }
        });
    });

    console.log('✅ WebSocket server initialized');
}

function broadcastOnlineUsers() {
    const userList = Array.from(onlineUsers);
    const payload = JSON.stringify({ type: 'update', users: userList });
    broadcast(payload);
}

/**
 * 核心广播方法，用于对外发送任何类型消息
 */
export function broadcast(message: string | object) {
    if (!wss) return;

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

export function broadcastToAll(message: string) {
    broadcast(message);
}