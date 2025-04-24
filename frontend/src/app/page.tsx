import MusicPlayer from "@/components/musicplayer";
import { Fragment } from "react";

export default function Home() {
  return (
    <Fragment>
      <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <MusicPlayer></MusicPlayer>
        </div>
    </Fragment>
  );
}
