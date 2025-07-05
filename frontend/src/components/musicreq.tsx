'use client';

import { useState, useEffect, useRef } from 'react';
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
    const [itemsPerPage, setItemsPerPage] = useState(6);

    const listContainerRef = useRef<HTMLDivElement>(null);
    const itemHeight = 70;

    useEffect(() => {
        if (!isVisible) return;

        const updateItemsPerPage = () => {
            if (listContainerRef.current) {
                const height = listContainerRef.current.offsetHeight;
                const count = Math.floor(height / itemHeight);
                setItemsPerPage(count > 2 ? count : 2);
            }
        };

        updateItemsPerPage();
        window.addEventListener('resize', updateItemsPerPage);
        return () => window.removeEventListener('resize', updateItemsPerPage);
    }, [isVisible]);
    const handleEnqueue = async (song: Song) => {
        try {
            const res = await fetch('/api/song/queueAdd', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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
        // 去除首尾空白字符后判断是否为空
        if (!searchTerm.trim()) {
            return; // 直接返回，不进行搜索
        }

        try {
            const res = await fetch(`/api/song/search?keywords=${encodeURIComponent(searchTerm)}`);
            const data: SongSearchResponse = await res.json();

            if (data.success && Array.isArray(data.data)) {
                setSongs(data.data);
            } else {
                console.error('搜索结果格式不正确:', data);
                setSongs([]);
            }
        } catch (err) {
            console.error('搜索出错:', err);
            setSongs([]);
        } finally {
            // 搜索完成后清空搜索框和关键词
            setSearchTerm('');
        }
    };

    const totalPages = Math.ceil(songs.length / itemsPerPage) || 1;
    const currentSongs = songs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
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
                        <div className="space-y-3">
                            {currentSongs.map((song) => (
                                <div
                                    key={song.id}
                                    className="p-3 bg-white/10 text-white rounded-md hover:bg-white/20 transition text-sm h-[70px] flex items-center justify-between"
                                >
                                    <div className="flex items-center">
                                        <img src={song.prcUrl} alt={song.name} className="w-12 h-12 rounded-md mr-3" />
                                        <div>
                                            <div className="font-semibold">{song.name}</div>
                                            <div className="text-white/70 text-xs">{song.artist}</div>
                                        </div>
                                    </div>
                                    <button
                                        className="ml-4 px-3 py-1 rounded bg-white/30 text-xs hover:bg-white/50 transition"
                                        onClick={() => handleEnqueue(song)}
                                    >
                                        点歌
                                    </button>
                                </div>
                            ))}
                        </div>
                    </SimpleBar>
                </div>

                {/* 分页控制器 */}
                <div className="mt-4 flex justify-center items-center space-x-4 text-sm text-white">
                    <button
                        onClick={goToPrev}
                        disabled={currentPage === 1}
                        className={`px-3 py-1 rounded-md transition ${currentPage === 1
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
                        className={`px-3 py-1 rounded-md transition ${currentPage === totalPages
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
