'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 模拟用户数据
const mockUsers = [
    { id: 'Abyss' },
    { id: 'ShelAv' },
    { id: 'ShelVb' },
    { id: '@User' },
];

export default function OnlineUser() {
    const [onlineUsers, setOnlineUsers] = useState<typeof mockUsers>([]);

    useEffect(() => {
        const interval = setInterval(() => {
            setOnlineUsers((prev) => {
                const available = mockUsers.filter((u) => !prev.find((p) => p.id === u.id));
                const action = Math.random() > 0.5 ? 'join' : 'leave';
                if (action === 'join' && available.length > 0) {
                    const toAdd = available[Math.floor(Math.random() * available.length)];
                    return [...prev, toAdd];
                } else if (action === 'leave' && prev.length > 0) {
                    const idx = Math.floor(Math.random() * prev.length);
                    return prev.filter((_, i) => i !== idx);
                }
                return prev;
            });
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full h-full flex p-3 relative overflow-hidden">
            <div className="flex-col w-full h-full bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 space-y-4 rounded-lg overflow-y-auto">
                <h2 className="text-white text-lg font-semibold">在线用户</h2>
                <AnimatePresence>
                    {onlineUsers.map((user) => (
                        <motion.div
                            key={user.id}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.3 }}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white font-medium text-sm"
                        >
                            {user.id}
                        </motion.div>
                    ))}
                </AnimatePresence>
                {onlineUsers.length === 0 && (
                    <p className="text-white/60 italic text-sm">暂无在线用户</p>
                )}
            </div>
        </div>
    );
}
