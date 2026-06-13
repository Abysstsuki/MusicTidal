'use client';

import { Fragment, useState } from 'react';
import MusicPlayer from '@/components/musicplayer';
import MusicLyrics from '@/components/musiclyrics';
import ChatBox from '@/components/chatbox';
import MusicQueue from '@/components/musicqueue';
import UserInfo from '@/components/userinfo';
import OnlineUser from '@/components/onlineuser';
import MusicReq from '@/components/musicreq';
import MobileTabBar from '@/components/MobileTabBar';
import { useIsMobile } from '@/hooks/useIsMobile';
import { MusicProvider, useMusicContext } from '@/contexts/MusicContext';

type MobileTab = 'info' | 'request' | 'lyrics' | 'chat' | 'queue';

function BackgroundLayer() {
    const { currentSong } = useMusicContext();

    return (
        <>
            {currentSong?.prcUrl && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: -2,
                        backgroundImage: `url(${currentSong.prcUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(40px) saturate(1.2)',
                        transform: 'scale(1.1)',
                        opacity: 0.42,
                        transition: 'background-image 1s ease',
                        pointerEvents: 'none',
                    }}
                />
            )}
            <div
                className="grid-overlay"
                style={{
                    position: 'fixed', inset: 0, zIndex: currentSong?.prcUrl ? -3 : -1,
                    opacity: currentSong?.prcUrl ? 0.18 : 0.85,
                    pointerEvents: 'none',
                }}
            />
        </>
    );
}

export default function Home() {
  const [activePanel, setActivePanel] = useState<'chat' | 'queue'>('chat');
  const [leftPanel, setLeftPanel] = useState<'info' | 'request'>('info');
  const [mobileTab, setMobileTab] = useState<MobileTab>('info');
  const isMobile = useIsMobile();

  const tabClass = (isActive: boolean) =>
    `text-[9px] tracking-[0.3em] uppercase px-4 py-1 transition-all home-tab ${
      isActive ? 'home-tab-active' : ''
    }`;

  return (
    <MusicProvider>
      <BackgroundLayer />
      <div className="home-grid">
        {/* ============ Desktop/Tablet Layout ============ */}
        {!isMobile && (
          <>
            {/* Left Panel */}
            <div className="grid-area-left flex flex-col p-3 relative min-w-0">
              <div className="flex justify-center space-x-4 mb-2 flex-shrink-0">
                <button
                  onClick={() => setLeftPanel('info')}
                  className={tabClass(leftPanel === 'info')}
                >
                  在线信息
                </button>
                <button
                  onClick={() => setLeftPanel('request')}
                  className={tabClass(leftPanel === 'request')}
                >
                  点歌
                </button>
              </div>
              <div className="flex-1 w-full relative min-h-0">
                <div
                  className={`absolute inset-0 transition-opacity duration-300 ${
                    leftPanel === 'info' ? 'block' : 'hidden'
                  }`}
                >
                  <div className="h-1/2 w-full">
                    <UserInfo />
                  </div>
                  <div className="h-1/2 w-full">
                    <OnlineUser />
                  </div>
                </div>
                <div
                  className={`absolute inset-0 transition-opacity duration-300 ${
                    leftPanel === 'request' ? 'block' : 'hidden'
                  }`}
                >
                  <MusicReq isVisible={leftPanel === 'request'} />
                </div>
              </div>
            </div>

            {/* Lyrics */}
            <div className="grid-area-lyrics">
              <div className="w-full h-full">
                <MusicLyrics />
              </div>
            </div>

            {/* Right Panel */}
            <div className="grid-area-right flex flex-col p-3 relative min-w-0">
              <div className="flex justify-center space-x-4 mb-2 flex-shrink-0">
                <button
                  onClick={() => setActivePanel('chat')}
                  className={tabClass(activePanel === 'chat')}
                >
                  聊天
                </button>
                <button
                  onClick={() => setActivePanel('queue')}
                  className={tabClass(activePanel === 'queue')}
                >
                  歌曲队列
                </button>
              </div>
              <div className="flex-1 w-full relative min-h-0">
                <div
                  className={`absolute inset-0 transition-opacity duration-300 ${
                    activePanel === 'chat' ? 'block' : 'hidden'
                  }`}
                >
                  <ChatBox />
                </div>
                <div
                  className={`absolute inset-0 transition-opacity duration-300 ${
                    activePanel === 'queue' ? 'block' : 'hidden'
                  }`}
                >
                  <MusicQueue />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ============ Player (all breakpoints) ============ */}
        <div className="grid-area-player">
          <div className="w-full h-full flex items-center justify-center">
            <MusicPlayer />
          </div>
        </div>

        {/* ============ Mobile Layout ============ */}
        {isMobile && (
          <>
            {/* Mobile content panel */}
            {mobileTab === 'info' && (
              <div className="mobile-panel-visible">
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0">
                    <UserInfo />
                  </div>
                  <div className="flex-1 min-h-0">
                    <OnlineUser />
                  </div>
                </div>
              </div>
            )}

            {mobileTab === 'request' && (
              <div className="mobile-panel-visible">
                <MusicReq isVisible={true} />
              </div>
            )}

            {mobileTab === 'lyrics' && (
              <div className="mobile-panel-visible">
                <MusicLyrics />
              </div>
            )}

            {mobileTab === 'chat' && (
              <div className="mobile-panel-visible">
                <ChatBox />
              </div>
            )}

            {mobileTab === 'queue' && (
              <div className="mobile-panel-visible">
                <MusicQueue />
              </div>
            )}

            {/* Mobile TabBar */}
            <MobileTabBar activeTab={mobileTab} onTabChange={setMobileTab} />
          </>
        )}
      </div>
    </MusicProvider>
  );
}
