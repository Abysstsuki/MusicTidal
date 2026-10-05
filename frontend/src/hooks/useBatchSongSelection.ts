'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMusicContext } from '@/contexts/MusicContext';
import { useToast } from '@/contexts/ToastContext';
import { ApiError } from '@/lib/api';
import { providerName, songKey, type BatchQueueFailure, type Song } from '@/types/music';

export const MAX_BATCH_SONGS = 100;
type SelectedSong = { song: Song; page: number; index: number; failure?: BatchQueueFailure };
type Options = { songs: Song[]; page: number; contextKey: string; visible?: boolean; disabled?: boolean; preserveModeOnContextChange?: boolean };

export function useBatchSongSelection({ songs, page, contextKey, visible = true, disabled = false, preserveModeOnContextChange = false }: Options) {
  const { room, enqueueBatch } = useMusicContext();
  const { showToast } = useToast();
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(new Map<string, SelectedSong>());
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const selectionRef = useRef(selected);
  const pendingRef = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const update = (next: Map<string, SelectedSong>) => { selectionRef.current = next; setSelected(next); };
  const clearContext = useCallback(() => {
    ++generation.current;
    selectionRef.current = new Map(); setSelected(new Map()); setNotice('');
  }, []);
  const reset = useCallback(() => { clearContext(); setActive(false); }, [clearContext]);
  useEffect(() => { if (preserveModeOnContextChange) clearContext(); else reset(); }, [contextKey, preserveModeOnContextChange, clearContext, reset]);
  useEffect(() => { reset(); }, [visible, reset]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const available = (song: Song) => (room?.bindings?.[song.provider || 'netease'] ||
    ((song.provider || 'netease') === 'netease' ? room?.binding : undefined))?.status === 'bound';
  const unavailableReason = (song: Song) => available(song) ? '' : room?.kind === 'super' ? '超级房间' + providerName(song.provider) + '播放授权暂不可用' : '房主尚未有效绑定' + providerName(song.provider);
  const locked = pending || disabled;
  const items = [...selected.values()].sort((a, b) => a.page - b.page || a.index - b.index);
  const eligiblePage = songs.filter(available);
  const checkedCount = eligiblePage.filter(song => selected.has(songKey(song))).length;
  const allChecked = eligiblePage.length > 0 && checkedCount === eligiblePage.length;
  const clear = () => { if (!pendingRef.current && !disabled) { update(new Map()); setNotice(''); } };
  const cancel = () => { if (!pendingRef.current && !disabled) reset(); };
  const toggle = (song: Song, index: number) => {
    if (pendingRef.current || disabled) return;
    const next = new Map(selectionRef.current), key = songKey(song);
    if (next.has(key)) next.delete(key);
    else {
      if (!available(song)) return;
      if (next.size >= MAX_BATCH_SONGS) { showToast('每批最多选择 100 首歌曲', { tone: 'warning' }); return; }
      next.set(key, { song, page, index });
    }
    update(next); setNotice('');
  };
  const togglePage = () => {
    if (pendingRef.current || disabled || !eligiblePage.length) return;
    const next = new Map(selectionRef.current);
    if (eligiblePage.every(song => next.has(songKey(song)))) {
      for (const song of eligiblePage) next.delete(songKey(song));
    } else {
      const missing = eligiblePage.filter(song => !next.has(songKey(song)));
      if (next.size + missing.length > MAX_BATCH_SONGS) { showToast('当页全选将超过 100 首，请减少选择或先入队', { tone: 'warning' }); return; }
      songs.forEach((song, index) => { if (available(song) && !next.has(songKey(song))) next.set(songKey(song), { song, page, index }); });
    }
    update(next); setNotice('');
  };
  const submit = async (retryOnly = false) => {
    if (pendingRef.current || disabled) return;
    const attempted = [...selectionRef.current.values()].filter(item => !retryOnly || item.failure)
      .sort((a, b) => a.page - b.page || a.index - b.index);
    if (!attempted.length || !attempted.some(item => available(item.song))) return;
    pendingRef.current = true; setPending(true); setNotice('');
    const version = generation.current;
    try {
      const result = await enqueueBatch(attempted.map(({ song }) => ({ provider: song.provider || 'netease', id: song.id })));
      if (!mounted.current || version !== generation.current) return;
      const next = new Map(selectionRef.current);
      for (const song of result.added) next.delete(songKey(song));
      for (const failure of result.failed) {
        const item = next.get(songKey(failure));
        if (item) next.set(songKey(failure), { ...item, failure });
      }
      update(next);
      const message = `已加入 ${result.added.length} 首，失败 ${result.failed.length} 首`;
      setNotice(message);
      showToast(message, { tone: result.failed.length ? result.added.length ? 'warning' : 'error' : 'success' });
    } catch (error) {
      if (!mounted.current || version !== generation.current || (error as Error).name === 'AbortError') return;
      const message = error instanceof ApiError ? error.message : '未确认入队结果，请查看常规待播后再重试';
      setNotice(message); showToast(message, { tone: 'error' });
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return { active, start: () => { if (!locked) setActive(true); }, selected, items, pending, locked, notice,
    available, unavailableReason, allChecked, indeterminate: checkedCount > 0 && !allChecked,
    hasEligiblePage: eligiblePage.length > 0, clear, cancel, toggle, togglePage, submit,
    canSubmit: items.some(item => available(item.song)),
    canRetry: items.some(item => item.failure && available(item.song)) };
}
export type BatchSongSelection = ReturnType<typeof useBatchSongSelection>;
