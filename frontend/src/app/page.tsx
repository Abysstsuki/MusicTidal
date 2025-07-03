'use client';

import { Fragment, useState } from 'react';
import MusicPlayer from '@/components/musicplayer';
import MusicLyrics from '@/components/musiclyrics';
import ChatBox from '@/components/chatbox';
import MusicQueue from '@/components/musicqueue';
import UserInfo from '@/components/userinfo';
import OnlineUser from '@/components/onlineuser';
import MusicReq from '@/components/musicreq';

export default function Home() {
  const [activePanel, setActivePanel] = useState<'chat' | 'queue'>('chat');
  const [leftPanel, setLeftPanel] = useState<'info' | 'request'>('info');

  return (
    <Fragment>
      <div className="h-[100vh] grid grid-cols-7 grid-rows-8 gap-3">
        {/* 中间播放器区域 */}
        <div className="col-span-3 row-span-3 col-start-3 row-start-1">
          <div className="w-full h-full flex items-center justify-center">
            <MusicPlayer />
          </div>
        </div>

        {/* 中间歌词区域 */}
        <div className="col-span-3 row-span-5 col-start-3 row-start-4">
          <div className="w-full h-full">
            <MusicLyrics />
          </div>
        </div>

        {/* 左侧：切换 + 显示区 */}
        <div className="col-span-2 row-span-8 col-start-1 row-start-1 flex flex-col p-3 relative">
          {/* 左侧切换标签 */}
          <div className="flex justify-center space-x-4 mb-2">
            <button
              onClick={() => setLeftPanel('info')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                leftPanel === 'info'
                  ? 'bg-white/30 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              在线信息
            </button>
            <button
              onClick={() => setLeftPanel('request')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                leftPanel === 'request'
                  ? 'bg-white/30 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              点歌
            </button>
          </div>

          {/* 左侧内容区域 */}
          <div className="flex-1 w-full h-full relative">
            {/* 在线信息区 */}
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

            {/* 点歌区 */}
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                leftPanel === 'request' ? 'block' : 'hidden'
              }`}
            >
              <MusicReq isVisible={leftPanel === 'request'} />
            </div>
          </div>
        </div>

        {/* 右侧：聊天 / 队列 */}
        <div className="col-span-2 row-span-8 col-start-6 row-start-1 flex flex-col p-3 relative">
          {/* 标签切换栏 */}
          <div className="flex justify-center space-x-4 mb-2">
            <button
              onClick={() => setActivePanel('chat')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                activePanel === 'chat'
                  ? 'bg-white/30 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              聊天
            </button>
            <button
              onClick={() => setActivePanel('queue')}
              className={`px-4 py-1 rounded-full text-sm font-semibold transition-all ${
                activePanel === 'queue'
                  ? 'bg-white/30 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              歌曲队列
            </button>
          </div>

          {/* 内容区 */}
          <div className="flex-1 w-full h-full relative">
            {/* 聊天面板 */}
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                activePanel === 'chat' ? 'block' : 'hidden'
              }`}
            >
              <ChatBox />
            </div>

            {/* 队列面板 */}
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                activePanel === 'queue' ? 'block' : 'hidden'
              }`}
            >
              <MusicQueue />
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
