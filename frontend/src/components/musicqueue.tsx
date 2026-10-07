'use client';

import { useEffect, useRef, useState } from 'react';
import VerticalAlignTopRounded from '@mui/icons-material/VerticalAlignTopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
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

export default function MusicQueue({ isVisible = true }: { isVisible?: boolean }) {
  const { playlists, canControlPlayback, setPlaybackMode, queue, room } = useMusicContext();
  const { showToast } = useToast();
  const [view, setView] = useState<PlaybackMode>(playlists.mode);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (canControlPlayback) setView(playlists.mode); }, [canControlPlayback, playlists.mode]);
  const switchTab = async (mode: PlaybackMode) => {
    setView(mode);
    if (!canControlPlayback || mode === playlists.mode || (mode === 'playlist' && !playlists.activeEntryId)) return;
    setBusy(true);
    try { await setPlaybackMode(mode); showToast('已切换播放模式，当前歌曲继续播完', { tone: 'success' }); }
    catch (error) { showToast((error as Error).message, { tone: 'error' }); setView(playlists.mode); }
    finally { setBusy(false); }
  };
  return <div className={'queue-content ' + playlistStyles.queuePanel}>
    <div className={playlistStyles.tabs} role="tablist" aria-label="待播队列">
      {(['regular', 'playlist'] as const).map(mode => <button key={mode} id={'queue-tab-' + mode} role="tab" aria-controls={'queue-panel-' + mode} aria-selected={view === mode} disabled={busy} className={view === mode ? playlistStyles.selected : ''} onClick={() => void switchTab(mode)}>{mode === 'regular' ? '常规 · ' + queue.length : '歌单 · ' + playlists.entries.length}{mode === playlists.mode ? ' · 播放中' : ''}</button>)}
    </div>
    <p className={playlistStyles.modeNote}>{canControlPlayback ? view === 'playlist' && !playlists.activeEntryId ? room?.kind === 'super' ? '点击歌单右侧播放图标启用，所有成员均可操作。' : '进入歌单详情，点击右侧播放图标启用。' : '切换标签可切换房间播放模式，当前歌曲继续播完。' : '标签仅用于浏览，房主控制房间播放模式。'}</p>
    <div role="tabpanel" id="queue-panel-regular" aria-labelledby="queue-tab-regular" hidden={view !== 'regular'}><RegularQueue /></div>
    <div role="tabpanel" id="queue-panel-playlist" aria-labelledby="queue-tab-playlist" hidden={view !== 'playlist'}><PlaylistBrowser roomOnly visible={isVisible && view === 'playlist'} /></div>
  </div>;
}

function RegularQueue() {
  const { queue, recommendations, startRecommendations, stopRecommendations, moveToTop, removeFromQueue, isHost, room } = useMusicContext();
  const { showToast } = useToast();
  const [pending, setPending] = useState<number | null>(null);
  const [modePending, setModePending] = useState<'start' | 'stop' | null>(null);
  const [lastProvider, setLastProvider] = useState<MusicProvider | null>(recommendations.provider || null);
  useEffect(() => { if (recommendations.enabled && recommendations.provider) setLastProvider(recommendations.provider); }, [recommendations.enabled, recommendations.provider]);
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
  const selectedProvider = recommendations.enabled ? recommendations.provider || 'netease' : 'off';
  const sources = [
    { provider: 'netease', name: '网易云', label: '网易云心动', description: '心动模式', binding: room?.binding.status },
    { provider: 'qqmusic', name: 'QQ 音乐', label: 'QQ 漫游', description: '猜你喜欢', binding: room?.bindings?.qqmusic.status },
  ] as const;
  const resumeProvider = sources.find(source => source.provider === (recommendations.provider || lastProvider) && source.binding === 'bound')?.provider
    || sources.find(source => source.binding === 'bound')?.provider;
  const label = recommendations.provider === 'qqmusic' ? 'QQ 漫游' : '网易云心动';
  const available = recommendations.available !== false;
  const recommendationStatus = !available ? '已禁用' : modePending ? '正在切换'
    : recommendations.loading ? '获取推荐中'
    : recommendations.enabled ? recommendations.paused ? '已暂停' : '续播中' : '已关闭';
  return <div className={styles.content + ' ' + playlistStyles.regular}>
    <div className={styles.card} aria-busy={modePending !== null}>
      <div className={styles.heading}>
        <span className={styles.headingIcon}><AutoAwesomeRounded /></span>
        <div className={styles.headingCopy}>
          <strong>推荐续播</strong>
          <span className={styles.status + (modePending || recommendations.loading ? ' ' + styles.statusPending : recommendations.enabled && !recommendations.paused ? ' ' + styles.statusActive : '')} role="status">{recommendationStatus}</span>
        </div>
        <button type="button" className={styles.switch} role="switch" aria-label="自动推荐续播" aria-checked={recommendations.enabled}
          disabled={!available || !isHost || modePending !== null || (!recommendations.enabled && !resumeProvider)}
          title={!available ? recommendations.disabledReason || '推荐续播已禁用' : !isHost ? '由房主控制推荐续播' : recommendations.enabled ? '关闭推荐续播' : resumeProvider ? '开启推荐续播' : '房主需先绑定音乐账号'}
          onClick={() => { if (recommendations.enabled) void toggleRecommendations('off'); else if (resumeProvider) void toggleRecommendations(resumeProvider); }} />
      </div>
      <div className={styles.sources} role="group" aria-label="推荐来源">
        {sources.map(({ provider, name, label: sourceLabel, description, binding }) => <button key={provider} type="button"
          className={styles.sourceCard + ' ' + styles[provider] + (selectedProvider === provider ? ' ' + styles.selected : '')}
          aria-label={sourceLabel} aria-pressed={selectedProvider === provider} disabled={!available || !isHost || modePending !== null || binding !== 'bound'}
          title={!available ? recommendations.disabledReason || '推荐续播已禁用' : binding !== 'bound' ? '房主需绑定有效的' + name + '账号' : !isHost ? '由房主选择推荐来源' : '开启' + sourceLabel}
          onClick={() => { if (selectedProvider !== provider) void toggleRecommendations(provider); }}>
          <span className={styles.sourceIcon}>{provider === 'netease' ? <FavoriteRounded /> : <GraphicEqRounded />}</span>
          <span className={styles.sourceCopy}><strong>{name}</strong><span>{!available ? '已禁用' : binding === 'bound' ? description : binding === 'expired' ? '授权已过期' : '尚未绑定'}</span></span>
          <span className={styles.sourceCheck} aria-hidden="true">{selectedProvider === provider && <CheckRounded />}</span>
        </button>)}
      </div>
      <p className={styles.description}>{!available ? recommendations.disabledReason : '手动点歌优先 · 切换不打断当前歌曲'}</p>
      {available && !isHost && <p className={styles.hint}>由房主选择推荐来源 · 所有人同步收听</p>}
      {available && recommendations.paused && <p className={styles.hint}>歌单模式下暂停推荐补充</p>}
      {recommendations.error && <p className="inline-error" role="status">{recommendations.error}</p>}
    </div>
    <div className="song-list">
      {!queue.length && <div className="panel-empty"><QueueMusicRounded /><p>{recommendations.enabled ? '正在补充' + label : '暂无待播歌曲'}</p><span>{!available ? '可以点歌，或添加歌单播放' : recommendations.enabled ? '点歌后会优先播放' : '可以点歌，或开启推荐续播'}</span></div>}
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
