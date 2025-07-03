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

                            // 给新用户推送最近聊天记录
                            ws.send(
                                JSON.stringify({
                                    type: 'history',
                                    messages: recentMessages,
                                })
                            );
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
                            // 记录聊天消息，保证最近10条
                            if (recentMessages.length >= MAX_HISTORY) {
                                recentMessages.shift();
                            }
                            recentMessages.push({
                                username: message.username,
                                text: message.text,
                            });

                            const payload = JSON.stringify({
                                type: 'chat',
                                username: message.username,
                                text: message.text,
                            });
                            broadcastToAll(payload);
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

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

function broadcastToAll(message: string) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}
