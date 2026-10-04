'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import StageToast from '@/components/StageToast';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export type ToastOptions = { id?: string; tone?: ToastTone; duration?: number | null; detail?: string; countdownUntil?: number };
export type ToastItem = ToastOptions & { id: string; message: string; tone: ToastTone; duration: number | null; expiresAt: number | null; version: number };
type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => string;
  dismissToast: (id: string, version?: number) => void;
  registerHost: (element: HTMLElement) => () => void;
};
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider is required');
  return context;
}

// State-driven notices announce changes once; persistent notices follow component lifetime.
export function useToastMessage(message: string | null | undefined, options: ToastOptions = {}) {
  const generatedId = useId();
  const { showToast, dismissToast } = useToast();
  const { id = generatedId, tone = 'info', duration, detail, countdownUntil } = options;
  useEffect(() => {
    if (!message) { dismissToast(id); return; }
    showToast(message, { id, tone, duration, detail, countdownUntil });
    return () => { if (duration === null) dismissToast(id); };
  }, [message, id, tone, duration, detail, countdownUntil, showToast, dismissToast]);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const sequence = useRef(0);
  const dismissToast = useCallback((id: string, version?: number) => {
    const matches = (item: ToastItem) => item.id === id && (version === undefined || item.version === version);
    setItems(current => current.some(matches) ? current.filter(item => !matches(item)) : current);
  }, []);
  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    const version = ++sequence.current;
    const id = options.id || 'toast-' + version;
    const tone = options.tone || 'info';
    const duration = options.duration === undefined ? (tone === 'error' ? 5000 : 3000) : options.duration;
    const item: ToastItem = { ...options, id, message, tone, version, duration, expiresAt: duration === null ? null : Date.now() + duration };
    setItems(current => {
      const index = current.findIndex(existing => existing.id === id);
      const next = index < 0 ? [...current, item] : current.map((existing, position) => position === index ? item : existing);
      const transient = next.filter(existing => existing.duration !== null).slice(-3);
      return next.filter(existing => existing.duration === null || transient.includes(existing));
    });
    return id;
  }, []);
  const registerHost = useCallback((element: HTMLElement) => {
    setHosts(current => [...current.filter(host => host !== element), element]);
    return () => setHosts(current => current.filter(host => host !== element));
  }, []);
  const value = useMemo(() => ({ showToast, dismissToast, registerHost }), [showToast, dismissToast, registerHost]);
  const viewport = <div className="stage-toast-viewport" aria-label="消息提示">
    {[...items].sort((a, b) => Number(b.duration === null) - Number(a.duration === null)).map(item =>
      <StageToast key={item.id} toast={item} onDismiss={dismissToast} />)}
  </div>;
  const host = hosts[hosts.length - 1];
  return <ToastContext.Provider value={value}>
    {children}{host ? createPortal(viewport, host) : viewport}
  </ToastContext.Provider>;
}
