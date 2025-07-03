'use client';

import { useEffect, useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import OnlineUserItem from './modelItem/OnlineUserItem';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
type OnlineUser = { id: string };

export default function OnlineUser() {
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [username, setUsername] = useState<string | null>(null);

    // 从 localStorage 初始化用户名
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                if (parsed.username) {
                    setUsername(parsed.username);
                }
            } catch {}
        }

        // 监听登录状态变化（通过 localStorage）
        const onStorageChange = () => {
            const updated = localStorage.getItem('user');
            if (updated) {
                try {
                    const parsed = JSON.parse(updated);
                    if (parsed.username) {
                        setUsername(parsed.username);
                    }
                } catch {}
            } else {
                // 用户退出了
                setUsername(null);
            }
        };

        window.addEventListener('storage', onStorageChange);
        return () => window.removeEventListener('storage', onStorageChange);
    }, []);

    // 当 username 有效时建立 WebSocket 连接
    useEffect(() => {
        if (!username) return;
        const ws = new WebSocket(`${WS_URL}`);
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'join', username }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'update') {
                const users = data.users.map((id: string) => ({ id }));
                setOnlineUsers(users);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket closed');
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'leave', username }));
            }
            ws.close();
        };
    }, [username]);

    return (
        <div className="w-full h-full flex p-3 relative overflow-hidden">
            <div className="w-full h-full bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg overflow-y-auto">
                <h2 className="text-white text-lg font-semibold mb-2">在线用户</h2>

                <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                        {onlineUsers.map((user) => (
                            <OnlineUserItem key={user.id} id={user.id} />
                        ))}
                    </AnimatePresence>
                </div>

                {onlineUsers.length === 0 && (
                    <p className="text-white/60 italic text-sm mt-4">暂无在线用户</p>
                )}
            </div>
        </div>
    );
}
