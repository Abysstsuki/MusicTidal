'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import LockOutlined from '@mui/icons-material/LockOutlined';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, ApiError } from '@/lib/api';
import type { RoomSummary } from '@/types/room';
import UserInfo from '@/components/userinfo';
import AuthModal from '@/components/authmodal';
import StageDialog from '@/components/StageDialog';
import NeteaseBinding from '@/components/NeteaseBinding';
import ActiveRoomChoice from '@/components/ActiveRoomChoice';
import SongCover from '@/components/modelItem/SongCover';

type Action = { kind: 'create' } | { kind: 'join'; room: RoomSummary };
export default function Home() {
  const auth = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showBinding, setShowBinding] = useState(false);
  const [active, setActive] = useState<RoomSummary | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const authCompleted = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++sequence.current;
    try {
      const data = await apiRequest<{ rooms: RoomSummary[] }>('/api/rooms', { signal });
      if (!signal?.aborted && version === sequence.current) { setRooms(data.rooms); setLoadError(''); }
    } catch (problem) { if (!signal?.aborted && version === sequence.current) setLoadError((problem as Error).message); }
    finally { if (!signal?.aborted && version === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setNotice(sessionStorage.getItem('room-notice') || ''); sessionStorage.removeItem('room-notice');
    void refresh(controller.signal);
    const interval = setInterval(() => void refresh(controller.signal), 10000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [refresh]);
  useEffect(() => {
    setActive(null);
    if (!auth.user) return;
    const controller = new AbortController();
    apiRequest<{ room: RoomSummary | null }>('/api/user/active-room', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setActive(data.room); }).catch(() => {});
    return () => controller.abort();
  }, [auth.user]);
  const open = (next: Action) => {
    setAction(next); setError(''); setPassword(''); setName('');
    if (!auth.user) { authCompleted.current = false; setShowAuth(true); }
  };
  const handleProblem = async (problem: unknown) => {
    if (problem instanceof ApiError && problem.code === 'ACTIVE_ROOM') {
      const current = await apiRequest<{ room: RoomSummary | null }>('/api/user/active-room'); setActive(current.room);
    }
    setError((problem as Error).message);
  };
  const enter = async (room: RoomSummary) => {
    setBusy(true); setError('');
    try {
      await apiRequest('/api/rooms/' + room.id + '/join', { method: 'POST', body: JSON.stringify({ password }) });
      window.location.assign('/room?roomId=' + room.id);
    } catch (problem) { await handleProblem(problem); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (auth.user && action?.kind === 'join' && !action.room.locked && (!active || active.id === action.room.id)) void enter(action.room);
    // Resume the selected room after login; password rooms wait for the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, action]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await apiRequest<{ room: RoomSummary }>('/api/rooms', { method: 'POST', body: JSON.stringify({ name: name.trim(), password: password || undefined }) });
      window.location.assign('/room?roomId=' + data.room.id);
    } catch (problem) { await handleProblem(problem); }
    finally { setBusy(false); }
  };
  const visible = rooms.filter(room => (room.name + room.host.username).toLowerCase().includes(filter.toLowerCase()));
  return <main className="room-lobby">
    <header className="lobby-header"><Link className="wordmark" href="/">Music<span>Tidal</span></Link><span className="lobby-tagline">找一个房间，一起听。</span><div className="lobby-account">{auth.user && <button className="pill-button" onClick={() => setShowBinding(true)}>网易云账号</button>}<UserInfo /></div></header>
    <section className="lobby-intro"><div><p className="eyebrow">LISTEN TOGETHER</p><h1>正在一起听</h1><p>进入房间，分享下一首歌。</p></div><button className="primary-button" disabled={auth.loading} onClick={() => open({ kind: 'create' })}><AddRounded fontSize="small" />创建房间</button></section>
    {notice && <p className="lobby-notice" role="status">{notice}</p>}
    {auth.error && <p className="inline-error" role="alert">{auth.error} <button className="pill-button" onClick={auth.retry}>重试登录状态</button></p>}
    {active && !action && <ActiveRoomChoice room={active} onLeft={() => { setActive(null); void refresh(); }} />}
    <section className="lobby-rooms" aria-label="房间列表"><div className="lobby-list-heading"><h2>房间 <span>{rooms.length}</span></h2><div><input aria-label="搜索房间" placeholder="搜索房间或房主" value={filter} onChange={event => setFilter(event.target.value)} /><button className="icon-button" aria-label="刷新房间列表" onClick={() => void refresh()}><RefreshRounded /></button></div></div>
      {loadError && <p className="inline-error" role="alert">{loadError}</p>}
      {loading ? <div className="lobby-empty" role="status">正在寻找房间…</div> : !visible.length ? <div className="lobby-empty"><HeadphonesRounded /><h2>{filter ? '没有找到这个房间' : '还没有人开房间'}</h2><p>{filter ? '试试其他房间名或房主昵称。' : '创建一个房间，邀请朋友加入。'}</p></div> : <div className="room-grid">{visible.map(room => <article className="room-card" key={room.id}>
        <div className="room-card-heading"><span className="room-listening"><HeadphonesRounded fontSize="small" />{room.onlineCount} 人在线</span>{room.locked && <span className="room-lock"><LockOutlined fontSize="small" />密码房间</span>}</div>
        <h2>{room.name}</h2><p className="room-host">房主 · {room.host.username}</p>
        <div className="room-card-track"><SongCover src={room.currentSong?.prcUrl} /><div><strong>{room.currentSong?.name || '等待第一首歌'}</strong><span>{room.currentSong?.artist || '入房后可以点歌'}</span></div></div>
        {room.hostDisconnectedUntil && <p className="room-away">房主暂时离线，等待重连</p>}
        <button className="room-enter" disabled={busy || auth.loading} onClick={() => open({ kind: 'join', room })}>进入房间 <span>↗</span></button>
      </article>)}</div>}
    </section><footer className="lobby-footer">房间内共享队列与聊天 · 登录后加入 <Link href="/room?preview=1">查看听歌界面预览</Link></footer>
    {showAuth && <AuthModal onClose={() => { setShowAuth(false); if (!authCompleted.current) setAction(null); }} onLoginSuccess={(username, token) => { authCompleted.current = true; auth.login(username, token); setShowAuth(false); }} />}
    {showBinding && <NeteaseBinding onClose={() => setShowBinding(false)} />}
    {action && auth.user && !auth.loading && <StageDialog label={action.kind === 'create' ? '创建房间' : '加入房间'} onClose={() => { if (!busy) { setAction(null); setPassword(''); } }}><div className="auth-header"><h2>{action.kind === 'create' ? '创建房间' : action.room.name}</h2><button className="icon-button" disabled={busy} aria-label="关闭房间操作" onClick={() => { setAction(null); setPassword(''); }}><CloseRounded /></button></div>
      {active && (action.kind === 'create' || active.id !== action.room.id) ? <ActiveRoomChoice room={active} onLeft={() => { setActive(null); setError(''); if (action.kind === 'join' && !action.room.locked) void enter(action.room); }} /> : action.kind === 'create' ? <form className="auth-form" onSubmit={event => void create(event)}><label>房间名称<input required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="给房间起个名字" /></label><label>密码（可选）<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="留空则无需密码" /></label><p className="panel-description">你将成为房主，主动离开时房间结束。网易云账号可以稍后绑定。</p><button className="primary-button" disabled={busy}>{busy ? '正在创建…' : '创建并进入'}</button></form> : action.room.locked ? <form className="auth-form" onSubmit={event => { event.preventDefault(); void enter(action.room); }}><label>房间密码<input required type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? '正在加入…' : '进入房间'}</button></form> : <><p role="status">{busy ? '正在加入房间…' : '准备加入房间'}</p>{!busy && <button className="primary-button" onClick={() => void enter(action.room)}>进入房间</button>}</>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </StageDialog>}
  </main>;
}
