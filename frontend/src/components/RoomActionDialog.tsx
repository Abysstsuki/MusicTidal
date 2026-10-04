'use client';

import type { FormEvent } from 'react';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import type { RoomSummary } from '@/types/room';
import { useToastMessage } from '@/contexts/ToastContext';
import ActiveRoomChoice from './ActiveRoomChoice';
import StageDialog from './StageDialog';

export type RoomAction = { kind: 'create' } | { kind: 'join'; room: RoomSummary };

interface Props {
  action: RoomAction;
  active: RoomSummary | null;
  name: string;
  password: string;
  busy: boolean;
  error: string;
  onNameChange: (name: string) => void;
  onPasswordChange: (password: string) => void;
  onClose: () => void;
  onCreate: (event: FormEvent) => void;
  onJoin: () => void;
  onLeft: () => void;
}

export default function RoomActionDialog({ action, active, name, password, busy, error, onNameChange, onPasswordChange, onClose, onCreate, onJoin, onLeft }: Props) {
  const creating = action.kind === 'create';
  const room = action.kind === 'join' ? action.room : null;
  const switching = !!active && (creating || active.id !== room?.id);
  useToastMessage(switching ? '' : error, { tone: 'error' });
  const formAction = creating || room?.locked;
  const close = () => { if (!busy) onClose(); };
  const footer = <div className="room-dialog-footer">
    <div className="room-dialog-actions">
      <button className="pill-button" type="button" disabled={busy} onClick={close}>取消</button>
      <button className="primary-button" type={formAction ? 'submit' : 'button'} disabled={busy} onClick={formAction ? undefined : onJoin}>
        {busy ? <><span className="room-dialog-spinner" aria-hidden="true" />{creating ? '正在创建…' : '正在加入…'}</> : <>{creating ? '创建并进入' : '进入房间'}<ArrowForwardRounded fontSize="small" /></>}
      </button>
    </div>
  </div>;

  return <StageDialog label={creating ? '创建房间' : '加入房间'} className="room-action-dialog" closeOnBackdrop={!busy} onClose={close}>
    <div className="room-dialog-header">
      <div className="room-dialog-title">
        <span className="room-dialog-icon" aria-hidden="true">{creating ? <AddRounded /> : room?.locked ? <LockOutlined /> : <HeadphonesRounded />}</span>
        <div><span className="room-dialog-kicker">{creating ? '开启一起听' : '加入房间'}</span><h2>{creating ? '创建你的房间' : room?.name}</h2></div>
      </div>
      <button className="icon-button" type="button" disabled={busy} aria-label="关闭房间操作" onClick={close}><CloseRounded /></button>
    </div>

    {room && <div className="room-dialog-meta"><span className="room-dialog-host">房主 · {room.host.username}</span><span>{room.onlineCount} 人在线</span><span className="room-dialog-access">{room.locked ? '密码保护' : '开放房间'}</span></div>}
    <p className="room-dialog-description">{switching ? '你已加入另一个房间，请先选择接下来的操作。' : creating ? '给房间起个名字，邀请朋友一起听歌。' : room?.locked ? '输入房间密码，加入大家的同步播放。' : '与房间成员同步听歌，共享队列和聊天。'}</p>

    {switching && active ? <ActiveRoomChoice room={active} onLeft={onLeft} /> : creating ? <form className="room-dialog-form" onSubmit={onCreate}>
      <label>房间名称<input required maxLength={60} disabled={busy} value={name} onChange={event => onNameChange(event.target.value)} placeholder="给房间起个名字" /></label>
      <label><span>房间密码 <small>可选</small></span><input type="password" autoComplete="new-password" disabled={busy} value={password} onChange={event => onPasswordChange(event.target.value)} placeholder="留空即可自由加入" /></label>
      <p className="room-dialog-hint">创建后你将成为房主，音乐账号可稍后绑定。</p>
      {footer}
    </form> : room?.locked ? <form className="room-dialog-form" onSubmit={event => { event.preventDefault(); onJoin(); }}>
      <label>房间密码<input required type="password" autoComplete="off" disabled={busy} value={password} onChange={event => onPasswordChange(event.target.value)} placeholder="输入房主提供的密码" /></label>
      {footer}
    </form> : <>
      <div className="room-dialog-status" role="status" aria-live="polite">
        <span className="room-dialog-status-icon" aria-hidden="true"><GraphicEqRounded /></span>
        <div><strong>{busy ? '正在连接房间' : error ? '暂时无法加入' : '准备开始一起听'}</strong><p>{busy ? '连接完成后，将自动进入听歌页面。' : error ? '请稍后重试，或返回大厅选择其他房间。' : '加入后，你的播放进度会与大家同步。'}</p></div>
      </div>
      {footer}
    </>}
  </StageDialog>;
}
