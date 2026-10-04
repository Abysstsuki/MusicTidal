'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import LockOutlined from '@mui/icons-material/LockOutlined';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, ApiError } from '@/lib/api';
import type { RoomSummary } from '@/types/room';
import UserInfo from '@/components/userinfo';
import AuthModal from '@/components/authmodal';
import NeteaseBinding from '@/components/NeteaseBinding';
import ActiveRoomChoice from '@/components/ActiveRoomChoice';
import RoomCardTrack from '@/components/RoomCardTrack';
import RoomActionDialog, { type RoomAction } from '@/components/RoomActionDialog';

export default function Home() {
  const auth = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [action, setAction] = useState<RoomAction | null>(null);
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
  const open = (next: RoomAction) => {
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
    <header className="lobby-header"><Link className="wordmark" href="/">Music<span>Tidal</span></Link><span className="lobby-tagline">多人同步听歌</span><div className="lobby-account">{auth.user && <button className="pill-button" onClick={() => setShowBinding(true)}>网易云账号</button>}<UserInfo /></div></header>
    <section className="lobby-intro"><div><p className="eyebrow">ROOM LOBBY</p><h1>房间大厅</h1><p>选择房间加入，或创建新的房间。</p></div><button className="primary-button" disabled={auth.loading} onClick={() => open({ kind: 'create' })}><AddRounded fontSize="small" />创建房间</button></section>
    {notice && <p className="lobby-notice" role="status">{notice}</p>}
    {auth.error && <p className="inline-error" role="alert">{auth.error} <button className="pill-button" onClick={auth.retry}>重试登录状态</button></p>}
    {active && !action && <ActiveRoomChoice room={active} onLeft={() => { setActive(null); void refresh(); }} />}
    <section className="lobby-rooms" aria-label="房间列表"><div className="lobby-list-heading"><h2>房间 <span>{rooms.length}</span></h2><div><input aria-label="搜索房间" placeholder="搜索房间或房主" value={filter} onChange={event => setFilter(event.target.value)} /><button className="icon-button" aria-label="刷新房间列表" onClick={() => void refresh()}><RefreshRounded /></button></div></div>
      {loadError && <p className="inline-error" role="alert">{loadError}</p>}
      {loading ? <div className="lobby-empty" role="status">正在寻找房间…</div> : !visible.length ? <div className="lobby-empty"><HeadphonesRounded /><h2>{filter ? '没有找到这个房间' : '还没有人开房间'}</h2><p>{filter ? '试试其他房间名或房主昵称。' : '创建一个房间，邀请朋友加入。'}</p></div> : <div className="room-grid">{visible.map(room => <article className="room-card" key={room.id}>
        <div className="room-card-heading"><span className="room-listening"><HeadphonesRounded fontSize="small" />{room.onlineCount} 人在线</span>{room.locked && <span className="room-lock"><LockOutlined fontSize="small" />密码房间</span>}</div>
        <h2>{room.name}</h2><p className="room-host">房主 · {room.host.username}</p>
        <RoomCardTrack room={room} />
        {room.hostDisconnectedUntil && <p className="room-away">房主暂时离线，等待重连</p>}
        <button className="room-enter" disabled={busy || auth.loading} onClick={() => open({ kind: 'join', room })}>进入房间 <span>↗</span></button>
      </article>)}</div>}
    </section><footer className="lobby-footer">房间内共享队列与聊天 · 登录后加入</footer>
    {showAuth && <AuthModal onClose={() => { setShowAuth(false); if (!authCompleted.current) setAction(null); }} onLoginSuccess={(username, token) => { authCompleted.current = true; auth.login(username, token); setShowAuth(false); }} />}
    {showBinding && <NeteaseBinding onClose={() => setShowBinding(false)} />}
    {action && auth.user && !auth.loading && <RoomActionDialog action={action} active={active} name={name} password={password} busy={busy} error={error}
      onNameChange={setName} onPasswordChange={setPassword} onClose={() => { setAction(null); setPassword(''); }} onCreate={event => void create(event)}
      onJoin={() => { if (action.kind === 'join') void enter(action.room); }}
      onLeft={() => { setActive(null); setError(''); if (action.kind === 'join' && !action.room.locked) void enter(action.room); }} />}
  </main>;
}
