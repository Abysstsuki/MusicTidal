'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest, ApiError } from '@/lib/api';
import { useToast, useToastMessage } from './ToastContext';

type User = { id: number; username: string; email?: string };
type Auth = { user: User | null; token: string; loading: boolean; error: string;
  login: (username: string, token: string) => void; logout: () => Promise<void>; retry: () => void };
const AuthContext = createContext<Auth | null>(null);
export function useAuth() { const auth = useContext(AuthContext); if (!auth) throw new Error('AuthProvider is required'); return auth; }

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useToastMessage(error, { id: 'auth-state-error', tone: 'error' });
  const [attempt, setAttempt] = useState(0);
  const clear = useCallback(() => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setToken(''); setUser(null); setError(''); setLoading(false);
  }, []);
  useEffect(() => {
    setToken(localStorage.getItem('token') || '');
    const storage = (event: StorageEvent) => { if (event.key === 'token') { setUser(null); setToken(localStorage.getItem('token') || ''); } };
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
    const controller = new AbortController();
    setLoading(true); setError('');
    apiRequest<User>('/api/user/me', { signal: controller.signal })
      .then(profile => { if (!controller.signal.aborted && localStorage.getItem('token') === token) setUser(profile); })
      .catch(problem => {
        if (controller.signal.aborted) return;
        if (problem instanceof ApiError && problem.status === 401) clear();
        else setError('登录状态暂时无法确认，请重试');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, attempt, clear]);
  const login = (username: string, access: string) => {
    localStorage.setItem('token', access); localStorage.setItem('user', JSON.stringify({ username }));
    setUser(null); setLoading(true); setToken(access); setAttempt(value => value + 1);
  };
  const logout = async () => {
    try {
      await apiRequest('/api/user/logout', { method: 'POST', signal: AbortSignal.timeout(10000) });
    } catch { /* Offline connections are removed by the server's grace deadline. */ }
    finally { clear(); }
  };
  return <AuthContext.Provider value={{ user, token: token || '', loading, error, login, logout, retry: () => setAttempt(value => value + 1) }}>{children}</AuthContext.Provider>;
}
