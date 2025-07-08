'use client';

import { useEffect, useState, useRef } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { useMusicContext } from '@/contexts/MusicContext';

interface LyricLine {
    time: number;
    text: string;
}

function parseLyric(lyric: string): LyricLine[] {
    const lines = lyric.split('\n');
    // 支持多种LRC歌词时间格式：[mm:ss.xxx] 或 [mm:ss.xx] 或 [mm:ss]
    const pattern = /\[(\d{1,2}):(\d{2})(?:[.:]?(\d{2,3}))?\](.*)$/;
    const result: LyricLine[] = [];

    for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
            const [, min, sec, ms = '0', text] = match;
            const minutes = parseInt(min);
            const seconds = parseInt(sec);

            // 处理不同长度的毫秒：2位数按百分之一秒，3位数按千分之一秒
            let milliseconds = 0;
            if (ms && ms !== '0') {
                if (ms.length === 2) {
                    milliseconds = parseInt(ms) / 100; // [00:21.57] -> 0.57秒
                } else if (ms.length === 3) {
                    milliseconds = parseInt(ms) / 1000; // [00:01.000] -> 0.000秒
                }
            }

            const timeInSeconds = minutes * 60 + seconds + milliseconds;
            const lyricText = text.trim();

            // 只添加有文本内容的歌词行
            if (lyricText) {
                result.push({
                    time: timeInSeconds,
                    text: lyricText,
                });
            }
        }
    }

    // 按时间排序
    result.sort((a, b) => a.time - b.time);
    return result;
}

export default function MusicLyrics() {
    const { currentSong, currentPosition } = useMusicContext();
    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [previousSongId, setPreviousSongId] = useState<string | null>(null);

    // 将毫秒转换为秒进行歌词匹配
    const position = currentPosition / 1000;

    const currentIndex = lyrics.findIndex((line, index) => {
        const next = lyrics[index + 1];
        return position >= line.time && (!next || position < next.time);
    });

    // 获取歌词数据
    useEffect(() => {
        const fetchLyrics = async () => {
            if (!currentSong?.id) {
                setLyrics([]);
                return;
            }

            setLoading(true);
            try {
                const response = await fetch(`/api/song/lyric?id=${currentSong.id}`);
                const data = await response.json();

                if (data.success && data.data.lyric) {
                    const parsedLyrics = parseLyric(data.data.lyric);
                    setLyrics(parsedLyrics);
                } else {
                    setLyrics([{ time: 0, text: '暂无歌词' }]);
                }
            } catch (error) {
                console.error('获取歌词失败:', error);
                setLyrics([{ time: 0, text: '歌词加载失败' }]);
            } finally {
                setLoading(false);
            }
        };

        fetchLyrics();
    }, [currentSong]); // 依赖整个currentSong对象，确保切歌时能正确触发

    // 当歌曲真正切换时（ID发生变化），重置用户滚动状态
    useEffect(() => {
        const currentSongId = currentSong?.id || null;

        // 只有当歌曲ID真正发生变化时才重置滚动状态
        if (currentSongId !== previousSongId) {
            setIsUserScrolling(false);
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
                scrollTimeoutRef.current = null;
            }
            if (currentSongId)
                setPreviousSongId(currentSongId.toString());
        }
    }, [currentSong?.id, previousSongId]);

    // 用户滚动时，记录下来
    const handleScroll = () => {
        if (!isUserScrolling) {
            setIsUserScrolling(true);
        }
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
            setIsUserScrolling(false);
        }, 3000); // 用户停止滚动3秒后，允许播放器重新控制
    };

    useEffect(() => {
        if (containerRef.current) {
            const el = containerRef.current;
            el.addEventListener('scroll', handleScroll);
            return () => {
                el.removeEventListener('scroll', handleScroll);
            };
        }
    }, []);

    useEffect(() => {
        if (!isUserScrolling && containerRef.current) {
            const currentLine = containerRef.current.querySelector(`[data-idx="${currentIndex}"]`) as HTMLElement;
            if (currentLine) {
                currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentIndex, isUserScrolling]);

    return (
        <div className="flex h-full w-full p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg w-160 max-w-full mx-auto relative z-10 py-10">
                <SimpleBar style={{ maxHeight: '100%', height: '100%' }} autoHide={true} scrollbarMaxSize={50}>
                    <div className="flex flex-col items-center space-y-10" ref={containerRef}>
                        {loading ? (
                            <p className="text-white text-lg opacity-60">加载歌词中...</p>
                        ) : lyrics.length === 0 ? (
                            <p className="text-white text-lg opacity-60">
                                {currentSong ? '暂无歌词' : '请选择歌曲'}
                            </p>
                        ) : (
                            lyrics.map((line, index) => (
                                <p
                                    key={index}
                                    data-idx={index}
                                    className={`transition-all duration-300 ${index === currentIndex
                                            ? 'text-white text-xl font-bold opacity-100 scale-110'
                                            : 'text-white text-lg opacity-60'
                                        } max-w-full w-[90%] text-center break-words`}
                                >
                                    {line.text || '...'}
                                </p>
                            ))
                        )}
                    </div>
                </SimpleBar>
            </div>
        </div>
    );
}