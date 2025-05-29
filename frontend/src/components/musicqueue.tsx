'use client';

import { useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import MusicItem from './modelItem/MusicItem';
import { Song } from '@/types/music';

export default function MusicQueue() {
    const [queue, setQueue] = useState<Song[]>([
        {
            cover: '/static/background.jpg',
            title: '海阔天空',
            artist: 'Beyond',
            duration: '05:32',
        },
        {
            cover: '/static/background.jpg',
            title: '稻香',
            artist: '周杰伦',
            duration: '03:42',
        },
        {
            cover: '/static/background.jpg',
            title: '夜曲',
            artist: '周杰伦',
            duration: '04:48',
        },
    ]);

    const moveToTop = (index: number) => {
        if (index === 0) return;
        const updated = [...queue];
        const [song] = updated.splice(index, 1);
        updated.unshift(song);
        setQueue(updated);
    };

    const removeFromQueue = (index: number) => {
        const updated = [...queue];
        updated.splice(index, 1);
        setQueue(updated);
    };

    return (
        <div className="w-full h-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10 overflow-y-auto space-y-3 text-white text-sm">
                {queue.map((song, index) => (
                    <MusicItem
                        key={index}
                        index={index}
                        cover={song.cover}
                        title={song.title}
                        artist={song.artist}
                        duration={song.duration}
                    >
                        <div className="flex items-center gap-2 ml-2">
                            <button
                                title="置顶"
                                onClick={() => moveToTop(index)}
                                className="text-white/50 hover:text-white transition-all"
                            >
                                <ArrowUpwardIcon />
                            </button>
                            <button
                                title="移除"
                                onClick={() => removeFromQueue(index)}
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
