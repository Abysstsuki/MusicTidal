'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import LyricsOutlined from '@mui/icons-material/LyricsOutlined';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded';
import { useMusicContext } from '@/contexts/MusicContext';
import SongCover from '@/components/modelItem/SongCover';

export function formatDuration(ms: number) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

export default function MusicPlayer({ showLyrics, onToggleLyrics }: { showLyrics: boolean; onToggleLyrics: () => void }) {
  const { currentSong, currentPosition, isPlaying, audioUrl, startTime, playbackRevision, connection, isPreview, setCurrentPosition, setIsPlaying, syncPlayback, skipNext } = useMusicContext();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(30);
  const lastVolume = useRef(30);
  const [showPlayPrompt, setShowPlayPrompt] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const tryPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    try {
      await audio.play(); setShowPlayPrompt(false);
    } catch (error) {
      if ((error as Error).name === 'NotAllowedError') setShowPlayPrompt(true);
      else setNotice('音频暂时无法播放，请尝试重新同步');
      setIsPlaying(false);
    }
  }, [audioUrl, setIsPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isPreview) return;
    setNotice('');
    setShowPlayPrompt(false);
    if (!audioUrl || !currentSong) { audio.pause(); audio.removeAttribute('src'); audio.load(); return; }
    audio.src = audioUrl;
    const align = () => {
      audio.currentTime = Math.max(0, Math.min((Date.now() - startTime) / 1000, currentSong.duration / 1000));
      setCurrentPosition(audio.currentTime * 1000);
      void tryPlay();
    };
    audio.addEventListener('loadedmetadata', align, { once: true });
    audio.load();
    return () => audio.removeEventListener('loadedmetadata', align);
  }, [audioUrl, startTime, playbackRevision, currentSong, isPreview, setCurrentPosition, tryPlay]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume / 100; }, [volume]);
  useEffect(() => {
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!isPreview || !isPlaying || !currentSong) return;
    const basePosition = currentPosition;
    const baseTime = Date.now();
    const timer = setInterval(() => {
      const next = Math.min(basePosition + Date.now() - baseTime, currentSong.duration);
      setCurrentPosition(next);
      if (next >= currentSong.duration) setIsPlaying(false);
    }, 250);
    return () => clearInterval(timer);
    // The base position is captured when preview playback starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, isPlaying, currentSong, setCurrentPosition, setIsPlaying]);

  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch (error) { setNotice((error as Error).message || '操作失败，请稍后再试'); }
    finally { setBusy(false); }
  };
  const togglePlayback = () => {
    if (isPreview) { setIsPlaying(!isPlaying); return; }
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      // Resuming catches up to everyone instead of playing an old local position.
      if (currentSong) audio.currentTime = Math.max(0, Math.min((Date.now() - startTime) / 1000, currentSong.duration / 1000));
      void tryPlay();
    } else audio.pause();
  };
  const download = async () => {
    if (!currentSong || !audioUrl) return;
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error('下载失败，请稍后再试');
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl; link.download = currentSong.name + ' - ' + currentSong.artist + '.mp3';
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else throw new Error('当前浏览器不支持全屏');
  };
  const progress = currentSong?.duration ? Math.max(0, Math.min(100, currentPosition / currentSong.duration * 100)) : 0;
  return (
    <section className="player-dock" aria-label="音乐播放器">
      {notice && <p className="player-notice" role="status">{notice}</p>}
      {showPlayPrompt && <button className="autoplay-prompt" onClick={togglePlayback}><PlayArrowRounded fontSize="small" />点击播放，加入此刻</button>}
      <div className="player-timeline" role="progressbar" aria-label="歌曲播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div style={{ width: progress + '%' }} />
      </div>
      <span className="player-time">{formatDuration(currentPosition)} / {formatDuration(currentSong?.duration || 0)}</span>
      <div className="player-row">
        <div className="player-track">
          <SongCover src={currentSong?.prcUrl} />
          <div><strong>{currentSong?.name || '还没有歌曲'}</strong><span>{currentSong?.artist || '等你点一首'}</span></div>
        </div>
        <button className="sync-button" disabled={busy || isPreview} onClick={() => void perform(syncPlayback)} title="重新同步到大家的播放位置" aria-label="重新同步">
          <SyncRounded fontSize="small" /><span>{isPreview ? '预览' : connection === 'connected' ? '同步中' : '同步'}</span><i />
        </button>
        <div className="transport-controls">
          <button className="icon-button download-button" disabled={!audioUrl || busy} onClick={() => void perform(download)} title="下载歌曲" aria-label="下载歌曲"><DownloadRounded /></button>
          <button className="play-button" onClick={togglePlayback} disabled={!currentSong || (!isPreview && !audioUrl)} title={isPlaying ? '仅暂停我的播放' : '加入同步播放'} aria-label={isPlaying ? '暂停播放' : '开始播放'}>{isPlaying ? <PauseRounded /> : <PlayArrowRounded />}</button>
          <button className="icon-button" onClick={() => void perform(skipNext)} disabled={busy || (!currentSong && !isPreview)} title="为大家切换下一首" aria-label="下一首"><SkipNextRounded /></button>
        </div>
        <button className={'icon-button lyrics-toggle ' + (showLyrics ? 'is-active' : '')} onClick={onToggleLyrics} aria-label={showLyrics ? '隐藏歌词' : '显示歌词'} aria-pressed={showLyrics} title="切换歌词"><LyricsOutlined /></button>
        <div className="volume-control">
          <button className="icon-button" onClick={() => { if (volume) { lastVolume.current = volume; setVolume(0); } else setVolume(lastVolume.current); }} aria-label={volume ? '静音' : '取消静音'} title={volume ? '静音' : '取消静音'}>{volume ? <VolumeUpRounded /> : <VolumeOffRounded />}</button>
          <input aria-label="音量" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} />
        </div>
        <button className="icon-button fullscreen-button" onClick={() => void perform(toggleFullscreen)} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '进入全屏'}>{fullscreen ? <FullscreenExitRounded /> : <FullscreenRounded />}</button>
      </div>
      <audio ref={audioRef} hidden onTimeUpdate={event => setCurrentPosition(event.currentTarget.currentTime * 1000)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onError={() => { if (audioUrl) { setIsPlaying(false); setNotice('这首歌暂时无法播放，请重新同步或切换歌曲'); } }} />
    </section>
  );
}
