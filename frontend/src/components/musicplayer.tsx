'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Song } from '@/types/music';
import { useMusicContext } from '@/contexts/MusicContext';
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
    const { currentSong, currentPosition, setCurrentSong, setCurrentPosition, setIsPlaying } = useMusicContext();
    const [url, setUrl] = useState<string>('');
    const [startTime, setStartTime] = useState<number>(0);
    const [showPlayPrompt, setShowPlayPrompt] = useState(false);
    const [volume, setVolume] = useState(30);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // 尝试播放当前音频（供自动播放和用户手势恢复使用）
    const tryPlay = React.useCallback(async () => {
        const audio = audioRef.current;
        if (!audio || !url) return false;
        try {
            await audio.play();
            setIsPlaying(true);
            setShowPlayPrompt(false);
            return true;
        } catch (err) {
            if ((err as Error).name === 'NotAllowedError') {
                setShowPlayPrompt(true);
            } else {
                console.warn('音频播放失败:', err);
            }
            setIsPlaying(false);
            return false;
        }
    }, [url]);

    // 同步音频按钮功能
    const handleSyncAudio = async () => {
        try {
            const res = await fetch('/api/song/currentPlaying');
            const data = await res.json();
            if (data.success && data.currentSong && data.currentSong.url) {
                const { song, startTime, url } = data.currentSong;
                setShowPlayPrompt(false);
                // 确保创建新的歌曲对象引用，触发组件重新渲染
                setCurrentSong(song ? { ...song } : null);
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
        if (!currentSong || !url) {
            console.warn('没有可下载的歌曲');
            return;
        }
        
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${currentSong.name} - ${currentSong.artist}.mp3`;
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
                console.log('音乐播放器: 收到WebSocket消息，新歌曲:', song?.name, 'ID:', song?.id);
                setShowPlayPrompt(false);
                // 确保创建新的歌曲对象引用，触发组件重新渲染
                setCurrentSong(song ? { ...song } : null);
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
        if (!audio || !url || !currentSong) return;

        // 设置音频源
        audio.src = url;

        // 计算播放位置
        const delay = (Date.now() - startTime) / 1000;
        audio.currentTime = Math.min(delay, currentSong.duration / 1000);

        // 主动检查并播放音频
        if (audio.paused) {
            tryPlay();
        }
    }, [currentSong, url, startTime, tryPlay]); // 监控这些状态变化

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updatePosition = () => {
            // 将秒转换为毫秒，与currentSong.duration单位保持一致
            setCurrentPosition(audio.currentTime * 1000);
        };

        const handlePlay = () => {
            setIsPlaying(true);
        };

        const handlePause = () => {
            setIsPlaying(false);
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
                    setCurrentSong(null);
                    setUrl('');
                    setStartTime(0);
                    setCurrentPosition(0);
                    setIsPlaying(false);
                }
                // 如果切歌成功，WebSocket会推送新歌曲
            } catch (err) {
                console.error('自动切歌失败', err);
                // 出错时清空状态
                setCurrentSong(null);
                setUrl('');
                setStartTime(0);
                setCurrentPosition(0);
                setIsPlaying(false);
            }
        };

        audio.addEventListener('timeupdate', updatePosition);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);

        return () => {
            audio.removeEventListener('timeupdate', updatePosition);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
        };
    }, []); // 移除song依赖，确保监听器只添加一次

    // 用户手势恢复播放：当浏览器阻止自动播放时，捕获首次点击来恢复
    useEffect(() => {
        if (!showPlayPrompt) return;

        const handler = () => {
            tryPlay();
        };

        // 使用 once:true 确保捕获一次交互后就移除
        document.addEventListener('click', handler, { once: true });
        document.addEventListener('touchstart', handler, { once: true });
        return () => {
            document.removeEventListener('click', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, [showPlayPrompt, tryPlay]);

    return (
    <div className="w-full p-3 relative overflow-hidden">
        <div className="p-6 h-full w-110 max-w-full mx-auto relative z-10"
             style={{ border: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(18,20,26,0.95)' }}>

            {/* Header annotation */}
            <div className="flex justify-between items-center mb-4">
                <span style={{ fontSize: '9px', letterSpacing: '0.3em', color: '#8B8FA3' }}>NOW PLAYING // <span style={{ color: '#3A6BFF' }}>LIVE</span></span>
                <span style={{ fontSize: '8px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)' }}>
                    ID: 0x{currentSong?.id?.toString(16).padStart(4,'0') || '----'}
                </span>
            </div>

            {/* Cover + Info */}
            <div className="flex gap-5">
                <div className="relative flex-shrink-0">
                    <img alt="music cover" src={currentSong?.prcUrl || '/static/background.jpg'}
                         className="w-24 h-24 object-cover"
                         style={{ border: '0.5px solid rgba(255,255,255,0.1)' }} />
                    {/* DataCircle marker */}
                    <div style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 8, height: 8,
                        border: '0.5px solid rgba(58,107,255,0.3)',
                        borderRadius: '50%',
                        background: '#0A0C10'
                    }} />
                </div>
                <div className="flex flex-col justify-center">
                    <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>TRACK</div>
                    <div className="text-xl font-semibold text-[#E8E8EF]" style={{ letterSpacing: '-0.01em' }}>
                        {currentSong?.name || '暂无歌曲'}
                    </div>
                    <div className="text-sm text-[#8B8FA3] mt-0.5">
                        {currentSong?.artist || ''}
                    </div>
                </div>
            </div>

            {/* Progress bar - annotation line style, NOT draggable */}
            <div className="mt-5">
                <div className="flex justify-between items-center mb-1">
                    <span style={{ fontSize: '9px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)' }}>PROGRESS</span>
                    <span style={{ fontSize: '9px', color: '#8B8FA3' }}>
                        {currentSong ? Math.round((currentPosition / currentSong.duration) * 100) + '%' : '0%'}
                    </span>
                </div>
                <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
                    <div style={{
                        width: currentSong ? Math.min((currentPosition / currentSong.duration) * 100, 100) + '%' : '0%',
                        height: '0.5px',
                        background: '#3A6BFF',
                        transition: 'width 1s linear'
                    }} />
                    <div style={{
                        position: 'absolute',
                        left: currentSong ? Math.min((currentPosition / currentSong.duration) * 100, 100) + '%' : '0%',
                        top: '-3px',
                        width: 6, height: 6,
                        border: '0.5px solid #3A6BFF',
                        borderRadius: '50%',
                        background: '#0A0C10',
                        transform: 'translateX(-50%)'
                    }} />
                </div>
                <div className="flex justify-between mt-1">
                    <span style={{ fontSize: '10px', color: '#8B8FA3' }}>{formatDuration(currentPosition)}</span>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>
                        {currentSong ? formatDuration(currentSong.duration) : '00:00'}
                    </span>
                </div>
            </div>

            {/* Controls - symbol buttons (no MUI) */}
            <div className="flex items-center justify-center gap-6 mt-5">
                <button onClick={handleSyncAudio} className="text-[#8B8FA3] text-base cursor-pointer bg-transparent border-none p-1 hover:text-[#E8E8EF] transition-colors">&#x27F3;</button>
                <button onClick={handleSkipNext} className="text-[#E8E8EF] text-xl cursor-pointer bg-transparent border-none p-1 hover:text-white transition-colors">&#x23ED;</button>
                <button onClick={handleDownloadSong} className="text-[#8B8FA3] text-base cursor-pointer bg-transparent border-none p-1 hover:text-[#E8E8EF] transition-colors">&#x2B73;</button>
            </div>

            {/* Volume - draggable */}
            <div className="flex items-center gap-2 mt-4">
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>VOL</span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => { const v = parseInt(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v / 100; }}
                    style={{
                        flex: 1, height: '0.5px',
                        background: 'rgba(255,255,255,0.08)',
                        WebkitAppearance: 'none', appearance: 'none',
                        outline: 'none', cursor: 'pointer'
                    }}
                />
                <span style={{ fontSize: '9px', color: '#8B8FA3', width: 28, textAlign: 'right' }}>{volume}%</span>
            </div>

            {/* Autoplay overlay - keep exactly as-is */}
            {showPlayPrompt && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-sm z-20 cursor-pointer"
                     onClick={(e) => { e.stopPropagation(); tryPlay(); }}>
                    <div className="text-white text-center">
                        <div className="text-5xl mb-2">&#x25B6;</div>
                        <div className="text-base font-medium">点击播放</div>
                        <div className="text-xs mt-1 text-white/60">单击任意位置即可开始播放</div>
                    </div>
                </div>
            )}

            <audio ref={audioRef} hidden />
        </div>
    </div>
);
}
