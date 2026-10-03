'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { quietRhythm, type RhythmReader } from '@/lib/audio-rhythm';
import type { ChatMessage, PlaybackSnapshot, QueueSong, RecommendationState, Song } from '@/types/music';
import type { RoomInfo, RoomState } from '@/types/room';
import { apiRequest, ApiError, BACKEND_URL } from '@/lib/api';
import { useAuth } from './AuthContext';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'offline';
interface MusicContextType {
  audioRef: RefObject<HTMLAudioElement | null>; rhythmReader: RefObject<RhythmReader>;
  currentSong: Song | null; currentPosition: number; isPlaying: boolean; audioUrl: string; startTime: number;
  playbackRevision: number; connection: Connection; queue: QueueSong[]; recommendations: RecommendationState;
  messages: ChatMessage[]; onlineUsers: string[]; user: { id?: number; username: string } | null;
  room: RoomInfo | null; isHost: boolean; notice: string;
  setCurrentSong: (song: Song | null) => void; setCurrentPosition: (position: number) => void; setIsPlaying: (playing: boolean) => void;
  syncPlayback: () => Promise<void>; skipNext: () => Promise<void>; enqueue: (song: Song) => Promise<void>;
  moveToTop: (instanceId: number) => Promise<void>; removeFromQueue: (instanceId: number) => Promise<void>;
  startRecommendations: () => Promise<void>; stopRecommendations: () => Promise<void>; sendChat: (text: string) => void;
  login: (username: string, token: string) => void; leaveRoom: () => Promise<void>;
  requestRoom: <T>(path: string, options?: RequestInit) => Promise<T>;
}
const MusicContext = createContext<MusicContextType | undefined>(undefined);
const idleRecommendations: RecommendationState = { enabled: false, loading: false, phase: null, queued: 0, error: null };
export function useMusicContext() {
  const context = useContext(MusicContext);
  if (!context) throw new Error('useMusicContext must be used within a MusicProvider');
  return context;
}

export function MusicProvider({ children, initialState }: { children: ReactNode; initialState: RoomState }) {
  const auth = useAuth();
  const roomId = initialState?.room.id || '';
  const user = auth.user;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rhythmReader = useRef<RhythmReader>(quietRhythm);
  const [room, setRoom] = useState<RoomInfo | null>(initialState?.room || null);
  const [currentSong, setCurrentSong] = useState<Song | null>(initialState.playback.song || null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState(initialState?.playback.url || '');
  const [startTime, setStartTime] = useState(initialState?.playback.startTime || 0);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [queue, setQueue] = useState<QueueSong[]>(initialState.queue || []);
  const [recommendations, setRecommendations] = useState<RecommendationState>(initialState?.recommendations || idleRecommendations);
  const [messages, setMessages] = useState<ChatMessage[]>(initialState.messages || []);
  const [onlineUsers, setOnlineUsers] = useState<string[]>(initialState.members.map(member => member.username) || []);
  const [notice, setNotice] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const revision = useRef(initialState?.revision || 0);
  const serverPlaybackRevision = useRef(initialState?.playback.playbackRevision || 0);
  const lifetime = useRef(new AbortController());
  const closed = useRef(false);

  const exit = useCallback((reason: string) => {
    if (closed.current) return;
    closed.current = true; lifetime.current.abort(); socketRef.current?.close();
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    sessionStorage.setItem('room-notice', reason);
    window.location.assign('/');
  }, []);
  const requestRoom = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const signal = options?.signal ? AbortSignal.any([lifetime.current.signal, options.signal]) : lifetime.current.signal;
    try { return await apiRequest<T>('/api/rooms/' + encodeURIComponent(roomId) + path, { ...options, signal }); }
    catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_MEMBER')) exit(error.message);
      throw error;
    }
  }, [roomId, exit]);
  const applyPlayback = useCallback((snapshot: PlaybackSnapshot) => {
    setCurrentSong(snapshot.song); setAudioUrl(snapshot.url || ''); setStartTime(snapshot.startTime || 0);
    setCurrentPosition(snapshot.song ? Math.max(0, Math.min(Date.now() - snapshot.startTime, snapshot.song.duration)) : 0);
    if (!snapshot.song) setIsPlaying(false);
    serverPlaybackRevision.current = snapshot.playbackRevision || 0;
    setPlaybackRevision(value => value + 1);
  }, []);
  const applyState = useCallback((state: RoomState) => {
    if (closed.current || lifetime.current.signal.aborted || state.room.id !== roomId || state.revision < revision.current) return;
    revision.current = state.revision;
    setRoom(state.room); applyPlayback(state.playback); setQueue(state.queue); setRecommendations(state.recommendations);
    setMessages(state.messages); setOnlineUsers(state.members.map(member => member.username));
  }, [roomId, applyPlayback]);
  const syncPlayback = useCallback(async () => {
    applyState(await requestRoom<RoomState>('/state'));
  }, [applyState, requestRoom]);
  useLayoutEffect(() => {
    lifetime.current = new AbortController(); closed.current = false;
    const audio = audioRef.current;
    return () => {
      closed.current = true; lifetime.current.abort();
      if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    };
  }, []);
  useEffect(() => {
    if (!roomId || !auth.token) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (BACKEND_URL ? BACKEND_URL.replace(/^http/, 'ws') : '');
    if (!wsUrl) { setConnection('offline'); return; }
    let cancelled = false; let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined; let socket: WebSocket | null = null;
    const connect = () => {
      if (cancelled || closed.current) return;
      setConnection(retry ? 'reconnecting' : 'connecting');
      socket = new WebSocket(wsUrl); socketRef.current = socket;
      socket.onopen = () => { if (!cancelled) socket?.send(JSON.stringify({ type: 'AUTH', token: auth.token, roomId })); };
      socket.onmessage = event => {
        if (cancelled || closed.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ERROR') {
            if (data.payload?.code === 'AUTH_EXPIRED') { window.dispatchEvent(new Event('auth-expired')); exit(data.payload.error); }
            else if (data.payload?.code === 'ROOM_CLOSED' || data.payload?.code === 'NOT_MEMBER') exit(data.payload.error);
            else setNotice(data.payload?.error || '操作失败');
            return;
          }
          if (data.roomId !== roomId) return;
          if (data.type === 'ROOM_CLOSED') { exit(data.payload.reason); return; }
          if (data.revision < revision.current) return;
          if (data.type === 'ROOM_SNAPSHOT') { applyState(data.payload); retry = 0; setConnection('connected'); setNotice(''); return; }
          revision.current = data.revision;
          if (data.type === 'PLAY_SONG') applyPlayback(data.payload);
          else if (data.type === 'QUEUE_UPDATED') setQueue(data.payload);
          else if (data.type === 'RECOMMENDATIONS_UPDATED') setRecommendations(data.payload);
          else if (data.type === 'ROOM_UPDATED') setRoom(data.payload);
          else if (data.type === 'update') setOnlineUsers(data.payload.map((member: { username: string }) => member.username));
          else if (data.type === 'chat') setMessages(items => [...items, data.payload].slice(-25));
        } catch { /* Ignore malformed frames. */ }
      };
      socket.onclose = event => {
        if (cancelled || closed.current) return;
        if (event.code === 4000 || event.code === 4001) { exit(event.code === 4001 ? '请重新登录并加入房间' : '你已退出房间'); return; }
        setConnection('reconnecting');
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 30000));
      };
      socket.onerror = () => {};
    };
    connect();
    return () => { cancelled = true; clearTimeout(timer); socketRef.current = null; socket?.close(); };
  }, [auth.token, roomId, exit, applyState, applyPlayback]);
  const mutateQueue = async (action: string, body: object = {}) => {
    await requestRoom('/queue/' + action, { method: 'POST', body: JSON.stringify(body) }); await syncPlayback();
  };
  const enqueue = async (song: Song) => {
    await mutateQueue('add', { song });
  };
  const moveToTop = async (instanceId: number) => {
    await mutateQueue('moveTop', { instanceId });
  };
  const removeFromQueue = async (instanceId: number) => {
    await mutateQueue('remove', { instanceId });
  };
  const skipNext = async () => {
    await mutateQueue('skipNext', { playbackRevision: serverPlaybackRevision.current });
  };
  const setRecommendationMode = async (enabled: boolean) => {
    await mutateQueue('recommendations/' + (enabled ? 'start' : 'stop'));
  };
  const sendChat = (text: string) => {
    if (!user) throw new Error('请先登录');
    if (connection !== 'connected' || socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('正在重新连接，请稍后发送');
    socketRef.current.send(JSON.stringify({ type: 'chat', roomId, text }));
  };
  const leaveRoom = async () => {
    await requestRoom('/leave', { method: 'POST' }); exit('已离开房间');
  };
  return <MusicContext.Provider value={{ audioRef, rhythmReader, currentSong, currentPosition, isPlaying, audioUrl, startTime, playbackRevision,
    connection, queue, recommendations, messages, onlineUsers, user, room, isHost: room?.host.id === auth.user?.id, notice,
    setCurrentSong, setCurrentPosition, setIsPlaying, syncPlayback, skipNext, enqueue, moveToTop, removeFromQueue,
    startRecommendations: () => setRecommendationMode(true), stopRecommendations: () => setRecommendationMode(false), sendChat, login: auth.login, leaveRoom, requestRoom }}>{children}</MusicContext.Provider>;
}
