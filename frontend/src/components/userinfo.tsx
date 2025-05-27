'use client';

import { useState } from 'react';
import { Button } from '@mui/material';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import LogoutIcon from '@mui/icons-material/Logout';
import LoginIcon from '@mui/icons-material/Login';
import AuthModal from './authmodal';

export default function UserInfo() {
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [user, setUser] = useState({
        isLoggedIn: false,
        name: 'AbyssTsuki',
        isPlaylistBound: false,
    });

    return (
        <div className="w-full h-full flex p-3 relative overflow-hidden">
            <div className="bg-[rgba(255,255,255,0.2)] backdrop-blur-lg p-4 rounded-lg w-160 max-w-full mx-auto relative z-10 py-10 flex flex-col items-center space-y-6">
                {/* 用户名称 */}
                <h2 className="text-white text-2xl font-semibold">
                    {user.isLoggedIn ? `欢迎，${user.name}` : '未登录'}
                </h2>

                {/* 歌单绑定状态 */}
                <div className="text-white text-lg">
                    {user.isLoggedIn ? (
                        user.isPlaylistBound ? (
                            <p className="text-green-300">已绑定歌单</p>
                        ) : (
                            <Button
                                variant="outlined"
                                startIcon={<PlaylistAddIcon />}
                                onClick={() => alert('绑定歌单功能')}
                                sx={{
                                    color: '#fff',
                                    borderColor: '#fff',
                                    '&:hover': { borderColor: '#ccc' },
                                }}
                            >
                                绑定歌单
                            </Button>
                        )
                    ) : null}
                </div>

                {/* 登录 / 登出按钮 */}
                <div>
                    {user.isLoggedIn ? (
                        <Button
                            variant="contained"
                            startIcon={<LogoutIcon />}
                            color="error"
                            onClick={() => alert('登出逻辑')}
                        >
                            登出
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            startIcon={<LoginIcon />}
                            color="primary"
                            onClick={() => setShowAuthModal(true)} // 控制显示
                        >
                            登录 / 注册
                        </Button>
                    )}
                </div>
            </div>
            {showAuthModal && (
                <div className="absolute inset-0 z-50">
                    <AuthModal onClose={() => setShowAuthModal(false)} />
                </div>
            )}
        </div>
    );
}
