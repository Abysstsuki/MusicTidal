'use client';

import { useState, type FormEvent } from 'react';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { apiRequest } from '@/lib/api';
import StageDialog from './StageDialog';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess?: (username: string, token: string) => void;
}
export default function AuthModal({ onClose, onLoginSuccess }: AuthModalProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      const payload = isRegister ? { username: username.trim(), email: email.trim(), password } : { email: email.trim(), password };
      const data = await apiRequest<{ token?: string; user?: { username: string } }>('/api/auth/' + (isRegister ? 'register' : 'login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (isRegister) { setIsRegister(false); setNotice('注册成功，登录后就能和大家聊天'); setPassword(''); }
      else {
        if (!data.token || !data.user?.username) throw new Error('登录未完成，请重试');
        onLoginSuccess?.(data.user.username, data.token); onClose();
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  return <StageDialog label={isRegister ? '注册账户' : '登录账户'} onClose={onClose}>
    <div className="auth-header"><span className="wordmark">Music<span>Tidal</span></span><button className="icon-button" onClick={onClose} aria-label="关闭登录"><CloseRounded /></button></div>
    <div className="auth-intro"><p className="eyebrow">ON THE SAME FREQUENCY</p><h2>{isRegister ? '找到你的同频。' : '欢迎回来，一起听。'}</h2><p>一首歌，一段对话，一个共同的此刻。</p></div>
    <form className="auth-form" onSubmit={event => void submit(event)}>
      {isRegister && <label>昵称<input required maxLength={40} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="大家怎么称呼你？" /></label>}
      <label>邮箱<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="你的邮箱" /></label>
      <label>密码<input required type="password" minLength={6} autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 6 位" /></label>
      {error && <p className="inline-error" role="alert">{error}</p>}{notice && <p className="inline-success" role="status">{notice}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? '请稍等…' : isRegister ? '注册' : '登录'}<ArrowForwardRounded fontSize="small" /></button>
      <button className="auth-switch" type="button" disabled={busy} onClick={() => { setIsRegister(value => !value); setError(''); setNotice(''); }}>{isRegister ? '已有账户？登录' : '第一次来？创建账户'}</button>
    </form>
  </StageDialog>;
}
