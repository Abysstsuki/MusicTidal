import { useEffect, useRef, useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import MusicItem from './modelItem/MusicItem';
import { Song } from '@/types/music';
import { v4 as uuidv4 } from 'uuid';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

interface SongWithInstanceId extends Song {
    instanceId: string;
}

export default function MusicQueue() {
    const [queue, setQueue] = useState<SongWithInstanceId[]>([]);
    const wsRef = useRef<WebSocket | null>(null);

    // 给后端返回的数组每条加上唯一实例id
    const addInstanceIdToQueue = (songs: Song[]): SongWithInstanceId[] =>
        songs.map((song) => ({ ...song, instanceId: uuidv4() }));

    const fetchQueue = async () => {
        try {
            const res = await fetch('/api/song/queueList');
            const data = await res.json();
            setQueue(addInstanceIdToQueue(data.queue));
        } catch (err) {
            console.error('获取队列失败', err);
        }
    };

    const moveToTop = async (instanceId: string) => {
        // 先找到对应歌曲的业务 id
        const song = queue.find((s) => s.instanceId === instanceId);
        if (!song) return;

        try {
            await fetch('/api/song/queueTop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: song.id }),
            });
            // 由服务端广播更新，无需主动刷新
        } catch (err) {
            console.error('置顶失败', err);
        }
    };

    const removeFromQueue = async (instanceId: string) => {
        // 同上，找到业务 id
        const song = queue.find((s) => s.instanceId === instanceId);
        if (!song) return;

        try {
            await fetch('/api/song/queueRemove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: song.id }),
            });
            // 由服务端广播更新，无需主动刷新
        } catch (err) {
            console.error('删除失败', err);
        }
    };

    useEffect(() => {
        fetchQueue();

        const ws = new WebSocket(`${WS_URL}`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'QUEUE_UPDATED') {
                    // 服务端发来的 queue 数组，重新加上 instanceId
                    setQueue(addInstanceIdToQueue(data.payload));
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
        };

        return () => {
            ws.close();
        };
    }, []);

    return (
        <div className="w-full h-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10 overflow-y-auto space-y-3 text-white text-sm">
                {queue.map((song, index) => (
                    <MusicItem
                        id={song.id}
                        key={song.instanceId} // 关键改动：用 instanceId 作为 key
                        index={index}
                        prcUrl={song.prcUrl}
                        name={song.name}
                        artist={song.artist}
                        duration={song.duration}
                    >
                        <div className="flex items-center gap-2 ml-2">
                            <button
                                title="置顶"
                                onClick={() => moveToTop(song.instanceId)} // 用 instanceId 操作
                                className="text-white/50 hover:text-white transition-all"
                            >
                                <ArrowUpwardIcon />
                            </button>
                            <button
                                title="移除"
                                onClick={() => removeFromQueue(song.instanceId)} // 用 instanceId 操作
                                className="text-white/50 hover:text-red-400 transition-all"
                            >
                                <DeleteIcon />
                            </button>
                        </div>
                    </MusicItem>
                ))}
            </div>
        </div>
    );
}
