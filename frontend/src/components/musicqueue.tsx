'use client';

import { useEffect, useRef, useState } from 'react';
import VerticalAlignTopRounded from '@mui/icons-material/VerticalAlignTopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import { useToast } from '@/contexts/ToastContext';
import SongCover from './modelItem/SongCover';
import { formatDuration } from './musicplayer';
import styles from './musicqueue.module.css';
import PlaylistBrowser from './PlaylistBrowser';
import playlistStyles from './playlist.module.css';
import type { PlaybackMode } from '@/types/playlist';
import type { MusicProvider } from '@/types/music';
import SongBadges from './SongBadges';

export default function MusicQueue() {
  const { playlists, isHost, setPlaybackMode, queue } = useMusicContext();
  const { showToast } = useToast();
  const [view, setView] = useState<PlaybackMode>(playlists.mode);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isHost) setView(playlists.mode); }, [isHost, playlists.mode]);
  const switchTab = async (mode: PlaybackMode) => {
    setView(mode);
    if (!isHost || mode === playlists.mode || (mode === 'playlist' && !playlists.activeEntryId)) return;
    setBusy(true);
    try { await setPlaybackMode(mode); showToast('已切换播放模式，当前歌曲继续播完', { tone: 'success' }); }
    catch (error) { showToast((error as Error).message, { tone: 'error' }); setView(playlists.mode); }
    finally { setBusy(false); }
  };
  return <div className={'queue-content ' + playlistStyles.queuePanel}>
    <div className={playlistStyles.tabs} role="tablist" aria-label="待播队列">
      {(['regular', 'playlist'] as const).map(mode => <button key={mode} id={'queue-tab-' + mode} role="tab" aria-controls={'queue-panel-' + mode} aria-selected={view === mode} disabled={busy} className={view === mode ? playlistStyles.selected : ''} onClick={() => void switchTab(mode)}>{mode === 'regular' ? '常规 · ' + queue.length : '歌单 · ' + playlists.entries.length}{mode === playlists.mode ? ' · 播放中' : ''}</button>)}
    </div>
    <p className={playlistStyles.modeNote}>{isHost ? view === 'playlist' && !playlists.activeEntryId ? '进入歌单详情，点击右侧播放图标启用。' : '切换标签可切换房间播放模式，当前歌曲继续播完。' : '标签仅用于浏览，房主控制房间播放模式。'}</p>
    <div role="tabpanel" id="queue-panel-regular" aria-labelledby="queue-tab-regular" hidden={view !== 'regular'}><RegularQueue /></div>
    <div role="tabpanel" id="queue-panel-playlist" aria-labelledby="queue-tab-playlist" hidden={view !== 'playlist'}><PlaylistBrowser roomOnly /></div>
  </div>;
}

function RegularQueue() {
  const { queue, recommendations, startRecommendations, stopRecommendations, moveToTop, removeFromQueue, isHost, room } = useMusicContext();
  const { showToast } = useToast();
  const [pending, setPending] = useState<number | null>(null);
  const [modePending, setModePending] = useState<'start' | 'stop' | null>(null);
  const modeActionVersion = useRef(0);
  const perform = async (id: number, action: () => Promise<void>, message: string) => {
    setPending(id);
    try { await action(); showToast(message, { tone: 'success' }); }
    catch (err) { if ((err as Error).name !== 'AbortError') showToast((err as Error).message, { tone: 'error' }); }
    finally { setPending(null); }
  };
  const toggleRecommendations = async (provider: MusicProvider | 'off') => {
    const version = ++modeActionVersion.current;
    const action = provider === 'off' ? 'stop' : 'start';
    setModePending(action);
    try {
      await (provider === 'off' ? stopRecommendations() : startRecommendations(provider));
      if (version === modeActionVersion.current) showToast(provider === 'off' ? '已关闭推荐' : provider === 'qqmusic' ? '已开启 QQ 漫游' : '已开启网易云心动', { tone: 'success' });
    }
    catch (err) { if (version === modeActionVersion.current && (err as Error).name !== 'AbortError') showToast((err as Error).message, { id: 'heart-error-' + room?.id, tone: 'error' }); }
    finally { if (version === modeActionVersion.current) setModePending(null); }
  };
  const label = recommendations.provider === 'qqmusic' ? 'QQ 漫游' : '网易云心动';
  const recommendationStatus = recommendations.loading ? '正在获取推荐…'
    : recommendations.enabled ? label + (recommendations.paused ? ' · 已暂停' : ' · 续播中') : '推荐续播';
  return <div className={styles.content + ' ' + playlistStyles.regular}>
    <div className={styles.card + (recommendations.enabled ? ' ' + styles.enabled : '')}>
      <div className={styles.heading}>
        <FavoriteRounded />
        <strong role="status">{recommendationStatus}</strong>
        <select className={styles.toggle} aria-label="推荐来源" value={recommendations.enabled ? recommendations.provider || 'netease' : 'off'}
          disabled={!isHost || modePending !== null} onChange={event => void toggleRecommendations(event.target.value as MusicProvider | 'off')}>
          <option value="off">关闭</option>
          <option value="netease" disabled={room?.binding.status !== 'bound'}>网易云心动</option>
          <option value="qqmusic" disabled={room?.bindings?.qqmusic.status !== 'bound'}>QQ 漫游</option>
        </select>
      </div>
      <p>手动点歌优先；切换来源后，当前歌曲继续播完。</p>
      <span>{isHost ? '选择一个已绑定平台提供推荐；歌单模式下暂停补充。' : '由房主选择推荐来源 · 所有人同步收听'}</span>
      {recommendations.error && <p className="inline-error" role="status">{recommendations.error}</p>}
    </div>
    <div className="song-list">
      {!queue.length && <div className="panel-empty"><QueueMusicRounded /><p>{recommendations.enabled ? '正在补充心动推荐' : '暂无待播歌曲'}</p><span>{recommendations.enabled ? '点歌后会优先播放' : '可以点歌或开启心动模式'}</span></div>}
      {queue.map((song, index) => <div className="song-row" key={song.instanceId}>
        <span className="song-index">{String(index + 1).padStart(2, '0')}</span>
        <SongCover src={song.prcUrl} />
        <div className="song-row-info"><div className="song-title"><strong title={song.name}>{song.name}</strong><SongBadges song={song} /></div><span>{song.artist} · {formatDuration(song.duration)}{song.source === 'heart' ? <small className={styles.source}>{song.provider === 'qqmusic' ? '漫游' : '心动'}</small> : null}</span></div>
        <div className="song-row-actions">
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => moveToTop(song.instanceId), '已移到队首 · ' + song.name)} disabled={pending !== null || index === 0} title="移到队首" aria-label={'置顶 ' + song.name}><VerticalAlignTopRounded fontSize="small" /></button>
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => removeFromQueue(song.instanceId), '已移出队列 · ' + song.name)} disabled={pending !== null} title="移出队列" aria-label={'移除 ' + song.name}><CloseRounded fontSize="small" /></button>
        </div>
      </div>)}
    </div>
  </div>;
}
