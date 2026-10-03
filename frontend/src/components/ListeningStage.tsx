'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import QueueMusicRounded from '@mui/icons-material/QueueMusicRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MusicPlayer from '@/components/musicplayer';
import MusicLyrics from '@/components/musiclyrics';
import ChatBox from '@/components/chatbox';
import MusicQueue from '@/components/musicqueue';
import UserInfo from '@/components/userinfo';
import OnlineUser from '@/components/onlineuser';
import MusicReq from '@/components/musicreq';
import { useMusicContext } from '@/contexts/MusicContext';
import NeteaseBinding from './NeteaseBinding';

type Panel = 'chat' | 'queue' | 'search' | null;

function StageBackground({ src }: { src?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <Image className={'stage-background ' + (loaded ? 'is-loaded' : '')} src={src} alt="" aria-hidden="true" fill priority sizes="100vw" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />;
}

export default function ListeningStage() {
  const { currentSong, connection, queue, isPreview, room, isHost, leaveRoom, notice, syncPlayback } = useMusicContext();
  const [showBinding, setShowBinding] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const leave = async () => { setLeaving(true); try { await leaveRoom(); } catch (error) { setActionNotice((error as Error).message); setLeaving(false); } };
  const invite = async () => { try { await navigator.clipboard.writeText(window.location.origin + '/room?roomId=' + room?.id); setActionNotice('邀请链接已复制'); } catch { setActionNotice('请复制浏览器中的房间链接'); } };
  const [panel, setPanel] = useState<Panel>('chat');
  const [showLyrics, setShowLyrics] = useState(true);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closePanel = () => {
    setPanel(null);
    triggerRef.current?.focus();
  };
  const togglePanel = (next: Exclude<Panel, null>, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setPanel(value => value === next ? null : next);
  };
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1100px)');
    const collapse = () => { if (media.matches) setPanel(null); };
    collapse();
    media.addEventListener('change', collapse);
    return () => media.removeEventListener('change', collapse);
  }, []);
  useEffect(() => {
    if (!panel) return;
    if (triggerRef.current) {
      const target = panel === 'search' ? 'input' : '[data-close-panel]';
      panelRef.current?.querySelector<HTMLElement>(target)?.focus();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);
  const status = isPreview ? '视觉预览' : { connected: '同步中', connecting: '连接中', reconnecting: '重新连接', offline: '等待连接' }[connection];

  return (
    <main className="music-stage">
      <StageBackground key={currentSong?.prcUrl || 'empty'} src={currentSong?.prcUrl} />
      <div className="stage-shade" aria-hidden="true" />
      <header className="stage-header">
        <Link className="wordmark" href="/" aria-label="退出房间并返回大厅" onClick={event => { event.preventDefault(); void leave(); }}>Music<span>Tidal</span></Link>
        <div className={'connection-status ' + (connection === 'connected' ? 'is-connected' : '')} role="status">
          <GraphicEqRounded fontSize="small" /><span>{status}</span><i />
        </div>
        <div className="header-actions">
          <OnlineUser />
          <button className="pill-button request-button" onClick={event => togglePanel('search', event.currentTarget)} aria-expanded={panel === 'search'} aria-controls="stage-panel">
            <MusicNoteRounded fontSize="small" /><span>点歌</span>
          </button>
          <UserInfo isPreview={isPreview} />
        </div>
      </header>
      <div className="room-toolbar">
        <div><strong>{room?.name || '视觉预览'}</strong><span>{isHost ? '你是房主' : '房主 · ' + room?.host.username}</span></div>
        <span className="room-auth-state">{room?.binding.status === 'bound' ? '网易云 · ' + room.binding.profile?.nickname : room?.binding.status === 'expired' ? '网易云授权已过期' : '游客播放授权'}</span>
        {!isPreview && <button className="pill-button" onClick={() => void invite()}>邀请</button>}
        {!isPreview && isHost && <button className="pill-button" onClick={() => setShowBinding(true)}>网易云账号</button>}
        <button className="pill-button" disabled={leaving} onClick={() => void leave()}>{leaving ? '正在退出…' : isHost && !isPreview ? '结束房间' : '退出房间'}</button>
      </div>
      {(notice || actionNotice || room?.hostDisconnectedUntil) && <div className="room-banner" role="status">{room?.hostDisconnectedUntil ? '房主暂时离线，将保留至 ' + new Date(room.hostDisconnectedUntil).toLocaleTimeString('zh-CN') + '，重连后继续' : notice || actionNotice}</div>}

      <section className="track-heading" aria-label="当前歌曲">
        <p className="eyebrow">NOW PLAYING</p>
        <h1>{currentSong?.name || '等待第一首歌'}</h1>
        {currentSong?.artist && <p className="track-artist">{currentSong.artist}</p>}
        {isPreview && <p className="track-note">演示歌曲 · 仅供视觉预览</p>}
      </section>

      {showLyrics && <MusicLyrics />}

      <nav className="stage-tools" aria-label="听歌互动">
        <button className={'pill-button chat-launch ' + (panel === 'chat' ? 'is-active' : '')} onClick={event => togglePanel('chat', event.currentTarget)} aria-expanded={panel === 'chat'} aria-controls="stage-panel">
          <ChatBubbleOutlineRounded fontSize="small" /><span>聊天</span>
        </button>
        <button className={'pill-button ' + (panel === 'queue' ? 'is-active' : '')} onClick={event => togglePanel('queue', event.currentTarget)} aria-expanded={panel === 'queue'} aria-controls="stage-panel">
          <QueueMusicRounded fontSize="small" /><span>待播</span><span className="queue-count">{String(queue.length).padStart(2, '0')}</span>
        </button>
      </nav>

      {panel && (
        <aside id="stage-panel" className={'stage-popover popover-' + panel} ref={panelRef} aria-label={panel === 'search' ? '搜索与点歌' : panel === 'queue' ? '待播队列' : '聊天'}>
          <div className="popover-heading">
            <h2>{panel === 'search' ? <><MusicNoteRounded />点歌</> : panel === 'queue' ? <><QueueMusicRounded />待播队列 <span>{queue.length}</span></> : <><ChatBubbleOutlineRounded />聊天</>}</h2>
            <button className="icon-button" data-close-panel aria-label="关闭面板" title="关闭面板" onClick={closePanel}><CloseRounded /></button>
          </div>
          {panel === 'chat' && <ChatBox />}
          {panel === 'queue' && <MusicQueue />}
          {panel === 'search' && <MusicReq isVisible />}
        </aside>
      )}

      <MusicPlayer showLyrics={showLyrics} onToggleLyrics={() => setShowLyrics(value => !value)} />
      {isPreview && <button className="preview-label" onClick={() => window.location.assign('/')}>视觉预览 · 返回大厅</button>}
      {showBinding && <NeteaseBinding onClose={() => setShowBinding(false)} onChanged={syncPlayback} />}
    </main>
  );
}
