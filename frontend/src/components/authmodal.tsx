'use client';

import { useEffect, useState } from 'react';

import { BACKEND_URL } from '@/lib/api';

interface AuthModalProps {
    onClose: () => void;
    onLoginSuccess?: (username: string, token: string) => void;
}

export default function AuthModal({ onClose, onLoginSuccess }: AuthModalProps) {
    const [show, setShow] = useState(false);
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 10);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async () => {
        if (isRegister) {
            if (!username || !email || !password) {
                setError('请填写所有注册信息');
                return;
            }
        } else {
            if (!email || !password) {
                setError('请填写邮箱和密码');
                return;
            }
        }

        if (password.length < 6) {
            setError('密码长度至少为 6 位');
            return;
        }

        setError('');

        try {
            const payload = isRegister
                ? { username, email, password }
                : { email, password };

            const res = await fetch(`${BACKEND_URL}/api/auth/${isRegister ? 'register' : 'login'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || '请求失败');
                return;
            }

            // 登录时存 token 并通知父组件
            // 只改登录相关部分，省略其他代码

            if (!isRegister) {
                if (data.token) {
                    localStorage.setItem('token', data.token);
                } else {
                    console.warn('登录成功，但未返回 token');
                }

                // 注意：从后端返回的 user 对象里取用户名
                if (onLoginSuccess) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    onLoginSuccess(data.user.username, data.token);
                }
            }


            alert(`${isRegister ? '注册' : '登录'}成功：${data.username || username || email}`);
            location.reload();
            onClose();
        } catch {
            setError('网络错误，请稍后重试');
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={onClose}
        >
            <div
                className={`transition-all duration-300 ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                style={{
                    border: '1px solid var(--line)',
                    background: 'var(--bg-panel-strong)',
                    padding: 24,
                    width: '26rem',
                    maxWidth: '90vw'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-6"
                     style={{ borderBottom: '1px solid var(--line-light)', paddingBottom: 12 }}>
                    <span style={{ fontSize: '9px', letterSpacing: '0.3em', color: 'var(--accent-blue)' }}>
                        AUTHENTICATION // <span style={{ color: 'var(--text-secondary)' }}>{isRegister ? 'REGISTER' : 'LOGIN'}</span>
                    </span>
                    <button onClick={onClose} style={{ color: 'rgba(184,196,220,0.55)', cursor: 'pointer', background: 'none', border: 'none', fontSize: 14 }}>✕</button>
                </div>

                {/* Form fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {isRegister && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 8, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>NICKNAME</span>
                            <input
                                style={{ border: '1px solid var(--line)', background: 'transparent', padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                                placeholder="输入昵称"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 8, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>EMAIL</span>
                        <input
                            style={{ border: '1px solid var(--line)', background: 'transparent', padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                            placeholder="输入邮箱"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 8, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>PASSWORD</span>
                        <input
                            style={{ border: '1px solid var(--line)', background: 'transparent', padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                            placeholder="••••••••"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div style={{ color: 'rgba(255,80,80,0.7)', fontSize: 11, textAlign: 'center' }}>{error}</div>
                    )}

                    <button onClick={handleSubmit}
                            style={{
                                padding: '8px 0',
                                border: '1px solid var(--accent-blue-line)',
                                fontSize: '9px',
                                letterSpacing: '0.3em',
                                color: 'var(--accent-blue)',
                                background: 'transparent',
                                cursor: 'pointer',
                                textAlign: 'center',
                                width: '100%'
                            }}>
                        {isRegister ? 'REGISTER' : 'LOGIN'}
                    </button>

                    <div
                        style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => { setIsRegister(!isRegister); setError(''); }}
                    >
                        {isRegister ? 'ALREADY HAVE AN ACCOUNT? LOGIN' : "NO ACCOUNT? REGISTER"}
                    </div>
                </div>
            </div>
        </div>
    );
}
