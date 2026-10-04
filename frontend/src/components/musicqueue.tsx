'use client';

import { useEffect, useRef, useState } from 'react';
import VerticalAlignTopRounded from '@mui/icons-material/VerticalAlignTopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import { useToast } from '@/contexts/ToastContext';
import SongCover from './modelItem/SongCover';
import { formatDuration } from './musicplayer';
import styles from './musicqueue.module.css';
import PlaylistBrowser from './PlaylistBrowser';
import playlistStyles from './playlist.module.css';
import type { PlaybackMode } from '@/types/playlist';

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
  const toggleRecommendations = async () => {
    const version = ++modeActionVersion.current;
    const action = recommendations.enabled ? 'stop' : 'start';
    setModePending(action);
    try {
      await (action === 'start' ? startRecommendations() : stopRecommendations());
      if (version === modeActionVersion.current) showToast(action === 'start' ? '已开启心动模式' : '已停止心动续播', { tone: 'success' });
    }
    catch (err) { if (version === modeActionVersion.current && (err as Error).name !== 'AbortError') showToast((err as Error).message, { id: 'heart-error-' + room?.id, tone: 'error' }); }
    finally { if (version === modeActionVersion.current) setModePending(null); }
  };
  const recommendationStatus = recommendations.loading
    ? '正在获取心动推荐…'
    : recommendations.enabled ? recommendations.paused ? '心动模式 · 已暂停' : '心动模式 · 续播中' : '心动模式';
  return <div className={styles.content + ' ' + playlistStyles.regular}>
    <div className={styles.card + (recommendations.enabled ? ' ' + styles.enabled : '')}>
      <div className={styles.heading}>
        <FavoriteRounded />
        <strong role="status">{recommendationStatus}</strong>
        <button className={styles.toggle} onClick={() => void toggleRecommendations()}
          disabled={!isHost || (room?.binding.status !== 'bound' && !recommendations.enabled) || modePending === 'stop' || (!recommendations.enabled && modePending === 'start')}
          aria-label={recommendations.enabled ? '停止续播' : '开启心动模式'}>
          {recommendations.enabled ? <StopRounded /> : <PlayArrowRounded />}
          {recommendations.enabled ? '停止续播' : modePending === 'start' ? '加载中…' : '开启心动模式'}
        </button>
      </div>
      <p>{recommendations.enabled ? '手动点歌优先；停止后，当前歌曲继续播完。' : '根据红心歌单推荐歌曲，手动点歌优先。'}</p>
      <p>{room?.binding.status === 'bound' ? '网易云授权 · ' + room.binding.profile?.nickname : room?.binding.status === 'expired' ? '房主网易云授权已过期，当前使用游客授权' : '当前使用游客授权'}</p>
      <span>{!isHost ? '由房主控制心动模式 · 所有人同步收听' : room?.binding.status !== 'bound' ? '先绑定网易云账号，即可开启心动模式' : '使用房主网易云账号的红心歌单 · 所有人同步收听'}</span>
    </div>
    <div className="song-list">
      {!queue.length && <div className="panel-empty"><QueueMusicRounded /><p>{recommendations.enabled ? '正在补充心动推荐' : '暂无待播歌曲'}</p><span>{recommendations.enabled ? '点歌后会优先播放' : '可以点歌或开启心动模式'}</span></div>}
      {queue.map((song, index) => <div className="song-row" key={song.instanceId}>
        <span className="song-index">{String(index + 1).padStart(2, '0')}</span>
        <SongCover src={song.prcUrl} />
        <div className="song-row-info"><strong>{song.name}</strong><span>{song.artist} · {formatDuration(song.duration)}{song.source === 'heart' ? <small className={styles.source}>心动</small> : null}</span></div>
        <div className="song-row-actions">
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => moveToTop(song.instanceId), '已移到队首 · ' + song.name)} disabled={pending !== null || index === 0} title="移到队首" aria-label={'置顶 ' + song.name}><VerticalAlignTopRounded fontSize="small" /></button>
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => removeFromQueue(song.instanceId), '已移出队列 · ' + song.name)} disabled={pending !== null} title="移出队列" aria-label={'移除 ' + song.name}><CloseRounded fontSize="small" /></button>
        </div>
      </div>)}
    </div>
  </div>;
}
