import type { RoomSummary } from '@/types/room';
import SongCover from '@/components/modelItem/SongCover';

const privateTitles = ['夜色里的旋律', '听见另一片天空', '缓慢流动的时间', '收藏这一刻', '深夜回响'];
const privateArtists = ['独立音乐人', '声音计划', '城市乐队', '夏日演奏组'];

export default function RoomCardTrack({ room }: { room: RoomSummary }) {
  if (room.locked) {
    // Keep each room's generated placeholder stable across lobby refreshes.
    let seed = 0;
    for (const char of room.id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
    const hue = seed % 360;
    const angle = (seed >>> 16) % 360;
    const cover = `radial-gradient(circle at 28% 20%, hsl(${(hue + 50) % 360} 62% 66%) 0 16%, transparent 52%), linear-gradient(${angle}deg, hsl(${hue} 55% 24%), hsl(${(hue + 85) % 360} 65% 54%))`;

    return (
      <div className="room-card-track room-card-track-locked" role="img" aria-label="密码房间，歌曲详情入房后可见">
        <div className="room-card-private-track" aria-hidden="true">
          <div className="song-cover" style={{ background: cover }} />
          <div className="room-card-private-copy">
            <strong>{privateTitles[seed % privateTitles.length]}</strong>
            <span>{privateArtists[(seed >>> 8) % privateArtists.length]}</span>
          </div>
        </div>
        <span className="room-track-private-label">歌曲详情入房后可见</span>
      </div>
    );
  }

  return (
    <div className="room-card-track">
      <SongCover src={room.currentSong?.prcUrl} />
      <div>
        <strong title={room.currentSong?.name}>{room.currentSong?.name || '等待第一首歌'}</strong>
        <span title={room.currentSong?.artist}>{room.currentSong?.artist || '入房后可以点歌'}</span>
      </div>
    </div>
  );
}
