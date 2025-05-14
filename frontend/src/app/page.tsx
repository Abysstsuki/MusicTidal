'use client';

import MusicPlayer from "@/components/musicplayer";
import { Fragment, useState } from "react";
import FuzzyText from "@/utils/FuzzyText";
import ChatBox from "@/components/chatbox";
import MusicLyrics from "@/components/musiclyrics";
import UserInfo from "@/components/userinfo";
import OnlineUser from "@/components/onlineuser";
import MusicQueue from "@/components/musicqueue"; // 新增引入

export default function Home() {
  const [activePanel, setActivePanel] = useState<'chat' | 'queue'>('chat');

  return (
    <Fragment>
      <div className="h-[100vh] grid grid-cols-7 grid-rows-8 gap-3">
        <div className="col-span-3 row-span-3 col-start-3 row-start-1">
          <div className="w-full h-full flex items-center justify-center">
            <MusicPlayer />
          </div>
        </div>

        <div className="col-span-3 row-span-5 col-start-3 row-start-4">
          <div className="w-full h-full">
            <MusicLyrics />
          </div>
        </div>

        <div className="col-span-2 row-span-4 col-start-1 row-start-1">
          <div className="w-full h-full">
            <UserInfo />
          </div>
        </div>

        <div className="col-span-2 row-span-4 col-start-1 row-start-5">
          <div className="w-full h-full">
            <OnlineUser />
          </div>
        </div>

        <div className="col-span-2 row-span-8 col-start-6 row-start-1 flex flex-col p-3">
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

          {/* 主体区域 */}
          <div className="flex-1 w-full h-full">
            {activePanel === 'chat' ? <ChatBox /> : <MusicQueue />}
          </div>
        </div>
      </div>
    </Fragment>
  );
}
