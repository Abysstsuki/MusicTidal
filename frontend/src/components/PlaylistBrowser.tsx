'use client';

import { useEffect, useState, type FormEvent } from 'react';
import SearchRounded from '@mui/icons-material/SearchRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import ShuffleRounded from '@mui/icons-material/ShuffleRounded';
import FormatListNumberedRounded from '@mui/icons-material/FormatListNumberedRounded';
import RepeatRounded from '@mui/icons-material/RepeatRounded';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import { useToast } from '@/contexts/ToastContext';
import { apiRequest, ApiError } from '@/lib/api';
import type { NeteaseBinding as Binding } from '@/types/room';
import type { PlaylistSummary, PlaylistPage } from '@/types/playlist';
import type { Song } from '@/types/music';
import SongCover from './modelItem/SongCover';
import NeteaseBinding from './NeteaseBinding';
import { formatDuration } from './musicplayer';
import styles from './playlist.module.css';

const PAGE_SIZE = 30;
type Selection = { playlist: PlaylistSummary; entryId?: string };
function PageControls({ offset, hasMore, total, change }: { offset: number; hasMore: boolean; total: number | null; change: (offset: number) => void }) {
  return <nav className={styles.pagination} aria-label="歌单分页">
    <button className={styles.controlButton} disabled={!offset} aria-label="上一页" title="上一页" onClick={() => change(Math.max(0, offset - PAGE_SIZE))}><ChevronLeftRounded fontSize="small" /></button>
    <span>{Math.floor(offset / PAGE_SIZE) + 1}{total !== null ? ' / ' + Math.max(1, Math.ceil(total / PAGE_SIZE)) : ' 页'}</span>
    <button className={styles.controlButton} disabled={!hasMore} aria-label="下一页" title="下一页" onClick={() => change(offset + PAGE_SIZE)}><ChevronRightRounded fontSize="small" /></button>
  </nav>;
}

export default function PlaylistBrowser({ roomOnly = false }: { roomOnly?: boolean }) {
  const { playlists, playlistAction, requestRoom, enqueue, isHost, syncPlayback, currentSong } = useMusicContext();
  const { showToast } = useToast();
  const [binding, setBinding] = useState<Binding | null>(null);
  const [showBinding, setShowBinding] = useState(false);
  const [revision, setRevision] = useState(0);
  const [bindingRevision, setBindingRevision] = useState(0);
  const [view, setView] = useState<'mine' | 'search'>('search');
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<PlaylistPage<PlaylistSummary> | null>(null);
  const [tracks, setTracks] = useState<PlaylistPage<Song> | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entry = selection?.entryId ? playlists.entries.find(item => item.entryId === selection.entryId) : null;
  const active = Boolean(entry && entry.entryId === playlists.activeEntryId);

  useEffect(() => {
    if (roomOnly) return;
    const controller = new AbortController();
    apiRequest<Binding>('/api/user/netease', { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setBinding(value); setView(value.status === 'bound' ? 'mine' : 'search'); setOffset(0); }
    }).catch(problem => { if (!controller.signal.aborted) setError((problem as Error).message); });
    return () => controller.abort();
  }, [roomOnly, bindingRevision]);
  useEffect(() => {
    if (roomOnly && selection?.entryId && !playlists.entries.some(item => item.entryId === selection.entryId)) {
      setSelection(null); setOffset(0);
    }
  }, [roomOnly, selection, playlists.entries]);
  useEffect(() => {
    if ((roomOnly && !selection) || (!selection && view === 'mine' && binding?.status !== 'bound') || (!selection && view === 'search' && !keyword)) { setLoading(false); return; }
    const controller = new AbortController();
    const page = '?offset=' + offset + '&limit=' + PAGE_SIZE;
    setLoading(true); setError(''); setTracks(null); setList(null);
    const personalPath = selection ? '/api/user/netease/playlists/' + selection.playlist.id + '/tracks' + page
      : view === 'mine' ? '/api/user/netease/playlists' + page
        : '/api/user/netease/playlists/search' + page + '&keywords=' + encodeURIComponent(keyword);
    const work = selection?.entryId
      ? requestRoom<PlaylistPage<Song>>('/playlists/' + selection.entryId + '/tracks' + page, { signal: controller.signal })
      : apiRequest<PlaylistPage<Song> | PlaylistPage<PlaylistSummary>>(personalPath, { signal: controller.signal });
    work.then(value => {
      if (controller.signal.aborted) return;
      if (selection) setTracks(value as PlaylistPage<Song>); else setList(value as PlaylistPage<PlaylistSummary>);
    }).catch(problem => {
      if (!controller.signal.aborted) {
        setError((problem as Error).message);
        if (problem instanceof ApiError && problem.code === 'NETEASE_BINDING_EXPIRED') { setBinding(null); setView('search'); }
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [roomOnly, selection, offset, view, keyword, binding?.status, requestRoom, revision]);
  const perform = async (work: () => Promise<void>, notice: string) => {
    if (busy) return;
    setBusy(true);
    try { await work(); showToast(notice, { tone: 'success' }); }
    catch (problem) { if ((problem as Error).name !== 'AbortError') showToast((problem as Error).message, { tone: 'error' }); }
    finally { setBusy(false); }
  };
  const open = (playlist: PlaylistSummary, entryId?: string) => { setSelection({ playlist, entryId }); setOffset(0); setError(''); setTracks(null); };
  const back = () => { setSelection(null); setOffset(0); setError(''); setList(null); setTracks(null); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!query.trim()) return; setKeyword(query.trim()); setView('search'); setOffset(0); setRevision(value => value + 1); };
  const added = (id: number) => playlists.entries.some(item => item.id === id);
  const changeOffset = (next: number) => { if (!loading) setOffset(next); };

  return <div className={styles.browser}>
    {!selection && !roomOnly && <>
      <div className={styles.libraryHeading}>
        <span>{binding?.status === 'bound' ? '我的网易云 · ' + binding.profile?.nickname : '绑定账号后可查看自己的歌单'}</span>
        <button className={styles.controlButton} aria-label={binding?.status === 'bound' ? '管理网易云账号' : '绑定网易云账号'} title={binding?.status === 'bound' ? '管理网易云账号' : '绑定网易云账号'} onClick={() => setShowBinding(true)}><AccountCircleOutlined fontSize="small" /></button>
      </div>
      <div className={styles.tabs} aria-label="歌单来源">
        <button className={view === 'mine' ? styles.selected : ''} disabled={binding?.status !== 'bound'} onClick={() => { setView('mine'); setOffset(0); setList(null); }}>我的歌单</button>
        <button className={view === 'search' ? styles.selected : ''} onClick={() => { setView('search'); setOffset(0); setList(null); }}>搜索歌单</button>
      </div>
      {view === 'search' && <form className={styles.search} onSubmit={submit}>
        <input aria-label="搜索歌单" placeholder="搜索歌单名称…" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
        <button className={styles.controlButton} type="submit" aria-label="执行歌单搜索" title="搜索歌单" disabled={loading || !query.trim()}><SearchRounded fontSize="small" /></button>
      </form>}
    </>}
    {selection && <>
      <button className={styles.back} onClick={back}><ChevronLeftRounded fontSize="small" />返回歌单目录</button>
      <div className={styles.detailHeading}>
        <SongCover src={selection.playlist.coverUrl} />
        <div className={styles.detailCopy}>
          <strong title={selection.playlist.name}>{selection.playlist.name}</strong>
          <span title={selection.playlist.creator}>{selection.playlist.creator} · {selection.playlist.trackCount} 首</span>
          {entry && <small title={'本轮已播 ' + entry.played + ' / ' + entry.trackCount + ' 首 · 下一首优先队列 ' + entry.priorityNext.length + ' 首'}>{active ? '选定 · ' : ''}已播 {entry.played}/{entry.trackCount} · 下一首 {entry.priorityNext.length}{entry.completed && !entry.repeat ? ' · 已播完' : ''}</small>}
        </div>
        {entry && <div className={styles.controls} role="group" aria-label="歌单播放控制">
          <button className={styles.controlButton + (active && playlists.mode === 'playlist' ? ' ' + styles.controlActive : '')} disabled={!isHost || busy}
            aria-label={active ? '播放或继续此歌单' : '播放此歌单'} title={isHost ? active ? '播放 / 继续此歌单' : '播放此歌单，当前歌曲结束后接播' : '由房主播放此歌单'}
            onClick={() => void perform(() => playlistAction('/' + entry.entryId + '/activate'), '已选定歌单，当前歌曲结束后接播')}><PlayArrowRounded fontSize="small" /></button>
          <button className={styles.controlButton + (entry.order === 'shuffle' ? ' ' + styles.controlActive : '')} disabled={!isHost || busy}
            aria-label={entry.order === 'shuffle' ? '随机播放，切换为顺序播放' : '顺序播放，切换为随机播放'} aria-pressed={entry.order === 'shuffle'}
            title={(entry.order === 'shuffle' ? '随机播放 · 点击切换顺序播放' : '顺序播放 · 点击切换随机播放') + (!isHost ? ' · 由房主设置' : '')}
            onClick={() => void perform(() => playlistAction('/' + entry.entryId + '/settings', { order: entry.order === 'shuffle' ? 'sequential' : 'shuffle' }, 'PATCH'), entry.order === 'shuffle' ? '已切换顺序播放' : '已切换随机播放')}>
            {entry.order === 'shuffle' ? <ShuffleRounded fontSize="small" /> : <FormatListNumberedRounded fontSize="small" />}
          </button>
          <button className={styles.controlButton + (entry.repeat ? ' ' + styles.controlActive : '')} disabled={!isHost || busy}
            aria-label={entry.repeat ? '关闭整单循环' : '开启整单循环'} aria-pressed={entry.repeat}
            title={(entry.repeat ? '整单循环已开启 · 点击关闭' : '播完停止 · 点击开启整单循环') + (!isHost ? ' · 由房主设置' : '')}
            onClick={() => void perform(() => playlistAction('/' + entry.entryId + '/settings', { repeat: !entry.repeat }, 'PATCH'), entry.repeat ? '已关闭整单循环' : '已开启整单循环')}><RepeatRounded fontSize="small" /></button>
        </div>}
        {!entry && <button className={styles.controlButton + (added(selection.playlist.id) ? ' ' + styles.controlActive : '')} disabled={busy || added(selection.playlist.id)}
          aria-label={added(selection.playlist.id) ? '歌单已加入房间' : '整张歌单加入房间'} title={added(selection.playlist.id) ? '已在房间目录中' : '整张歌单加入房间'}
          onClick={() => void perform(() => playlistAction('', { playlistId: selection.playlist.id }), '整张歌单已加入房间目录')}>{added(selection.playlist.id) ? <CheckRounded fontSize="small" /> : <AddRounded fontSize="small" />}</button>}
      </div>
      {entry?.error && <p className="inline-error" role="status">{entry.error}</p>}
    </>}
    {error && <p className="inline-error" role="status">{error}<button className={styles.controlButton} aria-label="重试读取歌单" title="重试" onClick={() => setRevision(value => value + 1)}><RefreshRounded fontSize="small" /></button></p>}
    {loading ? <div className="panel-empty" role="status"><p>正在读取歌单…</p></div> : selection ? <>
      <div className="song-list" aria-label="歌单歌曲">
        {tracks?.items.map(song => <div className={'song-row ' + styles.row} key={song.id}>
          <SongCover src={song.prcUrl} /><div className="song-row-info"><strong>{song.name}{currentSong?.source === 'playlist' && currentSong.playlistEntryId === selection.entryId && currentSong.id === song.id ? ' · 播放中' : ''}</strong><span>{song.artist} · {formatDuration(song.duration)}{entry?.priorityNext.includes(song.id) ? ' · 下一首待播' : ''}</span></div>
          <div className="song-row-actions">
            <button className={styles.controlButton} disabled={busy} aria-label={'加入常规待播 ' + song.name} title="加入常规待播" onClick={() => void perform(() => enqueue(song), '已加入常规待播 · ' + song.name)}><AddRounded fontSize="small" /></button>
            {entry && <button className={styles.controlButton} disabled={busy || !active || entry.priorityNext.includes(song.id)} aria-label={'下一首播放 ' + song.name} title={active ? '歌单模式下一首播放' : '房主选定此歌单后可指定下一首'} onClick={() => void perform(() => playlistAction('/' + entry.entryId + '/next', { songId: song.id }), '已加入歌单下一首优先队列')}><SkipNextRounded fontSize="small" /></button>}
          </div>
        </div>)}
        {tracks && !tracks.items.length && <div className="panel-empty"><p>这一页暂无可读取歌曲</p></div>}
      </div>
      {tracks && <PageControls offset={offset} hasMore={tracks.hasMore} total={tracks.total} change={changeOffset} />}
    </> : <>
      <div className="song-list" aria-label={roomOnly ? '房间歌单目录' : '网易云歌单列表'}>
        {(roomOnly ? playlists.entries : list?.items || []).map(playlist => {
          const roomEntry = roomOnly ? playlists.entries.find(item => item.id === playlist.id) : null;
          return <div className={'song-row ' + styles.row} key={roomEntry?.entryId || playlist.id}>
            <button className={styles.playlistLink} onClick={() => open(playlist, roomEntry?.entryId)} aria-label={'查看歌单 ' + playlist.name}>
              <SongCover src={playlist.coverUrl} /><span className="song-row-info"><strong>{playlist.isLiked ? '红心 · ' : ''}{playlist.name}</strong><span>{roomEntry ? '由 ' + roomEntry.addedBy.username + ' 添加' : playlist.creator} · {playlist.trackCount} 首{roomEntry?.entryId === playlists.activeEntryId ? ' · 房间选定' : ''}</span></span><ChevronRightRounded fontSize="small" />
            </button>
            {roomEntry ? isHost && <button className={styles.controlButton} disabled={busy} aria-label={'移除歌单 ' + playlist.name} title="移除歌单" onClick={() => void perform(() => playlistAction('/' + roomEntry.entryId, {}, 'DELETE'), '已移除歌单')}><CloseRounded fontSize="small" /></button>
              : <button className={styles.controlButton + (added(playlist.id) ? ' ' + styles.controlActive : '')} disabled={busy || added(playlist.id)} aria-label={'整单加入房间 ' + playlist.name} title={added(playlist.id) ? '已在房间目录中' : '整单加入房间'} onClick={() => void perform(() => playlistAction('', { playlistId: playlist.id }), '整张歌单已加入房间目录')}>{added(playlist.id) ? <CheckRounded fontSize="small" /> : <AddRounded fontSize="small" />}</button>}
          </div>;
        })}
        {!(roomOnly ? playlists.entries.length : list?.items.length) && <div className="panel-empty"><p>{roomOnly ? '暂无房间歌单' : view === 'search' && !keyword ? '搜索网易云歌单' : '暂无歌单'}</p><span>{roomOnly ? '从顶部「歌单」整单添加，再由房主选择播放' : view === 'search' ? '搜索后可以整单添加，也可以单独点歌' : '红心、创建和收藏的歌单会显示在这里'}</span></div>}
      </div>
      {!roomOnly && list && <PageControls offset={offset} hasMore={list.hasMore} total={list.total} change={changeOffset} />}
    </>}
    {showBinding && <NeteaseBinding onClose={() => { setShowBinding(false); setBindingRevision(value => value + 1); }} onChanged={async () => { setBindingRevision(value => value + 1); setRevision(value => value + 1); await syncPlayback(); }} />}
  </div>;
}
