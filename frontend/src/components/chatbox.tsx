'use client';

import { useEffect, useRef, useState } from 'react';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
type Message = {
    id: string; // 用户名
    text: string;
};

export default function ChatBox() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [username, setUsername] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const messageEndRef = useRef<HTMLDivElement>(null);

    // 从 localStorage 读取历史消息（仅10条）
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            setUsername(user.username);
        }

        const storedMessages = localStorage.getItem('chatMessages');
        if (storedMessages) {
            try {
                const parsed = JSON.parse(storedMessages) as Message[];
                setMessages(parsed);
            } catch {}
        }
    }, []);

    // 建立 WebSocket 连接
    useEffect(() => {
        if (!username) return;

        const ws = new WebSocket(`${WS_URL}`);


        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'join', username }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'chat') {
                    const newMsg: Message = { id: msg.username, text: msg.text };

                    setMessages((prev) => {
                        const updated = [...prev, newMsg];

                        // 更新本地存储中的最近10条
                        const last10 = updated.slice(-10);
                        localStorage.setItem('chatMessages', JSON.stringify(last10));

                        return updated;
                    });
                }
            } catch (err) {
                console.error('解析消息失败', err);
            }
        };

        ws.onclose = () => {
            ws.send(JSON.stringify({ type: 'leave', username }));
        };

        return () => {
            ws.close();
        };
    }, [username]);

    // 滚动到底部
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (input.trim() && username && wsRef.current?.readyState === WebSocket.OPEN) {
            const msg = {
                type: 'chat',
                username,
                text: input.trim(),
            };
            wsRef.current.send(JSON.stringify(msg));
            setInput('');
        }
    };

    return (
        <div className="w-full h-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10 flex flex-col">
                {/* 聊天内容区域 */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {messages.map((msg, idx) => (
                        <div key={idx} className="text-white text-sm">
                            <span className="font-semibold text-white/80">{msg.id}:</span>{' '}
                            <span className="text-white/90">{msg.text}</span>
                        </div>
                    ))}
                    <div ref={messageEndRef} />
                </div>

                {/* 底部输入区域 */}
                <div className="mt-4 flex items-center space-x-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSend();
                        }}
                        placeholder="输入消息…"
                        className="flex-1 px-3 py-2 rounded bg-white/10 text-white placeholder-white/50 outline-none"
                    />
                    <button
                        onClick={handleSend}
                        className="px-4 py-2 bg-white/20 text-white rounded hover:bg-white/30 transition-all"
                        disabled={!username}
                    >
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
}
