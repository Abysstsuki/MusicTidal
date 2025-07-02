import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const onlineUsers = new Set<string>();
let wss: WebSocketServer;

export function setupWebSocketServer(server: Server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        let username: string;

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'join') {
                    username = message.username;
                    if (username) {
                        onlineUsers.add(username);
                        broadcastOnlineUsers();
                    }
                } else if (message.type === 'leave') {
                    if (message.username) {
                        onlineUsers.delete(message.username);
                        broadcastOnlineUsers();
                    }
                }
            } catch (e) {
                console.error('Invalid message', e);
            }
        });

        ws.on('close', () => {
            if (username) {
                onlineUsers.delete(username);
                broadcastOnlineUsers();
            }
        });
    });

    console.log('WebSocket server initialized');
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
