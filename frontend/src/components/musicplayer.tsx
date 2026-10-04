'use client';
import SongBadges from './SongBadges';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { useToast, useToastMessage } from '@/contexts/ToastContext';
import SongCover from '@/components/modelItem/SongCover';
import PlayerGlass from '@/components/playerglass';
import { useAudioRhythm } from '@/hooks/use-audio-rhythm';

export function formatDuration(ms: number) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

type VolumePreference = { volume: number; lastVolume: number };
const volumeStorageKey = (userId: number) => 'musictidal:player-volume:' + userId;
const validVolume = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

function readVolumePreference(userId?: number): VolumePreference {
  const fallback = { volume: 30, lastVolume: 30 };
  if (userId === undefined || typeof window === 'undefined') return fallback;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(volumeStorageKey(userId)) || 'null');
    if (!saved || typeof saved !== 'object' || !('volume' in saved) || !validVolume(saved.volume)) return fallback;
    const lastVolume = 'lastVolume' in saved && validVolume(saved.lastVolume) && saved.lastVolume > 0 ? saved.lastVolume : 30;
    return { volume: saved.volume, lastVolume: saved.volume > 0 ? saved.volume : lastVolume };
  } catch { return fallback; }
}

export default function MusicPlayer({ showLyrics, onToggleLyrics }: { showLyrics: boolean; onToggleLyrics: () => void }) {
  const { showToast } = useToast();
  const { user, audioRef, rhythmReader, currentSong, currentPosition, isPlaying, audioUrl, startTime, playbackRevision, connection, setCurrentPosition, setIsPlaying, syncPlayback, skipNext } = useMusicContext();
  const userId = user?.id;
  const [volumePreference, setVolumePreference] = useState(() => readVolumePreference(userId));
  const volume = volumePreference.volume;
  const volumePreferenceRef = useRef(volumePreference);
  const volumeUserId = useRef(userId);
  useEffect(() => {
    if (volumeUserId.current === userId) return;
    volumeUserId.current = userId;
    const restored = readVolumePreference(userId);
    volumePreferenceRef.current = restored;
    setVolumePreference(restored);
    if (audioRef.current) audioRef.current.volume = restored.volume / 100;
  }, [userId, audioRef]);
  const setVolume = (next: number) => {
    if (!validVolume(next)) return;
    const previous = volumeUserId.current === userId ? volumePreferenceRef.current : readVolumePreference(userId);
    const preference = { volume: next, lastVolume: next > 0 ? next : previous.lastVolume };
    volumeUserId.current = userId;
    volumePreferenceRef.current = preference;
    setVolumePreference(preference);
    if (userId !== undefined) {
      try { localStorage.setItem(volumeStorageKey(userId), JSON.stringify(preference)); }
      catch { /* Playback remains usable when browser storage is unavailable. */ }
    }
  };
  const [nonCorsUrl, setNonCorsUrl] = useState<string | null>(null);
  const corsEnabled = nonCorsUrl !== audioUrl;
  useAudioRhythm(audioRef, rhythmReader);
  const bindAudio = useCallback((node: HTMLAudioElement | null) => {
    const previous = audioRef.current;
    if (previous && previous !== node) {
      // Ref replay in development must not erase a loaded track or its position.
      previous.pause();
      if (node) { previous.removeAttribute('src'); previous.load(); }
    }
    audioRef.current = node;
    // Restore before the first play, including replacement audio elements after a CORS fallback.
    if (node) node.volume = volumePreferenceRef.current.volume / 100;
  }, [audioRef]);
  const loadedPlayback = useRef<{ songId: string; url: string; startTime: number; cors: boolean } | null>(null);
  const playRequest = useRef(0);
  const pausedByUser = useRef(false);
  const autoplayBlocked = useRef(false);
  const [showPlayPrompt, setShowPlayPrompt] = useState(false);
  const [notice, setNotice] = useState('');
  useToastMessage(notice, { tone: 'error' });
  useToastMessage(showPlayPrompt ? '自动播放受限，点击页面或播放按钮开始播放' : '', { tone: 'info', duration: null });
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const songId = currentSong ? (currentSong.provider || 'netease') + ':' + currentSong.id : undefined;
  const audioOffset = currentSong?.audioOffset || 0;
  const songDuration = currentSong?.duration || 0;

  const alignPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
    audio.currentTime = Math.max(0, Math.min((Date.now() - startTime) / 1000, songDuration / 1000) + audioOffset / 1000);
    setCurrentPosition(Math.max(0, audio.currentTime * 1000 - audioOffset));
  }, [audioRef, startTime, songDuration, audioOffset, setCurrentPosition]);

  const tryPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || pausedByUser.current) return;
    const request = ++playRequest.current;
    alignPlayback();
    try {
      // Call play before awaiting anything so a click can authorize this audio element.
      await audio.play();
      if (request !== playRequest.current) return;
      alignPlayback();
      autoplayBlocked.current = false;
      setShowPlayPrompt(false);
    } catch (error) {
      if (request !== playRequest.current || pausedByUser.current) return;
      const name = (error as Error).name;
      if (name === 'AbortError') return;
      autoplayBlocked.current = name === 'NotAllowedError';
      setShowPlayPrompt(autoplayBlocked.current);
      if (!autoplayBlocked.current) setNotice('音频暂时无法播放，请尝试重新同步');
      setIsPlaying(false);
    }
  }, [audioRef, audioUrl, alignPlayback, setIsPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setNotice('');
    if (!audioUrl || songId === undefined) {
      playRequest.current += 1;
      loadedPlayback.current = null;
      autoplayBlocked.current = false;
      setShowPlayPrompt(false);
      audio.pause(); audio.removeAttribute('src'); audio.load();
      setIsPlaying(false);
      return;
    }
    audio.addEventListener('loadedmetadata', alignPlayback);
    const previous = loadedPlayback.current;
    // REST and WebSocket may both send the same snapshot; reloading aborts pending play.
    if (!previous || previous.songId !== songId || previous.url !== audioUrl || previous.startTime !== startTime || previous.cors !== corsEnabled || !audio.getAttribute('src') || audio.error) {
      playRequest.current += 1;
      loadedPlayback.current = { songId, url: audioUrl, startTime, cors: corsEnabled };
      autoplayBlocked.current = false;
      setShowPlayPrompt(false);
      audio.src = audioUrl;
      audio.load();
    }
    if (!pausedByUser.current) void tryPlay();
    return () => audio.removeEventListener('loadedmetadata', alignPlayback);
  }, [audioRef, audioUrl, startTime, playbackRevision, songId, corsEnabled, alignPlayback, tryPlay, setIsPlaying]);

  useEffect(() => {
    const onInteraction = (event: MouseEvent) => {
      if (!event.isTrusted || !autoplayBlocked.current || pausedByUser.current) return;
      // Playback buttons handle their own click; starting here would toggle them twice.
      if (event.target instanceof Element && event.target.closest('[data-playback-control]')) return;
      void tryPlay();
    };
    document.addEventListener('click', onInteraction, true);
    return () => document.removeEventListener('click', onInteraction, true);
  }, [tryPlay]);

  useEffect(() => () => { playRequest.current += 1; }, []);
  useEffect(() => {
    const audio = audioRef.current;
    return () => { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } };
  }, [audioRef, corsEnabled]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volumePreferenceRef.current.volume / 100; }, [audioRef, volume, corsEnabled]);
  useEffect(() => {
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await action(); } catch (error) { if ((error as Error).name !== 'AbortError') setNotice((error as Error).message || '操作失败，请稍后再试'); }
    finally { setBusy(false); }
  };
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      pausedByUser.current = false;
      void tryPlay();
    } else {
      pausedByUser.current = true;
      autoplayBlocked.current = false;
      playRequest.current += 1;
      setShowPlayPrompt(false);
      audio.pause();
    }
  };
  const resyncPlayback = async () => {
    pausedByUser.current = false;
    void tryPlay();
    await syncPlayback();
    showToast('播放进度已同步', { tone: 'success' });
  };
  const download = async () => {
    if (!currentSong || !audioUrl) return;
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error('下载失败，请稍后再试');
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl; link.download = currentSong.name + ' - ' + currentSong.artist + (currentSong.trial ? ' [试听]' : '') + '.' + (currentSong.format || 'mp3');
    link.click();
    showToast('歌曲下载已开始', { tone: 'success' });
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
      <PlayerGlass />
      <div className="player-timeline" role="progressbar" aria-label="歌曲播放进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div style={{ width: progress + '%' }} />
      </div>
      <span className="player-time">{formatDuration(currentPosition)} / {formatDuration(currentSong?.duration || 0)}</span>
      <div className="player-row">
        <div className="player-track">
          <SongCover src={currentSong?.prcUrl} />
          <div><div className="song-title"><strong title={currentSong?.name}>{currentSong?.name || '还没有歌曲'}</strong>{currentSong && <SongBadges song={currentSong} />}</div>{currentSong?.artist && <span>{currentSong.artist}</span>}</div>
        </div>
        <button className="sync-button" data-playback-control disabled={busy} onClick={() => void perform(resyncPlayback)} title="重新同步到大家的播放位置" aria-label="重新同步">
          <SyncRounded fontSize="small" /><span>{connection === 'connected' ? '同步中' : '同步'}</span><i />
        </button>
        <div className="transport-controls">
          <button className="icon-button download-button" disabled={!audioUrl || busy} onClick={() => void perform(download)} title="下载歌曲" aria-label="下载歌曲"><DownloadRounded /></button>
          <button className="play-button" data-playback-control onClick={togglePlayback} disabled={!currentSong || !audioUrl} title={isPlaying ? '仅暂停我的播放' : '加入同步播放'} aria-label={isPlaying ? '暂停播放' : '开始播放'}>{isPlaying ? <PauseRounded /> : <PlayArrowRounded />}</button>
          <button className="icon-button" onClick={() => void perform(skipNext)} disabled={busy || !currentSong} title="为大家切换下一首" aria-label="下一首"><SkipNextRounded /></button>
        </div>
        <button className={'icon-button lyrics-toggle ' + (showLyrics ? 'is-active' : '')} onClick={onToggleLyrics} aria-label={showLyrics ? '隐藏歌词' : '显示歌词'} aria-pressed={showLyrics} title="切换歌词"><LyricsOutlined /></button>
        <div className="volume-control">
          <button className="icon-button" onClick={() => setVolume(volume ? 0 : volumePreferenceRef.current.lastVolume)} aria-label={volume ? '静音' : '取消静音'} title={volume ? '静音' : '取消静音'}>{volume ? <VolumeUpRounded /> : <VolumeOffRounded />}</button>
          <input aria-label="音量" type="range" min="0" max="100" value={volume} style={{ '--volume-percent': volume + '%' } as CSSProperties} onChange={event => setVolume(Number(event.target.value))} />
        </div>
        <button className="icon-button fullscreen-button" onClick={() => void perform(toggleFullscreen)} aria-label={fullscreen ? '退出全屏' : '进入全屏'} title={fullscreen ? '退出全屏' : '进入全屏'}>{fullscreen ? <FullscreenExitRounded /> : <FullscreenRounded />}</button>
      </div>
      <audio key={corsEnabled ? 'cors' : 'native'} ref={bindAudio} crossOrigin={corsEnabled ? 'anonymous' : undefined} hidden onTimeUpdate={event => setCurrentPosition(Math.max(0, event.currentTarget.currentTime * 1000 - audioOffset))} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onError={() => {
        if (audioUrl && corsEnabled) { setNonCorsUrl(audioUrl); return; }
        if (audioUrl) { setIsPlaying(false); setNotice('这首歌暂时无法播放，请重新同步或切换歌曲'); }
      }} />
    </section>
  );
}
