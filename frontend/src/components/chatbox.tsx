'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import SendRounded from '@mui/icons-material/SendRounded';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import { useMusicContext } from '@/contexts/MusicContext';
import AuthModal from './authmodal';

export default function ChatBox() {
  const { messages, user, connection, sendChat, login } = useMusicContext();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    try { sendChat(text); setInput(''); setError(''); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <div className="chat-content">
      <div className="chat-history" aria-label="聊天记录" role="log" aria-live="polite">
        {!messages.length && <div className="panel-empty"><AccountCircleOutlined /><p>暂无消息</p>{!user && <span>登录后可以发送消息</span>}</div>}
        {messages.map((message, index) => <div className={'chat-message ' + (message.username === user?.username ? 'is-me' : '')} key={index}>
          <div className="listener-avatar" aria-hidden="true"><AccountCircleOutlined /></div>
          <div><span className="message-author">{message.username}</span><p>{message.text}</p></div>
        </div>)}
        <div ref={endRef} />
      </div>
      {error && <p className="inline-error" role="status">{error}</p>}
      {user ? <form className="chat-composer" onSubmit={submit}>
        <input aria-label="聊天消息" placeholder={connection === 'connected' ? '说点什么…' : '正在重新连接…'} value={input} onChange={event => setInput(event.target.value)} maxLength={500} autoComplete="off" />
        <button className="icon-button" type="submit" title="发送消息" aria-label="发送消息" disabled={!input.trim() || connection !== 'connected'}><SendRounded /></button>
      </form> : <button className="login-chat-button" onClick={() => setShowAuth(true)}>登录后聊天</button>}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLoginSuccess={login} />}
    </div>
  );
}
