'use client';

import Link from 'next/link';
import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToastMessage } from '@/contexts/ToastContext';
import { MusicProvider } from '@/contexts/MusicContext';
import { apiRequest, ApiError } from '@/lib/api';
import type { RoomState, RoomSummary } from '@/types/room';
import AuthModal from '@/components/authmodal';
import ActiveRoomChoice from '@/components/ActiveRoomChoice';
import ListeningStage from '@/components/ListeningStage';
import { preparedRoomEntry } from '@/lib/room-entry';

export default function RoomPage() {
  return <Suspense fallback={<main className="room-entry"><p role="status">正在加载房间…</p></main>}><RoomEntry /></Suspense>;
}

function RoomEntry() {
  const router = useRouter();
  const query = useSearchParams();
  const roomId = query.get('roomId') || '';
  const auth = useAuth();
  const params = useMemo(() => ({ id: roomId }), [roomId]);
  const [state, setState] = useState<RoomState | null>(null);
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [active, setActive] = useState<RoomSummary | null>(null);
  const [error, setError] = useState('');
  useToastMessage(error, { tone: 'error' });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loginCompleted = useRef(false);
  const invitation = useRef<string | null>(null);
  const stateOwner = useRef<number | null>(null);
  useEffect(() => {
    stateOwner.current = null; setState(null); setActive(null); setNeedPassword(false);
    invitation.current = new URLSearchParams(window.location.hash.slice(1)).get('inviteToken');
  }, [roomId]);
  useEffect(() => {
    if (!params?.id || !auth.user) return;
    const prepared = preparedRoomEntry(params.id, auth.token);
    if (prepared) { stateOwner.current = auth.user.id; setState(prepared); return; }
    const controller = new AbortController();
    setBusy(true); setError('');
    const enter = async () => {
      try {
        const data = await apiRequest<{ state?: RoomState }>('/api/rooms/' + encodeURIComponent(params.id) + '/join', { method: 'POST', body: JSON.stringify({ password, inviteToken: invitation.current || undefined }), signal: controller.signal });
        const snapshot = data.state || await apiRequest<RoomState>('/api/rooms/' + encodeURIComponent(params.id) + '/state', { signal: controller.signal });
        if (!controller.signal.aborted) {
          invitation.current = null;
          const fragment = new URLSearchParams(window.location.hash.slice(1));
          fragment.delete('inviteToken');
          const hash = fragment.toString();
          window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + (hash ? '#' + hash : ''));
          stateOwner.current = auth.user!.id; setState(snapshot); setNeedPassword(false); setPassword('');
        }
      } catch (problem) {
        if (controller.signal.aborted) return;
        if (problem instanceof ApiError && problem.code === 'ACTIVE_ROOM') {
          const current = await apiRequest<{ room: RoomSummary | null }>('/api/user/active-room', { signal: controller.signal });
          if (!controller.signal.aborted) setActive(current.room);
        } else if (problem instanceof ApiError && problem.code === 'ROOM_INVITE') { invitation.current = null; setNeedPassword(true); setError(problem.message); }
        else if (problem instanceof ApiError && problem.code === 'ROOM_PASSWORD') { setNeedPassword(true); if (password) setError('房间密码不正确'); }
        else setError((problem as Error).message);
      } finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void enter().catch(problem => { if (!controller.signal.aborted) { setError(problem.message); setBusy(false); } });
    return () => controller.abort();
    // Password is captured only when the user submits, never while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, auth.user?.id, auth.token, attempt]);
  if (params && !params.id) notFound();
  if (state && state.room.id === roomId && auth.user && stateOwner.current === auth.user.id) return <MusicProvider key={state.room.id + ':' + auth.user.id} initialState={state}><ListeningStage /></MusicProvider>;
  const submit = (event: FormEvent) => { event.preventDefault(); setAttempt(value => value + 1); };
  return <main className="room-entry"><Link className="wordmark" href="/">Music<span>Tidal</span></Link><section className="entry-card">
    <p className="eyebrow">JOIN A ROOM</p><h1>加入一起听</h1>
    {!params || auth.loading ? <p role="status">正在确认登录与房间状态…</p> : !params.id ? <p>邀请链接没有房间 ID，请从大厅选择房间。</p> : auth.error ? <button className="pill-button" onClick={auth.retry}>重试登录状态</button> : !auth.user ? <><p>登录 MusicTidal 后即可加入房间。</p><AuthModal onClose={() => { if (!loginCompleted.current) router.replace('/'); }} onLoginSuccess={(username, token, profile) => { loginCompleted.current = true; auth.login(username, token, profile); }} /></> : active ? <ActiveRoomChoice room={active} onLeft={() => { setActive(null); setAttempt(value => value + 1); }} /> : needPassword ? <form className="auth-form" onSubmit={submit}><label>房间密码<input required type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? '正在加入…' : '进入房间'}</button></form> : busy ? <p role="status">正在加入房间…</p> : error ? <button className="pill-button" onClick={() => setAttempt(value => value + 1)}>重试</button> : null}
    <Link className="entry-back" href="/">返回大厅</Link>
  </section></main>;
}
