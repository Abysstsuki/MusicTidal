'use client';

import SimpleBar from 'simplebar-react';
import type SimpleBarCore from 'simplebar-core';
import 'simplebar-react/dist/simplebar.min.css';
import { useEffect, useRef, useState } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
type Message = {
    id: string;
    text: string;
};

type ChatHistoryMessage = {
    username: string;
    text: string;
};

export default function ChatBox() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [username, setUsername] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const messageEndRef = useRef<HTMLDivElement>(null);
    const simpleBarRef = useRef<SimpleBarCore | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            setUsername(user.username);
        }
    }, []);

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
                    const history: Message[] = msg.messages.map((m: ChatHistoryMessage) => ({
                        id: m.username,
                        text: m.text,
                    }));
                    setMessages(history);
                }
            } catch (err) {
                console.error('解析消息失败', err);
            }
        };

        ws.onerror = (err) => {
            console.error('ChatBox WebSocket 错误', err);
        };

        ws.onclose = () => {
            console.log('ChatBox WebSocket 连接关闭');
        };

        return () => {
            ws.close();
        };
    }, [username]);

    // 新增：每次 messages 变化，滚动到底部（用SimpleBar实例方法）
    useEffect(() => {
        if (simpleBarRef.current) {
            const scrollElement = simpleBarRef.current.getScrollElement();
            if (!scrollElement) return;
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
            <div className="p-4 h-full max-h-full w-full mx-auto relative z-10 flex flex-col"
                 style={{ border: '1px solid var(--line)', background: 'var(--bg-panel)' }}>

                <div className="flex-1 min-h-0">
                    <SimpleBar
                        style={{ height: '100%', scrollBehavior: 'smooth' }}
                        autoHide={true}
                        scrollbarMinSize={40}
                        scrollbarMaxSize={500}
                        ref={simpleBarRef}
                    >
                        <div className="space-y-1 pr-2">
                            {messages.map((msg, idx) => (
                                <div key={idx} className="text-sm py-1 border-b border-[var(--line-light)]">
                                    <span style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>{msg.id}:</span>{' '}
                                    <span style={{ color: 'var(--text-secondary)' }}>{msg.text}</span>
                                </div>
                            ))}
                            <div ref={messageEndRef} />
                        </div>
                    </SimpleBar>
                </div>

                <div className="mt-4 flex items-center space-x-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                        placeholder="输入消息..."
                        style={{
                            flex: 1,
                            border: '1px solid var(--line)',
                            background: 'transparent',
                            padding: '6px 10px',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!username}
                        style={{
                            padding: '4px 12px',
                            border: '1px solid var(--accent-blue-line)',
                            fontSize: '9px',
                            letterSpacing: '0.3em',
                            color: 'var(--accent-blue)',
                            cursor: !username ? 'not-allowed' : 'pointer',
                            background: 'transparent',
                            opacity: !username ? 0.4 : 1
                        }}
                    >
                        SEND
                    </button>
                </div>
            </div>
        </div>
    );
}

