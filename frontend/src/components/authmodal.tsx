'use client';

import { useEffect, useState } from 'react';

interface AuthModalProps {
    onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
    const [show, setShow] = useState(false);
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setShow(true), 10);
        return () => clearTimeout(timer);
    }, []);

    // 表单提交逻辑（登录或注册）
    const handleSubmit = () => {
        if (!username || !password) {
            setError('请填写用户名和密码');
            return;
        }

        if (password.length < 6) {
            setError('密码长度至少为 6 位');
            return;
        }

        // 可扩展邮箱、特殊字符验证等
        setError('');
        if (isRegister) {
            alert(`注册成功：${username}`);
        } else {
            alert(`登录成功：${username}`);
        }
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose} // 点击遮罩关闭
        >
            <div
                className={`bg-[rgba(255,255,255,0.2)] backdrop-blur-lg rounded-lg p-6 w-[26rem] max-w-full transition-all duration-300 ${
                    show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                onClick={(e) => e.stopPropagation()} // 阻止点击冒泡
            >
                {/* 关闭按钮 */}
                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        className="text-white hover:text-red-300 text-xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* 登录 / 注册表单 */}
                <div className="space-y-4 mt-2 text-white text-sm">
                    <div className="text-2xl font-semibold text-center">
                        {isRegister ? '注册' : '登录'}
                    </div>

                    <input
                        className="w-full p-2 bg-white/40 rounded text-black placeholder-white/70"
                        placeholder="用户名"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />

                    <input
                        className="w-full p-2 bg-white/40 rounded text-black placeholder-white/70"
                        placeholder="密码（至少6位）"
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
