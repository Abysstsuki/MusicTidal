'use client';

import { Song } from '@/types/music';
import React from 'react';

interface MusicItemProps extends Song {
    index?: number;
    children?: React.ReactNode;
}

export default function MusicItem({
    prcUrl,
    name,
    artist,
    duration,
    index,
    children,
}: MusicItemProps) {
    // 将毫秒转换为 分:秒
    const formatDuration = (ms: number): string => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-[10px] py-2 border-b border-[var(--line-light)]">
            {index !== undefined && (
                <span className="text-[10px] text-[var(--text-secondary)] w-4 text-right tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                </span>
            )}

            <img
                src={prcUrl}
                alt={`${name} 封面`}
                className="w-7 h-7 object-cover flex-shrink-0"
                style={{ border: '1px solid var(--line)' }}
            />

            <div className="flex flex-col flex-1 min-w-0">
                <div className="text-[13px] text-[var(--text-primary)] truncate">{name}</div>
                <div className="text-[10px] text-[var(--text-secondary)] truncate">{artist}</div>
            </div>

            <div className="text-[10px] text-[var(--text-muted)] tabular-nums w-12 text-right">
                {formatDuration(duration)}
            </div>

            {children}
        </div>
    );
}
