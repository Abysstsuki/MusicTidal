'use client';

import { useState } from 'react';
import VerticalAlignTopRounded from '@mui/icons-material/VerticalAlignTopRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import SongCover from './modelItem/SongCover';
import { formatDuration } from './musicplayer';

export default function MusicQueue() {
  const { queue, moveToTop, removeFromQueue } = useMusicContext();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState('');
  const perform = async (id: number, action: () => Promise<void>) => {
    setPending(id); setError('');
    try { await action(); } catch (err) { setError((err as Error).message); } finally { setPending(null); }
  };
  return <div className="queue-content">
    <p className="panel-description">按大家点歌的顺序，一首接一首。</p>
    {error && <p className="inline-error" role="status">{error}</p>}
    <div className="song-list">
      {!queue.length && <div className="panel-empty"><QueueMusicRounded /><p>下一首，交给你。</p><span>点击顶部「点歌」，把喜欢的歌加入队列</span></div>}
      {queue.map((song, index) => <div className="song-row" key={song.instanceId}>
        <span className="song-index">{String(index + 1).padStart(2, '0')}</span>
        <SongCover src={song.prcUrl} />
        <div className="song-row-info"><strong>{song.name}</strong><span>{song.artist} · {formatDuration(song.duration)}</span></div>
        <div className="song-row-actions">
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => moveToTop(song.instanceId))} disabled={pending !== null || index === 0} title="移到队首" aria-label={'置顶 ' + song.name}><VerticalAlignTopRounded fontSize="small" /></button>
          <button className="icon-button" onClick={() => void perform(song.instanceId, () => removeFromQueue(song.instanceId))} disabled={pending !== null} title="移出队列" aria-label={'移除 ' + song.name}><CloseRounded fontSize="small" /></button>
        </div>
      </div>)}
    </div>
  </div>;
}
