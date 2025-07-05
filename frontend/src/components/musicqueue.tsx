'use client';

import { useEffect, useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import MusicItem from './modelItem/MusicItem';
import { Song } from '@/types/music';

export default function MusicQueue() {
    const [queue, setQueue] = useState<Song[]>([]);

    const fetchQueue = async () => {
        try {
            const res = await fetch('/api/song/queueList');
            const data = await res.json();
            setQueue(data.queue);
        } catch (err) {
            console.error('获取队列失败', err);
        }
    };

    const moveToTop = async (id: number) => {
        try {
            await fetch('/api/song/queueTop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            fetchQueue(); // 刷新队列
        } catch (err) {
            console.error('置顶失败', err);
        }
    };

    const removeFromQueue = async (id: number) => {
        try {
            await fetch('/api/song/queueRemove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            fetchQueue(); // 刷新队列
        } catch (err) {
            console.error('删除失败', err);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    return (
        <div className="w-full h-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10 overflow-y-auto space-y-3 text-white text-sm">
                {queue.map((song, index) => (
                    <MusicItem
                        id={song.id}
                        key={song.id}
                        index={index}
                        prcUrl={song.prcUrl}
                        name={song.name}
                        artist={song.artist}
                        duration={song.duration}
                    >
                        <div className="flex items-center gap-2 ml-2">
                            <button
                                title="置顶"
                                onClick={() => moveToTop(song.id)}
                                className="text-white/50 hover:text-white transition-all"
                            >
                                <ArrowUpwardIcon />
                            </button>
                            <button
                                title="移除"
                                onClick={() => removeFromQueue(song.id)}
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
