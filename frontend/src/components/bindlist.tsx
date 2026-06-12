'use client';

import { useState } from 'react';

interface BindPlaylistModalProps {
    onClose: () => void;
    onBindSuccess: () => void;
}

interface Playlist {
    id: number;
    name: string;
}

export default function BindPlaylistModal({ onClose, onBindSuccess }: BindPlaylistModalProps) {
    const [username, setUsername] = useState('');
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchPlaylists = async () => {
        if (!username.trim()) return;

        setLoading(true);
        try {
            // 假设调用后端 API 获取歌单
            const res = await fetch(`/api/netease/userlist?username=${username}`);
            const data = await res.json();
            setPlaylists(data.playlists || []);
        } catch (err) {
            console.error('获取歌单失败', err);
        }
        setLoading(false);
    };

    const bindPlaylist = (playlist: Playlist) => {
        console.log('绑定歌单：', playlist);
        onBindSuccess();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-panel-strong)',
                padding: 24,
                maxWidth: '32rem',
                width: '100%'
            }}>
                {/* Header */}
                <div className="flex justify-between items-center mb-6"
                     style={{ borderBottom: '1px solid var(--line-light)', paddingBottom: 12 }}>
                    <span style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--accent-blue)' }}>BIND PLAYLIST</span>
                    <button onClick={onClose}
                            style={{
                                padding: '2px 8px',
                                border: '1px solid var(--line)',
                                fontSize: '8px',
                                letterSpacing: '0.2em',
                                color: 'var(--text-muted)',
                                background: 'transparent',
                                cursor: 'pointer'
                            }}>
                        CLOSE
                    </button>
                </div>

                {/* Search */}
                <div className="mb-4 flex space-x-2">
                    <input
                        style={{
                            flex: 1,
                            border: '1px solid var(--line)',
                            background: 'transparent',
                            padding: '6px 10px',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            outline: 'none'
                        }}
                        placeholder="网易云用户名"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <button onClick={fetchPlaylists} disabled={loading}
                            style={{
                                padding: '6px 14px',
                                border: '1px solid var(--accent-blue-line)',
                                fontSize: '9px',
                                letterSpacing: '0.3em',
                                color: 'var(--accent-blue)',
                                background: 'transparent',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.5 : 1
                            }}>
                        {loading ? '加载中...' : 'SEARCH'}
                    </button>
                </div>

                {/* Playlist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {playlists.map((playlist) => (
                        <div key={playlist.id}
                             className="flex items-center justify-between py-2 px-2 border-b border-[var(--line-light)] cursor-pointer"
                             style={{ transition: 'background 0.2s' }}
                             onClick={() => bindPlaylist(playlist)}
                             onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                             onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                            <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{playlist.name}</span>
                            <span style={{
                                padding: '1px 6px',
                                border: '1px solid var(--accent-blue-line)',
                                fontSize: '8px',
                                letterSpacing: '0.2em',
                                color: 'var(--accent-blue)'
                            }}>BIND</span>
                        </div>
                    ))}
                    {playlists.length === 0 && (
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', padding: 16, opacity: 0.5 }}>输入网易云用户名搜索歌单</p>
                    )}
                </div>
            </div>
        </div>
    );
}
