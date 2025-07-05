'use client';

import { useState, useEffect, useRef } from 'react';
import MusicItem from './modelItem/MusicItem';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { Song, SongSearchResponse } from '@/types/music';

interface MusicReqProps {
    isVisible: boolean;
}

export default function MusicReq({ isVisible }: MusicReqProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [songs, setSongs] = useState<Song[]>([]);
    const [currentPage, setCurrentPage] = useState(1);

    const listContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(0); // 当前页面可显示条数

    const handleEnqueue = async (song: Song) => {
        try {
            const res = await fetch('/api/song/queueAdd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ song }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || '加入队列失败');
            }

            alert(`《${song.name}》已加入队列`);
        } catch (err) {
            console.error('点歌失败', err);
            alert('点歌失败，请稍后重试');
        }
    };

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;

        try {
            const res = await fetch(`/api/song/search?keywords=${encodeURIComponent(searchTerm)}`);
            const data: SongSearchResponse = await res.json();

            if (data.success && Array.isArray(data.data)) {
                setSongs(data.data);
                setCurrentPage(1);  // 新搜索重置页码
            } else {
                console.error('搜索结果格式不正确:', data);
                setSongs([]);
            }
        } catch (err) {
            console.error('搜索出错:', err);
            setSongs([]);
        } finally {
            setSearchTerm('');
        }
    };

    // 监听容器和内容高度，动态计算当前页可显示条目数
    useEffect(() => {
        if (!isVisible) return;

        const updateVisibleCount = () => {
            const containerHeight = listContainerRef.current?.offsetHeight || 0;
            const contentHeight = contentRef.current?.scrollHeight || 0;

            // 假设单个条目高度接近 contentHeight / 当前显示条目数
            // 为简单起见，估计条目高度或者根据实际渲染的条目数动态调整
            if (contentRef.current && containerHeight) {
                // 计算每条高度（contentHeight / rendered items）
                const renderedCount = contentRef.current.children.length || 1;
                const approxItemHeight = contentHeight / renderedCount;

                // 容器最多能显示多少条
                const maxItems = Math.floor(containerHeight / approxItemHeight);
                setVisibleCount(maxItems > 0 ? maxItems : renderedCount);
            }
        };

        updateVisibleCount();
        window.addEventListener('resize', updateVisibleCount);
        return () => window.removeEventListener('resize', updateVisibleCount);
    }, [isVisible, songs, currentPage]);

    // 计算分页总数（基于 visibleCount 动态分页）
    const totalPages = visibleCount > 0 ? Math.ceil(songs.length / visibleCount) : 1;
    const currentSongs = songs.slice(
        (currentPage - 1) * visibleCount,
        currentPage * visibleCount
    );

    const goToPrev = () => currentPage > 1 && setCurrentPage(currentPage - 1);
    const goToNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

    return (
        <div className={`flex h-full w-full p-3 relative overflow-hidden ${isVisible ? '' : 'hidden'}`}>
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg w-full max-w-full mx-auto relative z-10 py-6 flex flex-col">
                {/* 搜索栏 */}
                <div className="mb-4 flex space-x-2">
                    <input
                        type="text"
                        placeholder="搜索歌曲或歌手"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 rounded-md px-3 py-2 text-sm bg-white/80 text-black focus:outline-none"
                    />
                    <button
                        onClick={handleSearch}
                        className="bg-white/30 text-white text-sm px-4 py-2 rounded-md hover:bg-white/40 transition"
                    >
                        搜索
                    </button>
                </div>

                {/* 列表容器 */}
                <div className="flex-1 overflow-hidden" ref={listContainerRef}>
                    <SimpleBar style={{ maxHeight: '100%' }} autoHide={true}>
                        <div ref={contentRef} className="space-y-3">
                            {currentSongs.map((song,index) => (
                                <MusicItem
                                    id={song.id}
                                    key={song.id}
                                    index={index}
                                    prcUrl={song.prcUrl}
                                    name={song.name}
                                    artist={song.artist}
                                    duration={song.duration}
                                >
                                    <button
                                        className="ml-4 px-3 py-1 rounded bg-white/30 text-xs hover:bg-white/50 transition"
                                        onClick={() => handleEnqueue(song)}
                                    >
                                        点歌
                                    </button>
                                </MusicItem>
                            ))}
                        </div>
                    </SimpleBar>
                </div>

                {/* 分页控制器 */}
                <div className="mb-2 flex justify-center items-center space-x-4 text-sm text-white">
                    <button
                        onClick={goToPrev}
                        disabled={currentPage === 1}
                        className={`px-3 py-1 rounded-md transition ${
                            currentPage === 1
                                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                                : 'bg-white/20 hover:bg-white/30'
                        }`}
                    >
                        上一页
                    </button>
                    <span className="text-white/80">
                        第 {currentPage} 页 / 共 {totalPages} 页
                    </span>
                    <button
                        onClick={goToNext}
                        disabled={currentPage === totalPages}
                        className={`px-3 py-1 rounded-md transition ${
                            currentPage === totalPages
                                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                                : 'bg-white/20 hover:bg-white/30'
                        }`}
                    >
                        下一页
                    </button>
                </div>
            </div>
        </div>
    );
}
