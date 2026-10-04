'use client';

import CloseRounded from '@mui/icons-material/CloseRounded';
import StageDialog from './StageDialog';
import { useToastMessage } from '@/contexts/ToastContext';

export default function LeaveRoomDialog({ name, isHost, graceMs = 180000, busy, error, onClose, onConfirm }: {
  name: string; isHost: boolean; graceMs?: number; busy: boolean; error?: string; onClose: () => void; onConfirm: () => void;
}) {
  const minutes = graceMs / 60000;
  useToastMessage(error, { tone: 'error' });
  return <StageDialog label="确认离开房间" onClose={() => { if (!busy) onClose(); }}>
    <div className="auth-header"><h2>离开房间</h2><button className="icon-button" aria-label="取消离开" disabled={busy} onClick={onClose}><CloseRounded /></button></div>
    <div className="leave-room-content">
      <p>确认离开「{name}」？</p>
      <p className="panel-description">{isHost ? `你是房主。离开后房间将保留 ${minutes} 分钟，到期自动销毁。期间重新加入可取消销毁倒计时，其他成员可继续听歌与聊天。` : '离开后将返回房间大厅，同一账号的其他房间标签页也会退出。'}</p>
      <div className="dialog-actions"><button className="pill-button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? '正在离开…' : '确认离开'}</button></div>
    </div>
  </StageDialog>;
}
