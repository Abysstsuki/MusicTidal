'use client';

import { useState, useRef } from 'react';
import MusicItem from './modelItem/MusicItem';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { Song, SongSearchResponse } from '@/types/music';

interface MusicReqProps {
    isVisible: boolean;
}

const PAGE_SIZE = 10;

export default function MusicReq({ isVisible }: MusicReqProps) {
    const [searchInput, setSearchInput] = useState('');
    const [songs, setSongs] = useState<Song[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const lastKeyword = useRef('');

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

    const fetchPage = async (keyword: string, page: number) => {
        setLoading(true);
        try {
            const offset = (page - 1) * PAGE_SIZE;
            const res = await fetch(
                `/api/song/search?keywords=${encodeURIComponent(keyword)}&offset=${offset}&limit=${PAGE_SIZE}`
            );
            const data: SongSearchResponse = await res.json();

            if (data.success && Array.isArray(data.data)) {
                setSongs(data.data);
                const total = data.total ?? 0;
                setTotalPages(total > 0 ? Math.ceil(total / PAGE_SIZE) : 1);
            } else {
                setSongs([]);
                setTotalPages(1);
            }
        } catch (err) {
            console.error('搜索出错:', err);
            setSongs([]);
            setTotalPages(1);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        const term = searchInput.trim();
        if (!term) return;

        lastKeyword.current = term;
        setSearchInput('');
        setCurrentPage(1);
        await fetchPage(term, 1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch();
    };

    const goToPage = (page: number) => {
        if (page < 1 || page > totalPages || page === currentPage || !lastKeyword.current) return;
        setCurrentPage(page);
        fetchPage(lastKeyword.current, page);
    };

    const hasSearched = lastKeyword.current !== '';

    return (
        <div className={`flex h-full w-full p-3 relative overflow-hidden ${isVisible ? '' : 'hidden'}`}>
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg w-full max-w-full mx-auto relative z-10 py-6 flex flex-col">
                {/* 搜索栏 */}
                <div className="mb-4 flex space-x-2">
                    <input
                        type="text"
                        placeholder="搜索歌曲或歌手"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 rounded-md px-3 py-2 text-sm bg-white/80 text-black focus:outline-none"
                    />
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="bg-white/30 text-white text-sm px-4 py-2 rounded-md hover:bg-white/40 transition disabled:opacity-50"
                    >
                        {loading ? '搜索中...' : '搜索'}
                    </button>
                </div>

                {/* 列表 */}
                <div className="flex-1 overflow-hidden">
                    <SimpleBar style={{ maxHeight: '100%' }} autoHide={true}>
                        <div className="space-y-3">
                            {!hasSearched && !loading && (
                                <p className="text-center text-white/50 text-sm py-8">请输入关键词搜索歌曲</p>
                            )}
                            {hasSearched && songs.length === 0 && !loading && (
                                <p className="text-center text-white/50 text-sm py-8">未找到结果</p>
                            )}
                            {songs.map((song, index) => (
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

                {/* 分页 */}
                {hasSearched && totalPages > 1 && (
                    <div className="mt-3 flex justify-center items-center space-x-2 text-sm text-white">
                        <button
                            onClick={() => goToPage(1)}
                            disabled={currentPage === 1}
                            className={`px-2 py-1 rounded transition ${
                                currentPage === 1
                                    ? 'text-white/30 cursor-not-allowed'
                                    : 'hover:bg-white/20'
                            }`}
                        >
                            &laquo;
                        </button>
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className={`px-3 py-1 rounded-md transition ${
                                currentPage === 1
                                    ? 'bg-white/10 text-white/40 cursor-not-allowed'
                                    : 'bg-white/20 hover:bg-white/30'
                            }`}
                        >
                            上一页
                        </button>

                        <span className="text-white/80 px-2">
                            第 {currentPage} / {totalPages} 页
                        </span>

                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className={`px-3 py-1 rounded-md transition ${
                                currentPage === totalPages
                                    ? 'bg-white/10 text-white/40 cursor-not-allowed'
                                    : 'bg-white/20 hover:bg-white/30'
                            }`}
                        >
                            下一页
                        </button>
                        <button
                            onClick={() => goToPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className={`px-2 py-1 rounded transition ${
                                currentPage === totalPages
                                    ? 'text-white/30 cursor-not-allowed'
                                    : 'hover:bg-white/20'
                            }`}
                        >
                            &raquo;
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
