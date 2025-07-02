'use client';

import { useEffect, useState } from 'react';

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

            const res = await fetch(`/api/auth/${isRegister ? 'register' : 'login'}`, {
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
                    console.log('登录成功，token已存储:', data.token);
                } else {
                    console.warn('登录成功，但未返回 token');
                }

                // 注意：从后端返回的 user 对象里取用户名
                const username = data.user?.username || email;
                if (onLoginSuccess) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    onLoginSuccess(data.user.username, data.token);
                }
            }


            alert(`${isRegister ? '注册' : '登录'}成功：${data.username || username || email}`);
            location.reload();
            onClose();
        } catch (error) {
            setError('网络错误，请稍后重试');
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className={`bg-[rgba(255,255,255,0.2)] backdrop-blur-lg rounded-lg p-6 w-[26rem] max-w-full transition-all duration-300 ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                    }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        className="text-white hover:text-red-300 text-xl font-bold"
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-4 mt-2 text-white text-sm">
                    <div className="text-2xl font-semibold text-center">
                        {isRegister ? '注册' : '登录'}
                    </div>

                    {isRegister && (
                        <input
                            className="w-full p-2 bg-white/40 rounded text-black placeholder-white/70"
                            placeholder="昵称"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    )}

                    <input
                        className="w-full p-2 bg-white/40 rounded text-black placeholder-white/70"
                        placeholder="邮箱"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />

                    <input
                        className="w-full p-2 bg-white/40 rounded text-black placeholder-white/70"
                        placeholder="密码"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />

                    {error && (
                        <div className="text-red-300 text-sm text-center">{error}</div>
                    )}

                    <button
                        onClick={handleSubmit}
                        className="w-full bg-white/30 hover:bg-white/50 text-white py-2 rounded mt-2"
                    >
                        {isRegister ? '注册' : '登录'}
                    </button>

                    <div
                        className="text-center text-sm text-white/70 hover:underline cursor-pointer"
                        onClick={() => {
                            setIsRegister(!isRegister);
                            setError('');
                        }}
                    >
                        {isRegister ? '已有账号？登录' : '没有账号？注册'}
                    </div>
                </div>
            </div>
        </div>
    );
}
