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
        <div className="p-6 w-full max-w-full mx-auto relative z-10 flex flex-col"
             style={{ border: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(18,20,26,0.95)' }}>

            {/* Search bar */}
            <div className="mb-4 flex space-x-2">
                <input
                    type="text"
                    placeholder="SEARCH_TRACK / ARTIST..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={{
                        flex: 1,
                        border: '0.5px solid rgba(255,255,255,0.1)',
                        background: 'transparent',
                        padding: '6px 10px',
                        color: '#E8E8EF',
                        fontSize: '11px',
                        outline: 'none'
                    }}
                />
                <button
                    onClick={handleSearch}
                    disabled={loading}
                    style={{
                        padding: '6px 14px',
                        border: '0.5px solid rgba(58,107,255,0.3)',
                        fontSize: '9px',
                        letterSpacing: '0.3em',
                        color: '#3A6BFF',
                        background: 'transparent',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.5 : 1
                    }}
                >
                    {loading ? '搜索中...' : 'SEARCH'}
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-hidden">
                <SimpleBar style={{ maxHeight: '100%' }} autoHide={true}>
                    <div className="space-y-1">
                        {!hasSearched && !loading && (
                            <p className="text-center py-8" style={{ color: '#8B8FA3', fontSize: '13px', opacity: 0.5 }}>请输入关键词搜索歌曲</p>
                        )}
                        {hasSearched && songs.length === 0 && !loading && (
                            <p className="text-center py-8" style={{ color: '#8B8FA3', fontSize: '13px', opacity: 0.5 }}>未找到结果</p>
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
                                    style={{
                                        padding: '2px 8px',
                                        border: '0.5px solid rgba(58,107,255,0.3)',
                                        fontSize: '8px',
                                        letterSpacing: '0.2em',
                                        color: '#3A6BFF',
                                        background: 'transparent',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => handleEnqueue(song)}
                                >
                                    ADD
                                </button>
                            </MusicItem>
                        ))}
                    </div>
                </SimpleBar>
            </div>

            {/* Pagination */}
            {hasSearched && totalPages > 1 && (
                <div className="mt-3 flex justify-center items-center space-x-2">
                    <button onClick={() => goToPage(1)}
                            disabled={currentPage === 1}
                            style={{
                                padding: '2px 6px',
                                border: '0.5px solid rgba(255,255,255,0.1)',
                                fontSize: '9px',
                                letterSpacing: '0.2em',
                                color: currentPage === 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)',
                                background: 'transparent',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                            }}>
                        «
                    </button>
                    <button onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            style={{
                                padding: '4px 8px',
                                border: '0.5px solid rgba(255,255,255,0.1)',
                                fontSize: '9px',
                                letterSpacing: '0.2em',
                                color: currentPage === 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)',
                                background: 'transparent',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                            }}>
                        PREV
                    </button>
                    <span style={{ fontSize: '9px', color: '#8B8FA3', padding: '0 8px' }}>
                        PAGE {currentPage} / {totalPages}
                    </span>
                    <button onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            style={{
                                padding: '4px 8px',
                                border: '0.5px solid rgba(255,255,255,0.1)',
                                fontSize: '9px',
                                letterSpacing: '0.2em',
                                color: currentPage === totalPages ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)',
                                background: 'transparent',
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                            }}>
                        NEXT
                    </button>
                    <button onClick={() => goToPage(totalPages)}
                            disabled={currentPage === totalPages}
                            style={{
                                padding: '2px 6px',
                                border: '0.5px solid rgba(255,255,255,0.1)',
                                fontSize: '9px',
                                letterSpacing: '0.2em',
                                color: currentPage === totalPages ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)',
                                background: 'transparent',
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                            }}>
                        »
                    </button>
                </div>
            )}
        </div>
    </div>
    );
}
