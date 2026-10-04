'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import SearchRounded from '@mui/icons-material/SearchRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import { useToast, useToastMessage } from '@/contexts/ToastContext';
import { songKey, providerName, type Song, type MusicProvider } from '@/types/music';
import SongBadges from './SongBadges';
import SongCover from './modelItem/SongCover';
import { formatDuration } from './musicplayer';
import { useBatchSongSelection } from '@/hooks/useBatchSongSelection';
import BatchSongActions, { BatchSongCheckbox } from './BatchSongActions';
import batchStyles from './batch-song.module.css';

const PAGE_SIZE = 10;

export default function MusicReq({ isVisible }: { isVisible: boolean }) {
  const { enqueue, requestRoom, room } = useMusicContext();
  const providers = room?.enabledProviders || (room?.binding.status === 'bound' ? ['netease'] as MusicProvider[] : []);
  const scope = providers.join(',') + ':' + JSON.stringify(room?.bindings || room?.binding);
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useToastMessage(error, { tone: 'error' });
  const [pending, setPending] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const batch = useBatchSongSelection({ songs, page, contextKey: query, visible: isVisible, disabled: pending !== null, preserveModeOnContextChange: true });
  const requestRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isVisible) inputRef.current?.focus(); }, [isVisible]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { requestRef.current?.abort(); setSongs([]); setLoading(false); setPages(1); setPage(1); setKeyword(''); }, [query, scope]);
  const search = async (term: string, nextPage = 1) => {
    if (!term.trim() || batch.pending || pending !== null) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError(''); setKeyword(term); setPage(nextPage);
    try {
      const data = await requestRoom<{ songs: Song[]; providers: Record<string, { error: string | null; total: number | null }> }>('/music/song/search?keywords=' + encodeURIComponent(term) + '&offset=' + (nextPage - 1) * PAGE_SIZE + '&limit=' + PAGE_SIZE, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setSongs(data.songs); setPages(Math.max(1, ...Object.values(data.providers).map(result => Math.ceil((result.total || 0) / PAGE_SIZE))));
        setError(Object.entries(data.providers).filter(([,result]) => result.error).map(([provider,result]) => providerName(provider as MusicProvider) + '：' + result.error).join('；'));
      }
    } catch (err) {
      if (!controller.signal.aborted) { setError((err as Error).message); setSongs([]); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const add = async (song: Song) => {
    if (batch.pending || pending !== null) return;
    setPending(songKey(song)); setError('');
    try { await enqueue(song); setAdded(songKey(song)); showToast('已加入待播 · ' + song.name, { tone: 'success' }); }
    catch (err) { if ((err as Error).name !== 'AbortError') setError((err as Error).message); }
    finally { setPending(null); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void search(query.trim()); };
  return <div className="search-content">
    <div className={batchStyles.searchHeading}>
      {!batch.active && <p className={batchStyles.scope}>{providers.length ? '搜索范围：' + providers.map(providerName).join(' + ') : '房主尚未绑定音乐账号，请先绑定后搜索'}</p>}
      <BatchSongActions batch={batch} loading={loading} canStart={providers.length > 0} />
    </div>
    <form className="song-search" onSubmit={submit}>
      <SearchRounded fontSize="small" />
      <input ref={inputRef} aria-label="搜索歌曲或歌手" placeholder="搜索歌曲或歌手…" value={query} disabled={batch.pending || pending !== null} onChange={event => setQuery(event.target.value)} maxLength={100} />
      <button type="submit" disabled={!providers.length || loading || batch.pending || pending !== null || !query.trim()}>{loading ? '搜索中' : '搜索'}</button>
    </form>
    {batch.active && <p className={batchStyles.searchHint}>{providers.length ? '翻页保留选择 · 更换关键词清空已选 · ' + providers.map(providerName).join(' + ') : '房主尚未绑定音乐账号，已选歌曲暂不可入队'}</p>}
    <div className="song-list" aria-busy={loading}>
      {loading ? <div className="panel-empty"><p>正在寻找你的下一首歌…</p></div> : !songs.length ? <div className="panel-empty"><SearchRounded /><p>{keyword ? (error ? '音乐服务暂时没有回应' : '没有找到这首歌') : '搜索歌曲'}</p><span>{keyword ? '换个关键词，或稍后再试' : '输入歌名或歌手，按回车搜索'}</span></div> : songs.map((song, index) => <div className={'song-row' + (batch.active ? ' ' + batchStyles.selectableRow : '') + (batch.selected.has(songKey(song)) ? ' ' + batchStyles.selectedRow : '')} key={songKey(song)}
        onClick={event => { if (batch.active && !(event.target as Element).closest('button, input, a, label')) batch.toggle(song, index); }}>
        {batch.active && <BatchSongCheckbox batch={batch} song={song} index={index} />}
        <SongCover src={song.prcUrl} /><div className="song-row-info"><div className="song-title"><strong title={song.name}>{song.name}</strong><SongBadges song={song} /></div><span>{song.artist} · {formatDuration(song.duration)}</span></div>
        <button className="icon-button add-song-button" onClick={() => void add(song)} disabled={pending !== null || batch.pending || !providers.includes(song.provider || 'netease')} aria-label={'点歌 ' + song.name} title="加入待播">{added === songKey(song) ? <CheckRounded /> : <AddRounded />}</button>
      </div>)}
    </div>
    {pages > 1 && <nav className="search-pagination" aria-label="搜索分页">
      <button className="icon-button" onClick={() => void search(keyword, page - 1)} disabled={page <= 1 || loading || batch.pending || pending !== null} aria-label="上一页"><ChevronLeftRounded /></button>
      <span>{page} / {pages}</span><button className="icon-button" onClick={() => void search(keyword, page + 1)} disabled={page >= pages || loading || batch.pending || pending !== null} aria-label="下一页"><ChevronRightRounded /></button>
    </nav>}
  </div>;
}
