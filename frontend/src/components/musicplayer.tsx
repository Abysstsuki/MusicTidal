'use client';

import * as React from 'react';
import { useState } from 'react';
import { IconButton, Slider } from '@mui/material';
import { PauseRounded, PlayArrowRounded, FastForwardRounded, FastRewindRounded, VolumeUpRounded, VolumeDownRounded } from '@mui/icons-material';

export default function MusicPlayer() {
    const duration = 500;
    const [position, setPosition] = useState(32);
    const [paused, setPaused] = useState(false);

    function formatDuration(value: number) {
        const minute = Math.floor(value / 60);
        const secondLeft = value - minute * 60;
        return `${minute}:${secondLeft < 10 ? `0${secondLeft}` : secondLeft}`;
    }

    return (
        <div className="w-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10">
                <div className="flex items-center">
                    <div className="w-24 h-24 overflow-hidden flex-shrink-0 rounded-lg bg-gray-200">
                        <img alt="can't win - Chilling Sunday" src="/static/background.jpg" className="w-full h-full object-cover" />
                    </div>
                    <div className="ml-6 min-w-0">
                        <p className="text-sm text-gray-500 font-medium">Jun Pulse</p>
                        <p className="truncate font-bold">123123123</p>
                        <p className="truncate text-sm tracking-tight">Chilling Sunday &mdash; 123123123</p>
                    </div>
                </div>
                <Slider
                    aria-label="time-indicator"
                    size="small"
                    value={position}
                    min={0}
                    step={1}
                    max={duration}
                    onChange={(_, value) => setPosition(value as number)}
                    className="mt-4 h-1.5"
                />
                <div className="flex justify-between mt-[-8px]">
                    <p className="text-xs opacity-50">{formatDuration(position)}</p>
                    <p className="text-xs opacity-50">-{formatDuration(duration - position)}</p>
                </div>
                <div className="flex items-center justify-center mt-[-8px]">
                    <IconButton aria-label="previous song" className="text-black">
                        <FastRewindRounded fontSize="large" />
                    </IconButton>
                    <IconButton aria-label={paused ? 'play' : 'pause'} onClick={() => setPaused(!paused)} className="text-black">
                        {paused ? <PlayArrowRounded fontSize="large" /> : <PauseRounded fontSize="large" />}
                    </IconButton>
                    <IconButton aria-label="next song" className="text-black">
                        <FastForwardRounded fontSize="large" />
                    </IconButton>
                </div>
                <div className="flex items-center justify-between mt-2">
                    <VolumeDownRounded className="text-gray-500" />
                    <Slider
                        aria-label="Volume"
                        defaultValue={30}
                        className="w-20"
                    />
                    <VolumeUpRounded className="text-gray-500" />
                </div>
            </div>
        </div>
    );
}
