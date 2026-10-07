'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiRequest, ApiError } from '@/lib/api';
import { clearRoomEntry } from '@/lib/room-entry';
import { useToast, useToastMessage } from './ToastContext';

export type AuthUser = { id: number; username: string; email?: string };
type User = AuthUser;
type Auth = { user: User | null; token: string; loading: boolean; error: string;
  login: (username: string, token: string, profile?: User) => void; logout: () => Promise<void>; retry: () => void };
const AuthContext = createContext<Auth | null>(null);
export function useAuth() { const auth = useContext(AuthContext); if (!auth) throw new Error('AuthProvider is required'); return auth; }

function storedProfile(access: string): User | null {
  try {
    // Restore display only; all protected requests still verify the token on the backend.
    const segment = access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(segment));
    const saved = JSON.parse(localStorage.getItem('user') || 'null');
    return payload.exp * 1000 > Date.now() && saved?.id === payload.userId && Number.isSafeInteger(saved.id) && typeof saved.username === 'string'
      ? { id: saved.id, username: saved.username, ...(typeof saved.email === 'string' ? { email: saved.email } : {}) } : null;
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useToastMessage(error, { id: 'auth-state-error', tone: 'error' });
  const [attempt, setAttempt] = useState(0);
  const confirmedToken = useRef('');
  const clear = useCallback(() => {
    confirmedToken.current = ''; clearRoomEntry();
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setToken(''); setUser(null); setError(''); setLoading(false);
  }, []);
  useEffect(() => {
    const restore = () => {
      const access = localStorage.getItem('token') || '';
      const profile = storedProfile(access);
      setUser(profile); setLoading(Boolean(access && !profile)); setToken(access);
    };
    restore();
    const storage = (event: StorageEvent) => { if (event.key === 'token' || event.key === null) { confirmedToken.current = ''; clearRoomEntry(); restore(); } };
    const expired = () => {
      if (localStorage.getItem('token')) showToast('登录已过期，请重新登录', { id: 'auth-expired', tone: 'warning', duration: 5000 });
      clear();
    };
    window.addEventListener('storage', storage); window.addEventListener('auth-expired', expired);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('auth-expired', expired); };
  }, [clear, showToast]);
  useEffect(() => {
    if (token === null) return;
    if (!token) { setUser(null); setLoading(false); return; }
    if (confirmedToken.current === token) { setLoading(false); return; }
    const controller = new AbortController();
    setError('');
    apiRequest<User>('/api/user/me', { signal: controller.signal })
      .then(profile => {
        if (!controller.signal.aborted && localStorage.getItem('token') === token) {
          localStorage.setItem('user', JSON.stringify(profile));
          confirmedToken.current = token;
          setUser(previous => previous?.id === profile.id && previous.username === profile.username && previous.email === profile.email ? previous : profile);
        }
      })
      .catch(problem => {
        if (controller.signal.aborted || localStorage.getItem('token') !== token) return;
        if (problem instanceof ApiError && (problem.status === 401 || problem.status === 404)) clear();
        else setError('登录状态暂时无法确认，请重试');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, attempt, clear]);
  const login = (username: string, access: string, profile?: User) => {
    clearRoomEntry(); confirmedToken.current = profile ? access : '';
    localStorage.setItem('user', JSON.stringify(profile || { username })); localStorage.setItem('token', access);
    setUser(profile || null); setError(''); setLoading(!profile); setToken(access); setAttempt(value => value + 1);
  };
  const logout = async () => {
    try {
      await apiRequest('/api/user/logout', { method: 'POST', signal: AbortSignal.timeout(10000) });
    } catch { /* Offline connections are removed by the server's grace deadline. */ }
    finally { clear(); }
  };
  return <AuthContext.Provider value={{ user, token: token || '', loading, error, login, logout, retry: () => { confirmedToken.current = ''; setAttempt(value => value + 1); } }}>{children}</AuthContext.Provider>;
}
