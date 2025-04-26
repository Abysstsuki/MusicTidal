'use client';

import MusicPlayer from "@/components/musicplayer";
import { Fragment } from "react";
import FuzzyText from "@/utils/FuzzyText";
import ChatBox from "@/components/chatbox";
import MusicIyrics from "@/components/musiclyrics";
import UserInfo from "@/components/userinfo";
import OnlineUser from "@/components/onlineuser";

export default function Home() {
  return (
    <Fragment>

      <div className="h-[100vh] grid grid-cols-7 grid-rows-8 gap-3">

        <div className="col-span-3 row-span-4 col-start-3 row-start-1">
          {/* <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2"> */}
          <div className="w-full h-full flex items-center justify-center">
            <MusicPlayer></MusicPlayer>
          </div>
        </div>

        <div className="col-span-3 row-span-4 col-start-3 row-start-5">
          <div className="w-full h-full">
            <MusicIyrics></MusicIyrics>
          </div>
        </div>

        <div className="col-span-2 row-span-4 col-start-1 row-start-1">
          <div className="w-full h-full">
            <UserInfo></UserInfo>
          </div>
        </div>

        <div className="col-span-2 row-span-4 col-start-1 row-start-5">
          <div className="w-full h-full">
            <OnlineUser></OnlineUser>
          </div>
        </div>

        <div className="col-span-2 row-span-8 col-start-6 row-start-1">
          <div className="w-full h-full">
            <ChatBox></ChatBox>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
