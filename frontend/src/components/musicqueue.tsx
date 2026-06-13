'use client';

import { useEffect, useRef, useState } from 'react';
import MusicItem from './modelItem/MusicItem';
import { Song } from '@/types/music';

import { BACKEND_URL } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

interface SongWithInstanceId extends Song {
  instanceId: number; // 来自后端
}

export default function MusicQueue() {
  const [queue, setQueue] = useState<SongWithInstanceId[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/queue/list`);
      const data = await res.json();
      setQueue(data.queue); // ✅ 后端已含 instanceId
    } catch (err) {
      console.error('获取队列失败', err);
    }
  };

  const moveToTop = async (instanceId: number) => {
    try {
      await fetch(`${BACKEND_URL}/api/queue/moveTop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId }),
      });
    } catch (err) {
      console.error('置顶失败', err);
    }
  };

  const removeFromQueue = async (instanceId: number) => {
    try {
      await fetch(`${BACKEND_URL}/api/queue/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId }),
      });
    } catch (err) {
      console.error('删除失败', err);
    }
  };

  useEffect(() => {
    fetchQueue();

    if (!WS_URL) {
      console.warn('NEXT_PUBLIC_WS_URL 未配置，跳过 WebSocket 连接');
      return;
    }

    let retries = 0;
    const MAX_RETRIES = 3;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('MusicQueue WebSocket 已连接');
        retries = 0; // 成功后重置重试计数
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'QUEUE_UPDATED') {
            setQueue(data.payload);
          } else if (data.type === 'PLAY_SONG') {
            fetchQueue();
          }
        } catch (e) {
          console.error('解析 WebSocket 消息失败', e);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket 错误', err);
      };

      ws.onclose = () => {
        console.log('WebSocket 连接关闭');
        if (cancelled) return;
        if (retries < MAX_RETRIES) {
          const delay = Math.pow(2, retries) * 1000;
          retries++;
          console.log(`WebSocket 将在 ${delay}ms 后重连 (${retries}/${MAX_RETRIES})`);
          reconnectTimer = setTimeout(connect, delay);
        } else {
          console.warn('WebSocket 重连次数已达上限，停止重连');
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  return (
    <div className="w-full h-full p-3 relative overflow-hidden">
        <div className="p-4 h-full w-full mx-auto relative z-10 overflow-y-auto"
             style={{ border: '1px solid var(--line)', background: 'var(--bg-panel)' }}>

            {/* Header */}
            <div className="flex justify-between items-center pb-2 mb-3"
                 style={{ borderBottom: '1px solid var(--line-light)' }}>
                <span style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--text-secondary)' }}>QUEUE LIST</span>
                <span style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'rgba(184,196,220,0.55)' }}>
                    {queue.length} ITEMS
                </span>
            </div>

            {queue.length === 0 ? (
                <div className="py-6 text-center">
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>当前队列为空</p>
                </div>
            ) : (
                queue.map((song, index) => (
                    <MusicItem
                        id={song.id}
                        key={song.instanceId}
                        index={index}
                        prcUrl={song.prcUrl}
                        name={song.name}
                        artist={song.artist}
                        duration={song.duration}
                    >
                        <div className="flex items-center gap-1 ml-2">
                            <button
                                title="置顶"
                                onClick={() => moveToTop(song.instanceId)}
                                style={{
                                    padding: '1px 5px',
                                    border: '1px solid var(--line)',
                                    fontSize: '8px',
                                    letterSpacing: '0.2em',
                                    color: 'var(--text-muted)',
                                    background: 'transparent',
                                    cursor: 'pointer'
                                }}
                            >
                                ▲ TOP
                            </button>
                            <button
                                title="移除"
                                onClick={() => removeFromQueue(song.instanceId)}
                                style={{
                                    padding: '1px 5px',
                                    border: '1px solid var(--line)',
                                    fontSize: '8px',
                                    letterSpacing: '0.2em',
                                    color: 'var(--text-muted)',
                                    background: 'transparent',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕ DEL
                            </button>
                        </div>
                    </MusicItem>
                ))
            )}
        </div>
    </div>
  );
}
