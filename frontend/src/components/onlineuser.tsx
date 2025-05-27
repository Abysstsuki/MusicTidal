import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import OnlineUserItem from './modelItem/OnlineUserItem';

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

