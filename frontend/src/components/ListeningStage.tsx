'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { useToast } from '@/contexts/ToastContext';
import { ApiError } from '@/lib/api';
import NeteaseBinding from './NeteaseBinding';
import LeaveRoomDialog from './LeaveRoomDialog';
import RoomClosureNotice from './RoomClosureNotice';
import PlaylistBrowser from './PlaylistBrowser';

type Panel = 'chat' | 'queue' | 'search' | 'playlist' | null;

function StageBackground({ src }: { src?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <Image className={'stage-background ' + (loaded ? 'is-loaded' : '')} src={src} alt="" aria-hidden="true" draggable={false} fill priority sizes="100vw" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />;
}

export default function ListeningStage() {
  const { currentSong, connection, queue, room, user, isHost, leaveRoom, syncPlayback } = useMusicContext();
  const { showToast } = useToast();
  const [showBinding, setShowBinding] = useState(false);
  const previousHostDeadline = useRef(room?.hostDisconnectedUntil);
  useEffect(() => {
    if (previousHostDeadline.current && !room?.hostDisconnectedUntil) showToast('房主已返回，房间销毁倒计时已取消', { tone: 'success' });
    previousHostDeadline.current = room?.hostDisconnectedUntil;
  }, [room?.hostDisconnectedUntil, showToast]);
  const [showLeave, setShowLeave] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const requestLeave = () => { if (!leaving) { setLeaveError(''); setShowLeave(true); } };
  const leave = async () => {
    if (leaving) return;
    setLeaving(true); setLeaveError('');
    try { await leaveRoom(); }
    catch (error) {
      setLeaveError(error instanceof ApiError ? error.message : error instanceof TypeError
        ? '网络连接失败，请检查网络后重试' : '暂时无法离开房间，请稍后重试');
      setLeaving(false);
    }
  };
  const invite = async () => {
    if (!room || !user) return;
    if (room.locked && !room.inviteToken) {
      showToast('邀请信息尚未就绪，请刷新房间后重试', { tone: 'error' });
      return;
    }
    try {
      const link = new URL('/room', window.location.origin);
      link.searchParams.set('roomId', room.id);
      if (room.locked && room.inviteToken) link.hash = new URLSearchParams({ inviteToken: room.inviteToken }).toString();
      await navigator.clipboard.writeText(`【${user.username}】邀请你加入【${room.name}】一起听歌，${link.href}`);
      showToast('邀请链接已复制', { tone: 'success' });
    } catch { showToast('复制失败，请重试', { tone: 'error' }); }
  };
  const [panel, setPanel] = useState<Panel>('chat');
  const [mountedPanels, setMountedPanels] = useState<Exclude<Panel, null>[]>(['chat']);
  const [showLyrics, setShowLyrics] = useState(true);
  const stageRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closePanel = () => {
    setPanel(null);
    triggerRef.current?.focus();
  };
  const togglePanel = (next: Exclude<Panel, null>, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setMountedPanels(items => items.includes(next) ? items : [...items, next]);
    setPanel(value => value === next ? null : next);
  };
  useLayoutEffect(() => {
    const stage = stageRef.current, controls = controlsRef.current, popover = panelRef.current;
    if (!panel || !stage || !controls || !popover) return;
    const updateBounds = () => {
      const bottom = Number.parseFloat(window.getComputedStyle(popover).bottom) || 0;
      const available = stage.getBoundingClientRect().bottom - bottom - controls.getBoundingClientRect().bottom - 12;
      popover.style.setProperty('--stage-panel-max-height', Math.max(0, Math.floor(available)) + 'px');
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(stage); observer.observe(controls);
    window.addEventListener('resize', updateBounds);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateBounds); };
  }, [panel]);
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
  const status = { connected: '同步中', connecting: '连接中', reconnecting: '重新连接', offline: '等待连接' }[connection];

  return (
    <main className="music-stage" ref={stageRef}>
      <StageBackground key={currentSong?.prcUrl || 'empty'} src={currentSong?.prcUrl} />
      <div className="stage-shade" aria-hidden="true" />
      <div className="stage-controls" ref={controlsRef}>
        <header className="stage-header">
          <Link className="wordmark" href="/" aria-label="离开房间并返回大厅" onClick={event => { event.preventDefault(); requestLeave(); }}>Music<span>Tidal</span></Link>
          <div className={'connection-status ' + (connection === 'connected' ? 'is-connected' : '')} role="status">
            <GraphicEqRounded fontSize="small" /><span>{status}</span><i />
          </div>
          <div className="header-actions">
            <OnlineUser />
            <button className="pill-button request-button" onClick={event => togglePanel('search', event.currentTarget)} aria-expanded={panel === 'search'} aria-controls="stage-panel-search">
              <MusicNoteRounded fontSize="small" /><span>点歌</span>
            </button>
            <button className="pill-button request-button" aria-label="歌单" title="音乐歌单" onClick={event => togglePanel('playlist', event.currentTarget)} aria-expanded={panel === 'playlist'} aria-controls="stage-panel-playlist"><QueueMusicRounded fontSize="small" /><span>歌单</span></button>
            <UserInfo />
          </div>
        </header>
        <div className="room-toolbar">
          <div><strong>{room?.name}</strong><span>{room?.kind === 'super' ? '无房主 · 全员协作' : isHost ? '你是房主' : '房主 · ' + room?.host?.username}</span></div>
          <span className={'room-auth-state' + (room?.kind === 'super' ? ' super-room-auth' : '')}>{room?.enabledProviders?.length ? (room.kind === 'super' ? '公共播放授权 · ' : '房主授权 · ') + room.enabledProviders.map(provider => provider === 'qqmusic' ? 'QQ 音乐' : '网易云').join(' / ') : room?.kind === 'super' ? '公共播放授权暂不可用' : '房主尚未绑定音乐账号'}</span>
          <button className="pill-button" onClick={() => void invite()}>邀请</button>
          <button className="pill-button" onClick={() => setShowBinding(true)}>音乐账号</button>
          <button className="pill-button" disabled={leaving} onClick={requestLeave}>{leaving ? '正在离开…' : '离开房间'}</button>
        </div>
      </div>
      {room?.hostDisconnectedUntil && <RoomClosureNotice deadline={room.hostDisconnectedUntil} roomId={room.id} />}

      <section className="track-heading" aria-label="当前歌曲">
        <p className="eyebrow">NOW PLAYING</p>
        <h1>{currentSong?.name || '等待第一首歌'}</h1>
        {currentSong?.artist && <p className="track-artist">{currentSong.artist}</p>}
      </section>

      {showLyrics && <MusicLyrics />}

      <nav className="stage-tools" aria-label="听歌互动">
        <button className={'pill-button chat-launch ' + (panel === 'chat' ? 'is-active' : '')} onClick={event => togglePanel('chat', event.currentTarget)} aria-expanded={panel === 'chat'} aria-controls="stage-panel-chat">
          <ChatBubbleOutlineRounded fontSize="small" /><span>聊天</span>
        </button>
        <button className={'pill-button ' + (panel === 'queue' ? 'is-active' : '')} onClick={event => togglePanel('queue', event.currentTarget)} aria-expanded={panel === 'queue'} aria-controls="stage-panel-queue">
          <QueueMusicRounded fontSize="small" /><span>待播</span><span className="queue-count">{String(queue.length).padStart(2, '0')}</span>
        </button>
      </nav>

      {mountedPanels.map(item => (
        <aside key={item} id={'stage-panel-' + item} hidden={panel !== item} style={panel !== item ? { display: 'none' } : undefined} className={'stage-popover popover-' + item} ref={panel === item ? panelRef : undefined} aria-label={item === 'playlist' ? '音乐歌单' : item === 'search' ? '搜索与点歌' : item === 'queue' ? '待播队列' : '聊天'}>
          <div className="popover-heading">
            <h2>{item === 'playlist' ? <><QueueMusicRounded />音乐歌单</> : item === 'search' ? <><MusicNoteRounded />点歌</> : item === 'queue' ? <><QueueMusicRounded />待播队列 <span>{queue.length}</span></> : <><ChatBubbleOutlineRounded />聊天</>}</h2>
            <button className="icon-button" data-close-panel aria-label="关闭面板" title="关闭面板" onClick={closePanel}><CloseRounded /></button>
          </div>
          {item === 'chat' && <ChatBox />}
          {item === 'queue' && <MusicQueue isVisible={panel === item} />}
          {item === 'search' && <MusicReq isVisible={panel === item} />}
          {item === 'playlist' && <div className="search-content"><PlaylistBrowser visible={panel === item} /></div>}
        </aside>
      ))}

      <MusicPlayer showLyrics={showLyrics} onToggleLyrics={() => setShowLyrics(value => !value)} />
      {showLeave && <LeaveRoomDialog name={room?.name || '当前房间'} isHost={isHost} graceMs={room?.hostGracePeriodMs} busy={leaving} error={leaveError} onClose={() => setShowLeave(false)} onConfirm={() => void leave()} />}
      {showBinding && <NeteaseBinding onClose={() => setShowBinding(false)} onChanged={syncPlayback} />}
    </main>
  );
}
