'use client';

import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { useEffect, useRef, useState } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
type Message = {
    id: string;
    text: string;
};

export default function ChatBox() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [username, setUsername] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const messageEndRef = useRef<HTMLDivElement>(null);
    const simpleBarRef = useRef<any>(null); // 引用SimpleBar实例

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            setUsername(user.username);
        }
    }, []);

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
                        if (updated.length > 100) updated.shift();
                        return updated;
                    });
                } else if (msg.type === 'history') {
                    const history: Message[] = msg.messages.map((m: any) => ({
                        id: m.username,
                        text: m.text,
                    }));
                    setMessages(history);
                }
            } catch (err) {
                console.error('解析消息失败', err);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket连接关闭');
        };

        return () => {
            ws.close();
        };
    }, [username]);

    // 新增：每次 messages 变化，滚动到底部（用SimpleBar实例方法）
    useEffect(() => {
        if (simpleBarRef.current) {
            const scrollElement = simpleBarRef.current.getScrollElement();
            scrollElement.scrollTop = scrollElement.scrollHeight;
        }
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
        <div className="flex h-full w-full max-h-[100vh] p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full max-h-full w-110 max-w-full mx-auto relative z-10 flex flex-col">

                {/* ✅ SimpleBar 外包一层确保正确撑开 + 防止子容器高度塌陷 */}
                <div className="flex-1 min-h-0">
                    <SimpleBar
                        style={{ height: '100%', scrollBehavior: 'smooth' }}
                        autoHide={true}
                        scrollbarMinSize={40}
                        scrollbarMaxSize={500}
                        ref={simpleBarRef}
                    >
                        <div className="space-y-3 pr-2">
                            {messages.map((msg, idx) => (
                                <div key={idx} className="text-white text-sm">
                                    <span className="font-semibold text-white/80">{msg.id}:</span>{' '}
                                    <span className="text-white/90">{msg.text}</span>
                                </div>
                            ))}
                            <div ref={messageEndRef} />
                        </div>
                    </SimpleBar>
                </div>

                {/* ✅ 底部输入框区域 */}
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

