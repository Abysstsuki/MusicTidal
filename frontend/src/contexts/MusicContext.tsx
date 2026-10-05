'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { quietRhythm, type RhythmReader } from '@/lib/audio-rhythm';
import type { ChatMessage, PlaybackSnapshot, QueueSong, RecommendationState, Song, SongReference, BatchQueueResult } from '@/types/music';
import { providerName } from '@/types/music';
import type { RoomInfo, RoomState } from '@/types/room';
import { apiRequest, ApiError, BACKEND_URL } from '@/lib/api';
import { useAuth } from './AuthContext';
import { useToast, useToastMessage } from './ToastContext';
import { emptyPlaylists, type PlaylistState, type PlaybackMode } from '@/types/playlist';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'offline';
interface MusicContextType {
  audioRef: RefObject<HTMLAudioElement | null>; rhythmReader: RefObject<RhythmReader>;
  currentSong: Song | null; currentPosition: number; isPlaying: boolean; audioUrl: string; startTime: number;
  playbackRevision: number; connection: Connection; queue: QueueSong[]; recommendations: RecommendationState;
  messages: ChatMessage[]; onlineUsers: string[]; user: { id?: number; username: string } | null;
  room: RoomInfo | null; isHost: boolean; canControlPlayback: boolean;
  playlists: PlaylistState;
  setPlaybackMode: (mode: PlaybackMode) => Promise<void>;
  playlistAction: (path: string, body?: object, method?: string) => Promise<void>;
  setCurrentSong: (song: Song | null) => void; setCurrentPosition: (position: number) => void; setIsPlaying: (playing: boolean) => void;
  syncPlayback: () => Promise<void>; skipNext: () => Promise<void>; enqueue: (song: Song) => Promise<void>;
  enqueueBatch: (songs: SongReference[]) => Promise<BatchQueueResult>;
  moveToTop: (instanceId: number) => Promise<void>; removeFromQueue: (instanceId: number) => Promise<void>;
  startRecommendations: (provider?: import('@/types/music').MusicProvider) => Promise<void>; stopRecommendations: () => Promise<void>; sendChat: (text: string) => void;
  login: (username: string, token: string) => void; leaveRoom: () => Promise<void>;
  requestRoom: <T>(path: string, options?: RequestInit) => Promise<T>;
}
const MusicContext = createContext<MusicContextType | undefined>(undefined);
const idleRecommendations: RecommendationState = { available: true, disabledReason: null, enabled: false, loading: false, phase: null, queued: 0, error: null };
function normalizeAudioUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    // CDN audio can auto-upgrade in the player, but fetch downloads cannot.
    if (parsed.protocol === 'http:' && (parsed.hostname === 'music.126.net' || parsed.hostname.endsWith('.music.126.net'))) {
      parsed.protocol = 'https:';
      return parsed.href;
    }
  } catch { /* Preserve relative URLs and non-CDN sources. */ }
  return url;
}
export function useMusicContext() {
  const context = useContext(MusicContext);
  if (!context) throw new Error('useMusicContext must be used within a MusicProvider');
  return context;
}

export function MusicProvider({ children, initialState }: { children: ReactNode; initialState: RoomState }) {
  const auth = useAuth();
  const { showToast } = useToast();
  const roomId = initialState?.room.id || '';
  const user = auth.user;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rhythmReader = useRef<RhythmReader>(quietRhythm);
  const [room, setRoom] = useState<RoomInfo | null>(initialState?.room || null);
  const [currentSong, setCurrentSong] = useState<Song | null>(initialState.playback.song || null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState(normalizeAudioUrl(initialState?.playback.url || ''));
  const [startTime, setStartTime] = useState(initialState?.playback.startTime || 0);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [queue, setQueue] = useState<QueueSong[]>(initialState.queue || []);
  const [playlists, setPlaylists] = useState<PlaylistState>(initialState.playlists || emptyPlaylists);
  const [recommendations, setRecommendations] = useState<RecommendationState>(initialState?.recommendations || idleRecommendations);
  const [messages, setMessages] = useState<ChatMessage[]>(initialState.messages || []);
  const [onlineUsers, setOnlineUsers] = useState<string[]>(initialState.members.map(member => member.username) || []);
  useToastMessage(recommendations.error, { id: 'heart-error-' + roomId, tone: 'error' });
  const expiredProviders = (['netease','qqmusic'] as const).filter(provider => (room?.bindings?.[provider] || (provider === 'netease' ? room?.binding : undefined))?.status === 'expired');
  useToastMessage(expiredProviders.length ? (room?.kind === 'super' ? '公共播放' : '房主') + expiredProviders.map(providerName).join('、') + (room?.kind === 'super' ? '授权已过期，等待授权更新；对应待播歌曲暂时略过' : '授权已过期，请重新绑定；对应待播歌曲暂时略过') : '', { id: 'room-authorization-' + roomId, tone: 'warning', duration: 6000 });
  useToastMessage(connection === 'reconnecting' || connection === 'offline' ? '连接已断开，正在尝试重新连接' : '', { id: 'room-connection-' + roomId, tone: 'warning', duration: null });
  const previousConnection = useRef(connection);
  useEffect(() => {
    if (previousConnection.current === 'reconnecting' && connection === 'connected') showToast('连接已恢复', { tone: 'success' });
    previousConnection.current = connection;
  }, [connection, showToast]);
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
      if (error instanceof ApiError && (error.code === 'ROOM_CLOSED' || error.code === 'NOT_MEMBER')) exit(error.message);
      throw error;
    }
  }, [roomId, exit]);
  const applyPlayback = useCallback((snapshot: PlaybackSnapshot) => {
    setCurrentSong(snapshot.song); setAudioUrl(normalizeAudioUrl(snapshot.url || '')); setStartTime(snapshot.startTime || 0);
    setCurrentPosition(snapshot.song ? Math.max(0, Math.min(Date.now() - snapshot.startTime, snapshot.song.duration)) : 0);
    if (!snapshot.song) setIsPlaying(false);
    serverPlaybackRevision.current = snapshot.playbackRevision || 0;
    setPlaybackRevision(value => value + 1);
  }, []);
  const applyState = useCallback((state: RoomState) => {
    if (closed.current || lifetime.current.signal.aborted || state.room.id !== roomId || state.revision < revision.current) return;
    revision.current = state.revision;
    setRoom(state.room); applyPlayback(state.playback); setQueue(state.queue); setRecommendations(state.recommendations);
    setPlaylists(state.playlists || emptyPlaylists);
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
            else showToast(data.payload?.error || '操作失败', { tone: 'error' });
            return;
          }
          if (data.roomId !== roomId) return;
          if (data.type === 'ROOM_CLOSED') { exit(data.payload.reason); return; }
          if (data.revision < revision.current) return;
          if (data.type === 'ROOM_SNAPSHOT') { applyState(data.payload); retry = 0; setConnection('connected'); return; }
          revision.current = data.revision;
          if (data.type === 'PLAY_SONG') applyPlayback(data.payload);
          else if (data.type === 'QUEUE_UPDATED') setQueue(data.payload);
          else if (data.type === 'RECOMMENDATIONS_UPDATED') setRecommendations(data.payload);
          else if (data.type === 'PLAYBACK_NOTICE') showToast(data.payload.message, { tone: 'warning' });
          else if (data.type === 'PLAYLIST_STATE_UPDATED') setPlaylists(data.payload);
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
  }, [auth.token, roomId, exit, applyState, applyPlayback, showToast]);
  const mutateQueue = async (action: string, body: object = {}) => {
    await requestRoom('/queue/' + action, { method: 'POST', body: JSON.stringify(body) }); await syncPlayback();
  };
  const enqueue = async (song: Song) => {
    await mutateQueue('add', { song });
  };
  const enqueueBatch = async (songs: SongReference[]) => {
    const result = await requestRoom<BatchQueueResult>('/queue/add-batch', { method: 'POST', body: JSON.stringify({ songs }) });
    // The mutation result is authoritative even if a later snapshot request fails.
    // WebSocket events already synchronize the queue; never turn an accepted batch into a retry.
    void syncPlayback().catch(() => {});
    return result;
  };
  const playlistAction = async (path: string, body: object = {}, method = 'POST') => {
    await requestRoom('/playlists' + path, { method, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
    await syncPlayback();
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
  const setRecommendationMode = async (enabled: boolean, provider: import('@/types/music').MusicProvider = 'netease') => {
    await mutateQueue('recommendations/' + (enabled ? 'start' : 'stop'), { provider });
  };
  const sendChat = (text: string) => {
    if (!user) throw new Error('请先登录');
    if (connection !== 'connected' || socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('正在重新连接，请稍后发送');
    socketRef.current.send(JSON.stringify({ type: 'chat', roomId, text }));
  };
  const leaveRoom = async () => {
    if (closed.current) return;
    try {
      await requestRoom('/leave', { method: 'POST' });
    } catch (error) {
      // The WebSocket departure event can arrive before the HTTP response and
      // exit() cancels that response. The room has already been left in this case.
      if (closed.current) return;
      throw error;
    }
    exit('已离开房间');
  };
  return <MusicContext.Provider value={{ audioRef, rhythmReader, currentSong, currentPosition, isPlaying, audioUrl, startTime, playbackRevision,
    connection, queue, recommendations, playlists, messages, onlineUsers, user, room, isHost: Boolean(room?.host && room.host.id === auth.user?.id),
    canControlPlayback: room?.kind === 'super' || Boolean(room?.host && room.host.id === auth.user?.id),
    playlistAction, setPlaybackMode: mode => mutateQueue('mode', { mode }),
    setCurrentSong, setCurrentPosition, setIsPlaying, syncPlayback, skipNext, enqueue, enqueueBatch, moveToTop, removeFromQueue,
    startRecommendations: provider => setRecommendationMode(true, provider), stopRecommendations: () => setRecommendationMode(false), sendChat, login: auth.login, leaveRoom, requestRoom }}>{children}</MusicContext.Provider>;
}
