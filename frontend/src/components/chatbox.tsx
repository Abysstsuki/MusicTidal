'use client';

import { useEffect, useRef, useState } from 'react';

type Message = {
    id: string;
    text: string;
};

export default function ChatBox() {
    const [messages, setMessages] = useState<Message[]>([
        { id: 'User123', text: '歌曲测试1' },
        { id: 'Alice', text: '歌曲测试1' },
        { id: 'Bob', text: '歌曲测试1' },
    ]);
    const [input, setInput] = useState('');
    const messageEndRef = useRef<HTMLDivElement>(null);

    const handleSend = () => {
        if (input.trim()) {
            setMessages(prev => [...prev, { id: 'Me', text: input.trim() }]);
            setInput('');
        }
    };

    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

                {/* 固定底部的输入区域 */}
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
                    >
                        发送
                    </button>
                </div>
            </div>
        </div>
    );
}
