'use client';

import { useRef, useState } from 'react';
import VerticalAlignTopRounded from '@mui/icons-material/VerticalAlignTopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded';
import RadioRounded from '@mui/icons-material/RadioRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import SongCover from './modelItem/SongCover';
import { formatDuration } from './musicplayer';
import styles from './musicqueue.module.css';

export default function MusicQueue() {
  const { queue, recommendations, startRecommendations, stopRecommendations, moveToTop, removeFromQueue } = useMusicContext();
  const [pending, setPending] = useState<number | null>(null);
  const [modePending, setModePending] = useState<'start' | 'stop' | null>(null);
  const modeActionVersion = useRef(0);
  const [error, setError] = useState('');
  const perform = async (id: number, action: () => Promise<void>) => {
    setPending(id); setError('');
    try { await action(); } catch (err) { setError((err as Error).message); } finally { setPending(null); }
  };
  const toggleRecommendations = async () => {
    const version = ++modeActionVersion.current;
    const action = recommendations.enabled ? 'stop' : 'start';
    setModePending(action); setError('');
    try { await (action === 'start' ? startRecommendations() : stopRecommendations()); }
    catch (err) { if (version === modeActionVersion.current) setError((err as Error).message); }
    finally { if (version === modeActionVersion.current) setModePending(null); }
  };
  const recommendationStatus = recommendations.loading
    ? '正在补充 FM…'
    : recommendations.enabled ? '私人 FM · 续播中' : '私人 FM';
  return <div className={'queue-content ' + styles.content}>
    <div className={styles.card + (recommendations.enabled ? ' ' + styles.enabled : '')}>
      <div className={styles.heading}>
        <RadioRounded />
        <strong role="status">{recommendationStatus}</strong>
        <button className={styles.toggle} onClick={() => void toggleRecommendations()}
          disabled={modePending === 'stop' || (!recommendations.enabled && modePending === 'start')}
          aria-label={recommendations.enabled ? '停止续播' : '开启 FM'}>
          {recommendations.enabled ? <StopRounded /> : <PlayArrowRounded />}
          {recommendations.enabled ? '停止续播' : modePending === 'start' ? '加载中…' : '开启 FM'}
        </button>
      </div>
      <p>{recommendations.enabled ? '手动点歌优先；停止后，当前歌曲继续播完。' : '自动补充 FM 歌曲，手动点歌优先。'}</p>
      <span>基于房间的网易云账号 · 所有人同步收听</span>
    </div>
    {(error || recommendations.error) && <p className="inline-error" role="status">{error || recommendations.error}</p>}
    <div className="song-list">
      {!queue.length && <div className="panel-empty"><QueueMusicRounded /><p>{recommendations.enabled ? '正在补充 FM 歌曲' : '暂无待播歌曲'}</p><span>{recommendations.enabled ? '点歌后会优先播放' : '可以点歌或开启 FM'}</span></div>}
      {queue.map((song, index) => <div className="song-row" key={song.instanceId}>
        <span className="song-index">{String(index + 1).padStart(2, '0')}</span>
        <SongCover src={song.prcUrl} />
        <div className="song-row-info"><strong>{song.name}</strong><span>{song.artist} · {formatDuration(song.duration)}{song.source === 'fm' ? <small className={styles.source}>FM</small> : null}</span></div>
        <div className="song-row-actions">
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => moveToTop(song.instanceId))} disabled={pending !== null || index === 0} title="移到队首" aria-label={'置顶 ' + song.name}><VerticalAlignTopRounded fontSize="small" /></button>
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => removeFromQueue(song.instanceId))} disabled={pending !== null} title="移出队列" aria-label={'移除 ' + song.name}><CloseRounded fontSize="small" /></button>
        </div>
      </div>)}
    </div>
  </div>;
}
