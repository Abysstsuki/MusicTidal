'use client';

import { useState, useEffect } from 'react';
import AuthModal from './authmodal';
import BindPlaylistModal from './bindlist';

interface User {
    isLoggedIn: boolean;
    name: string;
    isPlaylistBound: boolean;
}

export default function UserInfo() {
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showBindModal, setShowBindModal] = useState(false);
    const [user, setUser] = useState<User>({
        isLoggedIn: false,
        name: '',
        isPlaylistBound: false,
    });

    // 页面刷新时尝试用 token 恢复用户信息
    useEffect(() => {
        const token = localStorage.getItem('token');
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
            <div className="p-6 w-160 max-w-full mx-auto relative z-10 flex flex-col items-center space-y-6"
                 style={{ border: '1px solid var(--line)', background: 'var(--bg-panel)' }}>

                {/* DataCircle avatar */}
                <div style={{
                    width: 56, height: 56,
                    border: '1px solid rgba(99,179,255,0.3)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ width: 8, height: 8, background: 'var(--accent-blue)', borderRadius: '50%', opacity: 0.5 }} />
                </div>

                {/* Signal status */}
                <div className="text-center">
                    <div style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--text-secondary)' }}>SIGNAL STATUS</div>
                    <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {user.isLoggedIn ? (
                            <>CONNECTED / <span style={{ color: 'var(--accent-blue)' }}>{user.name}</span></>
                        ) : (
                            <>OFFLINE / <span style={{ color: 'var(--accent-blue)' }}>LOGIN</span></>
                        )}
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 240 }}>
                    {user.isLoggedIn ? (
                        <>
                            {!user.isPlaylistBound ? (
                                <button onClick={() => setShowBindModal(true)}
                                        style={{
                                            padding: '6px 16px',
                                            border: '1px solid var(--accent-blue-line)',
                                            fontSize: '9px',
                                            letterSpacing: '0.3em',
                                            color: 'var(--accent-blue)',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            textAlign: 'center'
                                        }}>
                                    BIND PLAYLIST
                                </button>
                            ) : (
                                <button onClick={handleUnbind}
                                        style={{
                                            padding: '6px 16px',
                                            border: '1px solid var(--line)',
                                            fontSize: '9px',
                                            letterSpacing: '0.3em',
                                            color: 'var(--text-muted)',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            textAlign: 'center'
                                        }}>
                                    UNBIND
                                </button>
                            )}
                            <button onClick={handleLogout}
                                    style={{
                                        padding: '6px 16px',
                                        border: '1px solid rgba(255,107,122,0.45)',
                                        fontSize: '9px',
                                        letterSpacing: '0.3em',
                                        color: 'var(--danger)',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        textAlign: 'center'
                                    }}>
                                LOGOUT
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setShowAuthModal(true)}
                                style={{
                                    padding: '6px 16px',
                                    border: '1px solid var(--accent-blue-line)',
                                    fontSize: '9px',
                                    letterSpacing: '0.3em',
                                    color: 'var(--accent-blue)',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    textAlign: 'center'
                                }}>
                            LOGIN / REGISTER
                        </button>
                    )}
                </div>
            </div>

            {showAuthModal && (
                <div className="absolute inset-0 z-50">
                    <AuthModal
                        onClose={() => setShowAuthModal(false)}
                        onLoginSuccess={(username: string, token: string) =>
                            handleLoginSuccess(username, token)
                        }
                    />
                </div>
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
