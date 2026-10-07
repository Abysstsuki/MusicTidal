'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import { apiRequest } from '@/lib/api';
import { authErrorMessage, validateAuthInput } from '@/lib/auth-errors';
import { useToast, useToastMessage } from '@/contexts/ToastContext';
import StageDialog from './StageDialog';
import type { AuthUser } from '@/contexts/AuthContext';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess?: (username: string, token: string, profile: AuthUser) => void;
}
export default function AuthModal({ onClose, onLoginSuccess }: AuthModalProps) {
  const { showToast } = useToast();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useToastMessage(error, { tone: 'error' });
  useToastMessage(notice, { tone: 'success' });
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const close = () => { request.current?.abort(); onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (request.current) return;
    setError(''); setNotice('');
    const validationError = validateAuthInput(username, email, password, isRegister);
    if (validationError) {
      showToast(validationError, { tone: 'error' });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setError(''); setNotice(''); setBusy(true);
    try {
      const payload = isRegister ? { username: username.trim(), email: email.trim(), password } : { email: email.trim(), password };
      const data = await apiRequest<{ token?: string; user?: AuthUser }>('/api/auth/' + (isRegister ? 'register' : 'login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      if (controller.signal.aborted) return;
      if (isRegister) { setIsRegister(false); setNotice('注册成功，登录后就能和大家聊天'); setPassword(''); setShowPassword(false); }
      else {
        if (!data.token || !data.user?.username || !Number.isSafeInteger(data.user.id)) throw new Error('登录未完成，请重试');
        showToast('登录成功', { tone: 'success' });
        onLoginSuccess?.(data.user.username, data.token, data.user); onClose();
      }
    } catch (err) { if (!controller.signal.aborted) setError(authErrorMessage(err, isRegister)); }
    finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return <StageDialog label={isRegister ? '注册账户' : '登录账户'} onClose={close} closeOnBackdrop={false}>
    <div className="auth-header"><span className="wordmark">Music<span>Tidal</span></span><button className="icon-button" onClick={close} aria-label="关闭登录"><CloseRounded /></button></div>
    <div className="auth-intro"><h2>{isRegister ? '注册账户' : '登录账户'}</h2></div>
    <form className="auth-form" noValidate onSubmit={event => void submit(event)}>
      {isRegister && <label>昵称<input required maxLength={40} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="大家怎么称呼你？" /></label>}
      <label>邮箱<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="你的邮箱" /></label>
      <label>密码<span className="password-field">
        <input required type={showPassword ? 'text' : 'password'} minLength={isRegister ? 6 : undefined} autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={isRegister ? '至少 6 位' : '请输入密码'} />
        <button className="icon-button password-toggle" type="button" aria-label={showPassword ? '隐藏密码' : '显示密码'} title={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword} onMouseDown={event => event.preventDefault()} onClick={() => setShowPassword(value => !value)}>{showPassword ? <VisibilityOffOutlined fontSize="small" /> : <VisibilityOutlined fontSize="small" />}</button>
      </span></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? '请稍等…' : isRegister ? '注册' : '登录'}<ArrowForwardRounded fontSize="small" /></button>
      <button className="auth-switch" type="button" disabled={busy} onClick={() => { setIsRegister(value => !value); setShowPassword(false); setError(''); setNotice(''); }}>{isRegister ? '已有账户？登录' : '第一次来？创建账户'}</button>
    </form>
  </StageDialog>;
}
