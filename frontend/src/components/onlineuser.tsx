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

    // 从 localStorage 初始化用户名（需同时验证 token 存在）
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return; // 无 token 视为未登录，忽略任何残留 user 数据

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
        if (!WS_URL) {
            console.warn('NEXT_PUBLIC_WS_URL 未配置，跳过 WebSocket 连接');
            return;
        }

        const ws = new WebSocket(WS_URL);
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

        ws.onerror = (err) => {
            console.error('OnlineUser WebSocket 错误', err);
        };

        ws.onclose = () => {
            console.log('OnlineUser WebSocket 关闭');
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
            <div className="w-full h-full p-4 overflow-y-auto"
                 style={{ border: '1px solid var(--line)', background: 'var(--bg-panel)' }}>

                {/* Header */}
                <div className="flex justify-between items-center pb-2 mb-3"
                     style={{ borderBottom: '1px solid var(--line-light)' }}>
                    <span style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--text-secondary)' }}>ONLINE USERS</span>
                    <span style={{ fontSize: '9px', color: 'var(--accent-blue)' }}>{onlineUsers.length}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <AnimatePresence>
                        {onlineUsers.map((user) => (
                            <OnlineUserItem key={user.id} id={user.id} currentUser={username} />
                        ))}
                    </AnimatePresence>
                </div>

                {onlineUsers.length === 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic', marginTop: 16, opacity: 0.6 }}>暂无在线用户</p>
                )}
            </div>
        </div>
    );
}
