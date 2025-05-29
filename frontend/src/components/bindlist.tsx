'use client';

import { Button, List, ListItem, ListItemButton, ListItemText, TextField } from '@mui/material';
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
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
            <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">绑定歌单</h2>
                    <Button onClick={onClose}>关闭</Button>
                </div>

                <div className="mb-4 flex space-x-2">
                    <TextField
                        fullWidth
                        label="网易云用户名"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <Button variant="contained" onClick={fetchPlaylists} disabled={loading}>
                        {loading ? '加载中...' : '搜索'}
                    </Button>
                </div>

                <List>
                    {playlists.map((playlist) => (
                        <ListItem key={playlist.id} disablePadding>
                            <ListItemButton onClick={() => bindPlaylist(playlist)}>
                                <ListItemText primary={playlist.name} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </div>
        </div>
    );
}
