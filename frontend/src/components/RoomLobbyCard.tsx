'use client';

import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import type { RoomSummary } from '@/types/room';
import RoomCardTrack from './RoomCardTrack';

interface Props {
  room: RoomSummary;
  current: boolean;
  disabled: boolean;
  joining: boolean;
  onEnter: () => void;
}

export default function RoomLobbyCard({ room, current, disabled, joining, onEnter }: Props) {
  const permanent = room.kind === 'super';
  const away = !permanent && Boolean(room.hostDisconnectedUntil);
  const label = current ? '返回房间' : room.locked ? '输入密码' : '进入房间';
  return <article className={'room-card' + (permanent ? ' super-room-card' : '') + (current ? ' room-card-current' : '')} aria-labelledby={'room-name-' + room.id}>
    <div className="room-card-heading">
      <span className={'room-listening' + (room.onlineCount ? ' is-online' : '')}><HeadphonesRounded fontSize="small" /><strong>{room.onlineCount}</strong> 人在线</span>
      {permanent ? <span className="super-room-badge"><StarRounded />超级房间</span>
        : <span className="room-access">{room.locked ? <LockOutlined /> : <LockOpenRounded />}{room.locked ? '密码房间' : '开放房间'}</span>}
    </div>
    <div className="room-card-copy">
      <h3 id={'room-name-' + room.id} title={room.name}>{room.name}</h3>
      <p className="room-host" title={permanent ? '常驻公共房间 · 无房主 · 全员协作' : '房主 · ' + room.host?.username}>
        {permanent ? <><span className="room-permanent-dot" aria-hidden="true" />常驻公共房间<span className="room-meta-separator" aria-hidden="true">·</span>无房主 · 全员协作</>
          : <><PersonOutlineRounded />房主<span className="room-host-name">{room.host?.username || '暂不可用'}</span></>}
      </p>
    </div>
    <RoomCardTrack room={room} />
    <div className="room-card-footer">
      <span className={'room-card-note' + (away ? ' is-away' : '')}>
        {away ? <><AccessTimeRounded />房主暂离，等待重连</> : current ? '你已在这个房间' : permanent ? '点歌 / 歌单播放' : room.locked ? '加入需提供密码' : '无需密码，自由加入'}
      </span>
      <button className="room-enter" disabled={disabled} aria-label={label + ' · ' + room.name} onClick={onEnter}>
        {joining ? <><span className="lobby-spinner" aria-hidden="true" />正在进入</> : <>{label}<ArrowForwardRounded fontSize="small" /></>}
      </button>
    </div>
  </article>;
}
