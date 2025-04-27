'use client';

import * as React from 'react';
import { useState } from 'react';
import { IconButton, Slider } from '@mui/material';
import { RefreshRounded, FastForwardRounded, DownloadRounded, VolumeUpRounded, VolumeDownRounded } from '@mui/icons-material';

export default function MusicPlayer() {
    const duration = 500;
    const [position, setPosition] = useState(1);

    function formatDuration(value: number) {
        const minute = Math.floor(value / 60);
        const secondLeft = value - minute * 60;
        return `${minute}:${secondLeft < 10 ? `0${secondLeft}` : secondLeft}`;
    }

    return (
        <div className="w-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10">
                {/* 歌曲信息 */}
                <div className="flex items-center">
                    <div className="w-24 h-24 overflow-hidden flex-shrink-0 rounded-lg bg-gray-200">
                        <img alt="music cover" src="/static/background.jpg" className="w-full h-full object-cover" />
                    </div>
                    <div className="ml-6 min-w-0">
                        <p className="text-sm text-gray-500 font-medium">Jun Pulse</p>
                        <p className="truncate font-bold">123123123</p>
                        <p className="truncate text-sm tracking-tight">Chilling Sunday — 123123123</p>
                    </div>
                </div>

                {/* 进度条（不可交互） */}
                <Slider
                    aria-label="time-indicator"
                    size="small"
                    value={position}
                    min={0}
                    step={1}
                    max={duration}
                    disabled
                    sx={{
                        '& .MuiSlider-thumb': {
                            display: 'none', // 隐藏滑块
                        },
                        '& .MuiSlider-rail': {
                            backgroundColor: 'rgba(255,255,255,0.6)', // 自定义轨道颜色
                        },
                        '& .MuiSlider-track': {
                            backgroundColor: 'rgba(255,255,255,0.9)', // 自定义进度条颜色
                        },
                    }}
                    className="mt-4 h-1.5"
                />

                {/* 时间显示 */}
                <div className="flex justify-between mt-[-8px]">
                    <p className="text-xs opacity-50">{formatDuration(position)}</p>
                    <p className="text-xs opacity-50">-{formatDuration(duration - position)}</p>
                </div>

                {/* 控制按钮 */}
                <div className="flex items-center justify-center mt-[-8px] space-x-4">
                    <IconButton aria-label="sync" className="text-black">
                        <RefreshRounded fontSize="large" />
                    </IconButton>
                    <IconButton aria-label="next song" className="text-black">
                        <FastForwardRounded fontSize="large" />
                    </IconButton>
                    <IconButton aria-label="download song" className="text-black">
                        <DownloadRounded fontSize="large" />
                    </IconButton>
                </div>

                {/* 音量控制 */}
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
