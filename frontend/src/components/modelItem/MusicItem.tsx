'use client';

import { Song } from '@/types/music';
import React from 'react';

interface MusicItemProps extends Song {
    index?: number;
    children?: React.ReactNode;
}

export default function MusicItem({
    cover,
    title,
    artist,
    duration,
    index,
    children,
}: MusicItemProps) {
    return (
        <div className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-all">
            {index !== undefined && (
                <span className="text-white/60 text-xs w-4 text-right">{index + 1}.</span>
            )}

            <img
                src={cover}
                alt={`${title} 封面`}
                className="w-10 h-10 rounded object-cover"
            />

            <div className="flex flex-col flex-1 min-w-0">
                <div className="text-white text-sm truncate">{title}</div>
                <div className="text-white/60 text-xs truncate">{artist}</div>
            </div>

            <div className="text-white/50 text-xs w-12 text-right">{duration}</div>

            {children}
        </div>
    );
}
