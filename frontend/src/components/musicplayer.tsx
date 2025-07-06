'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { IconButton, Slider } from '@mui/material';
import { RefreshRounded, FastForwardRounded, DownloadRounded, VolumeUpRounded, VolumeDownRounded } from '@mui/icons-material';
import { Song } from '@/types/music';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;
interface PlaySongMessage {
    type: 'PLAY_SONG';
    payload: {
        song: Song;
        url: string;
        startTime: number; // 毫秒时间戳
    };
}

export default function MusicPlayer() {
    const [song, setSong] = useState<Song | null>(null);
    const [url, setUrl] = useState<string>('');
    const [startTime, setStartTime] = useState<number>(0);
    const [position, setPosition] = useState<number>(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // 同步音频按钮功能
    const handleSyncAudio = async () => {
        try {
            const res = await fetch('/api/song/currentPlaying');
            const data = await res.json();
            if (data.success && data.currentSong && data.currentSong.url) {
                const { song, startTime, url } = data.currentSong;
                setSong(song);
                setStartTime(startTime);
                setUrl(url);
                // 移除播放逻辑，由自动播放useEffect处理
            }
        } catch (err) {
            console.error('同步音频失败', err);
        }
    };

    // 切歌按钮功能
    const handleSkipNext = async () => {
        try {
            const res = await fetch('/api/song/skipNext', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.success) {
                console.log('已跳到下一首');
            }
        } catch (err) {
            console.error('切歌失败', err);
        }
    };

    // 下载歌曲按钮功能
    const handleDownloadSong = async () => {
        if (!song || !url) {
            console.warn('没有可下载的歌曲');
            return;
        }
        
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${song.name} - ${song.artist}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            console.error('下载失败', err);
        }
    };

    function formatDuration(value: number) {
        if (value <= 0 || isNaN(value)) return '0:00';
        const totalSeconds = Math.floor(value / 1000);
        const minute = Math.floor(totalSeconds / 60);
        const secondLeft = totalSeconds % 60;
        return `${minute}:${secondLeft < 10 ? `0${secondLeft}` : secondLeft}`;
    }

    useEffect(() => {
        const ws = new WebSocket(`${WS_URL}`);

        ws.onmessage = (event) => {
            const data: PlaySongMessage = JSON.parse(event.data);
            if (data.type === 'PLAY_SONG') {
                const { song, url, startTime } = data.payload;
                setSong(song);
                setUrl(url);
                setStartTime(startTime);
                // 移除重复的播放逻辑，由自动播放useEffect处理
            }
        };

        // 刷新时触发同步
        handleSyncAudio();

        return () => {
            ws.close();
        };
    }, []);

    // 自动播放逻辑 - 监控状态变化并主动播放
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !url || !song) return;

        // 设置音频源
        audio.src = url;
        
        // 计算播放位置
        const delay = (Date.now() - startTime) / 1000;
        audio.currentTime = Math.min(delay, song.duration / 1000);
        
        // 主动检查并播放音频（类似旧组件的逻辑）
        if (audio.paused) {
            audio.play().catch((err) => {
                if (err.name !== 'NotAllowedError') {
                    console.warn('音频播放失败:', err);
                }
            });
        }
    }, [song, url, startTime]); // 监控这些状态变化

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updatePosition = () => {
            // 将秒转换为毫秒，与song.duration单位保持一致
            setPosition(audio.currentTime * 1000);
        };

        const handleEnded = async () => {
            // 歌曲播放完毕后尝试切换到下一首，如果队列为空则清空状态
            try {
                const res = await fetch('/api/song/skipNext', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                const data = await res.json();
                if (!data.success) {
                    // 如果切歌失败（可能是队列为空），则清空状态
                    setSong(null);
                    setUrl('');
                    setStartTime(0);
                    setPosition(0);
                }
                // 如果切歌成功，WebSocket会推送新歌曲，无需手动处理
            } catch (err) {
                console.error('自动切歌失败', err);
                // 出错时清空状态
                setSong(null);
                setUrl('');
                setStartTime(0);
                setPosition(0);
            }
        };

        audio.addEventListener('timeupdate', updatePosition);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', updatePosition);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []); // 移除song依赖，确保监听器只添加一次

    return (
        <div className="w-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg h-full w-110 max-w-full mx-auto relative z-10">
                {/* 歌曲信息 */}
                <div className="flex items-center">
                    <div className="w-24 h-24 overflow-hidden flex-shrink-0 rounded-lg bg-gray-200">
                        <img alt="music cover" src={song?.prcUrl || '/static/background.jpg'} className="w-full h-full object-cover" />
                    </div>
                    <div className="ml-6 min-w-0">
                        <p className="text-2xl text-gray-500 font-medium">{song ? `由 Abyss 点歌` : '当前无播放'}</p>
                        <p className="truncate font-bold">{song?.name || '暂无歌曲'}</p>
                        <p className="truncate text-sm tracking-tight">{song?.artist || ''}</p>
                    </div>
                </div>

                {/* 进度条 */}
                <Slider
                    aria-label="time-indicator"
                    size="small"
                    value={position}
                    min={0}
                    step={1}
                    max={song?.duration || 500}
                    disabled
                    sx={{
                        '& .MuiSlider-thumb': { display: 'none' },
                        '& .MuiSlider-rail': { backgroundColor: 'rgba(255,255,255,0.6)' },
                        '& .MuiSlider-track': { backgroundColor: 'rgba(255,255,255,0.9)' },
                    }}
                    className="mt-4 h-1.5"
                />

                <div className="flex justify-between mt-[-8px]">
                    <p className="text-xs opacity-50">{formatDuration(position)}</p>
                    <p className="text-xs opacity-50">-{formatDuration((song?.duration || 500) - position)}</p>
                </div>

                <div className="flex items-center justify-center mt-[-8px] space-x-4">
                    <IconButton aria-label="sync" className="text-black" onClick={handleSyncAudio}><RefreshRounded fontSize="large" /></IconButton>
                    <IconButton aria-label="next song" className="text-black" onClick={handleSkipNext}><FastForwardRounded fontSize="large" /></IconButton>
                    <IconButton aria-label="download song" className="text-black" onClick={handleDownloadSong}><DownloadRounded fontSize="large" /></IconButton>
                </div>

                <div className="flex items-center justify-between mt-2">
                    <VolumeDownRounded className="text-gray-500" />
                    <Slider aria-label="Volume" defaultValue={30} className="w-20" />
                    <VolumeUpRounded className="text-gray-500" />
                </div>

                <audio ref={audioRef} hidden />
            </div>
        </div>
    );
}
