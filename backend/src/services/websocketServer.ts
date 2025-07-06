// services/websocketServer.ts
import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getSongPlayInfo } from '../services/netease/song.service';

const onlineUsers = new Set<string>();
const recentMessages: { username: string; text: string }[] = [];
const MAX_HISTORY = 25;

let wss: WebSocketServer;

// 当前正在播放的歌曲信息
let currentSong: any = null;
let currentStartTime: number = 0;

export function setupWebSocketServer(server: Server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket) => {
        let username: string | undefined;

        // 新连接：如果有正在播放的歌曲，推送当前播放状态
        if (currentSong && currentStartTime) {
            ws.send(JSON.stringify({
                type: 'PLAY_SONG',
                payload: {
                    song: currentSong,
                    url: currentSong.url,
                    startTime: currentStartTime,
                },
            }));
        }

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

                            broadcast({
                                type: 'chat',
                                username: message.username,
                                text: message.text,
                            });
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
    broadcast({ type: 'update', users: userList });
}

export function broadcast(message: string | object) {
    if (!wss) return;
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// 对外暴露：设置当前播放的歌曲并广播给所有客户端
export async function setCurrentPlayingSong(song: any) {
    const playInfo = await getSongPlayInfo(song.id); // 获取播放 URL 和其他信息
    currentSong = {
        id: song.id,
        name: song.name,
        artist: song.artist,
        prcUrl: song.prcUrl,
        duration: song.duration,
        url: playInfo.url,
    };

    currentStartTime = Date.now();

    broadcast({
        type: 'PLAY_SONG',
        payload: {
            song: currentSong,
            startTime: currentStartTime,
        },
    });
}

// 可供其他模块使用的广播函数
export function broadcastToAll(message: string | object) {
    broadcast(message);
}
