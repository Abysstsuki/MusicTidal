'use client';

import { useState, useEffect } from 'react';
import { Button, Stack } from '@mui/material';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginIcon from '@mui/icons-material/Login';
import AuthModal from './authmodal';
import MusicRequestModal from './musicreq';
import BindPlaylistModal from './bindlist';

interface User {
    isLoggedIn: boolean;
    name: string;
    isPlaylistBound: boolean;
}

export default function UserInfo() {
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [showBindModal, setShowBindModal] = useState(false);
    const [user, setUser] = useState<User>({
        isLoggedIn: false,
        name: '',
        isPlaylistBound: false,
    });

    // 页面刷新时尝试用 token 恢复用户信息
    useEffect(() => {
        const token = localStorage.getItem('token');
        console.log(token);
        if (!token) return;

        fetch('/api/user/me', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
            .then(res => {
                if (!res.ok) throw new Error('验证失败');
                return res.json();
            })
            .then(data => {
                setUser({
                    isLoggedIn: true,
                    name: data.username || data.email,
                    isPlaylistBound: false,
                });
            })
            .catch(err => {
                console.error('自动登录失败:', err);
                localStorage.removeItem('token');
            });

    }, []);

    const handleLoginSuccess = (username: string, token: string) => {
        localStorage.setItem('token', token);
        setUser({ isLoggedIn: true, name: username, isPlaylistBound: false });
        setShowAuthModal(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser({ isLoggedIn: false, name: '', isPlaylistBound: false });
        location.reload();
    };

    const handleBindSuccess = () => {
        setUser({ ...user, isPlaylistBound: true });
        setShowBindModal(false);
    };

    const handleUnbind = () => {
        setUser({ ...user, isPlaylistBound: false });
    };

    return (
        <div className="w-full h-full flex p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg w-160 max-w-full mx-auto relative z-10 py-10 flex flex-col items-center space-y-6">
                <h2 className="text-white text-2xl font-semibold">
                    {user.isLoggedIn ? `欢迎，${user.name}` : '未登录'}
                </h2>

                {user.isLoggedIn && (
                    <Stack direction="row" spacing={2}>
                        {!user.isPlaylistBound ? (
                            <Button
                                variant="outlined"
                                startIcon={<PlaylistAddIcon />}
                                onClick={() => setShowBindModal(true)}
                                sx={{
                                    color: '#fff',
                                    borderColor: '#fff',
                                    '&:hover': { borderColor: '#ccc' },
                                }}
                            >
                                绑定歌单
                            </Button>
                        ) : (
                            <Button
                                variant="outlined"
                                startIcon={<PlaylistAddIcon />}
                                onClick={handleUnbind}
                                sx={{
                                    color: '#fff',
                                    borderColor: '#fff',
                                    '&:hover': { borderColor: '#ccc' },
                                }}
                            >
                                解除绑定
                            </Button>
                        )}
                        <Button
                            variant="outlined"
                            startIcon={<LibraryMusicIcon />}
                            onClick={() => setShowRequestModal(true)}
                            sx={{
                                color: '#fff',
                                borderColor: '#fff',
                                '&:hover': { borderColor: '#ccc' },
                            }}
                        >
                            点歌
                        </Button>
                    </Stack>
                )}

                <div>
                    {user.isLoggedIn ? (
                        <Button
                            variant="contained"
                            startIcon={<LogoutIcon />}
                            color="error"
                            onClick={handleLogout}
                        >
                            登出
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            startIcon={<LoginIcon />}
                            color="primary"
                            onClick={() => setShowAuthModal(true)}
                        >
                            登录 / 注册
                        </Button>
                    )}
                </div>
            </div>

            {showAuthModal && (
                <div className="absolute inset-0 z-50">
                    <AuthModal
                        onClose={() => setShowAuthModal(false)}
                        // 修改这里，让 AuthModal 返回 token 和用户名
                        onLoginSuccess={(username: string, token: string) =>
                            handleLoginSuccess(username, token)
                        }
                    />
                </div>
            )}

            {showRequestModal && (
                <MusicRequestModal onClose={() => setShowRequestModal(false)} />
            )}
            {showBindModal && (
                <BindPlaylistModal
                    onClose={() => setShowBindModal(false)}
                    onBindSuccess={handleBindSuccess}
                />
            )}
        </div>
    );
}
