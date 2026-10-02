'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatMessage, PlaybackSnapshot, QueueSong, Song } from '@/types/music';
import { apiRequest, BACKEND_URL } from '@/lib/api';
import { previewMessages, previewQueue, previewSong, previewUsers } from '@/lib/stage-preview';

type Connection = 'connecting' | 'connected' | 'reconnecting' | 'offline';
type User = { username: string };
interface MusicContextType {
  currentSong: Song | null;
  currentPosition: number;
  isPlaying: boolean;
  audioUrl: string;
  startTime: number;
  playbackRevision: number;
  connection: Connection;
  queue: QueueSong[];
  messages: ChatMessage[];
  onlineUsers: string[];
  user: User | null;
  isPreview: boolean;
  setCurrentSong: (song: Song | null) => void;
  setCurrentPosition: (position: number) => void;
  setIsPlaying: (playing: boolean) => void;
  syncPlayback: () => Promise<void>;
  skipNext: () => Promise<void>;
  enqueue: (song: Song) => Promise<void>;
  moveToTop: (instanceId: number) => Promise<void>;
  removeFromQueue: (instanceId: number) => Promise<void>;
  sendChat: (text: string) => void;
  login: (username: string, token: string) => void;
  logout: () => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);
export function useMusicContext() {
  const context = useContext(MusicContext);
  if (!context) throw new Error('useMusicContext must be used within a MusicProvider');
  return context;
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [startTime, setStartTime] = useState(0);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [queue, setQueue] = useState<QueueSong[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [preview, setPreview] = useState<boolean | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotVersion = useRef(0);
  const queueVersion = useRef(0);

  const applySnapshot = useCallback((snapshot: PlaybackSnapshot) => {
    snapshotVersion.current += 1;
    setCurrentSong(snapshot.song);
    setAudioUrl(snapshot.url || '');
    setStartTime(snapshot.startTime || 0);
    setCurrentPosition(snapshot.song ? Math.max(0, Math.min(Date.now() - snapshot.startTime, snapshot.song.duration)) : 0);
    if (!snapshot.song) setIsPlaying(false);
    setPlaybackRevision(value => value + 1);
  }, []);

  useEffect(() => {
    const enabled = new URLSearchParams(window.location.search).get('preview') === '1';
    setPreview(enabled);
    if (enabled) {
      setCurrentSong(previewSong); setCurrentPosition(110000);
      setQueue(previewQueue); setMessages(previewMessages);
      setOnlineUsers(previewUsers); setUser({ username: 'Abyss' });
      setConnection('offline');
    }
  }, []);

  useEffect(() => {
    if (preview !== false || !BACKEND_URL) return;
    const controller = new AbortController();
    const token = localStorage.getItem('token');
    if (token) {
      apiRequest<User>('/api/user/me', { headers: { Authorization: 'Bearer ' + token }, signal: controller.signal })
        .then(profile => {
          if (!controller.signal.aborted && profile.username) {
            setUser({ username: profile.username });
            localStorage.setItem('user', JSON.stringify({ username: profile.username }));
          }
        }).catch(() => { /* A network failure must not destroy a valid saved session. */ });
    }
    return () => controller.abort();
  }, [preview]);

  const refreshQueue = useCallback(async () => {
    const version = queueVersion.current;
    const data = await apiRequest<{ queue: QueueSong[] }>('/api/queue/list');
    if (version === queueVersion.current) setQueue(Array.isArray(data.queue) ? data.queue : []);
  }, []);
  const syncPlayback = useCallback(async () => {
    if (preview) return;
    const version = snapshotVersion.current;
    const data = await apiRequest<{ success: boolean; currentSong: PlaybackSnapshot | null }>('/api/queue/currentPlaying');
    // A late REST response cannot overwrite a newer WebSocket song.
    if (data.success && version === snapshotVersion.current) {
      applySnapshot(data.currentSong || { song: null, url: '', startTime: 0 });
    }
  }, [applySnapshot, preview]);

  // One session and one socket serve the whole stage, including closed popovers.
  useEffect(() => {
    if (preview !== false) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (BACKEND_URL ? BACKEND_URL.replace(/^http/, 'ws') : '');
    if (!wsUrl) { setConnection('offline'); return; }
    let cancelled = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (cancelled) return;
      setConnection(retry ? 'reconnecting' : 'connecting');
      socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        if (cancelled) return;
        retry = 0; setConnection('connected');
        if (user?.username) socket?.send(JSON.stringify({ type: 'join', username: user.username }));
        void syncPlayback().catch(() => {});
        void refreshQueue().catch(() => {});
      };
      socket.onmessage = event => {
        if (cancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'PLAY_SONG' && data.payload) {
            applySnapshot({ song: data.payload.song || null, url: data.payload.url || data.payload.song?.url || '', startTime: data.payload.startTime || 0 });
          } else if (data.type === 'QUEUE_UPDATED' && Array.isArray(data.payload)) {
            queueVersion.current += 1; setQueue(data.payload);
          } else if (data.type === 'update' && Array.isArray(data.users)) {
            setOnlineUsers(data.users.filter((name: unknown) => typeof name === 'string'));
          } else if (data.type === 'history' && Array.isArray(data.messages)) {
            setMessages(data.messages.filter((message: ChatMessage) => typeof message.username === 'string' && typeof message.text === 'string').slice(-100));
          } else if (data.type === 'chat' && typeof data.username === 'string' && typeof data.text === 'string') {
            setMessages(items => [...items, { username: data.username, text: data.text }].slice(-100));
          }
        } catch { /* Ignore malformed messages without disconnecting the stage. */ }
      };
      socket.onclose = () => {
        if (cancelled) return;
        setConnection('reconnecting'); setOnlineUsers([]);
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 30000));
      };
      socket.onerror = () => { /* onclose owns reconnect scheduling. */ };
    };
    connect();
    return () => {
      cancelled = true; clearTimeout(timer);
      socketRef.current = null; socket?.close();
    };
  }, [applySnapshot, preview, refreshQueue, syncPlayback, user?.username]);

  const mutateQueue = async (action: string, body: object) => {
    await apiRequest('/api/queue/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await refreshQueue();
  };
  const enqueue = async (song: Song) => {
    if (preview) {
      setQueue(items => [...items, { ...song, instanceId: Math.max(0, ...items.map(item => item.instanceId)) + 1 }]); return;
    }
    await mutateQueue('add', { song });
  };
  const moveToTop = async (instanceId: number) => {
    if (preview) { setQueue(items => [...items.filter(item => item.instanceId === instanceId), ...items.filter(item => item.instanceId !== instanceId)]); return; }
    await mutateQueue('moveTop', { instanceId });
  };
  const removeFromQueue = async (instanceId: number) => {
    if (preview) { setQueue(items => items.filter(item => item.instanceId !== instanceId)); return; }
    await mutateQueue('remove', { instanceId });
  };
  const skipNext = async () => {
    if (preview) {
      setCurrentSong(queue[0] || null); setQueue(items => items.slice(1));
      setCurrentPosition(0); setIsPlaying(false); return;
    }
    await apiRequest('/api/queue/skipNext', { method: 'POST' });
  };
  const sendChat = (text: string) => {
    if (!user) throw new Error('登录后就能和大家聊天');
    if (preview) { setMessages(items => [...items, { username: user.username, text }].slice(-100)); return; }
    if (socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('正在重新连接，请稍后发送');
    socketRef.current.send(JSON.stringify({ type: 'chat', username: user.username, text }));
  };
  const login = (username: string, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ username }));
    setMessages([]); setUser({ username });
  };
  const logout = () => {
    if (preview) return;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setUser(null); setMessages([]); setOnlineUsers([]);
  };

  return <MusicContext.Provider value={{ currentSong, currentPosition, isPlaying, audioUrl, startTime, playbackRevision, connection, queue, messages, onlineUsers, user, isPreview: !!preview, setCurrentSong, setCurrentPosition, setIsPlaying, syncPlayback, skipNext, enqueue, moveToTop, removeFromQueue, sendChat, login, logout }}>{children}</MusicContext.Provider>;
}
