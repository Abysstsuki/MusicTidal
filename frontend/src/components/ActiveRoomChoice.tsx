'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import type { RoomSummary } from '@/types/room';
import LeaveRoomDialog from './LeaveRoomDialog';

export default function ActiveRoomChoice({ room, onLeft }: { room: RoomSummary; onLeft: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const isHost = Boolean(room.host && user?.id === room.host.id);
  const leave = async () => {
    setBusy(true); setError('');
    try { await apiRequest('/api/rooms/' + room.id + '/leave', { method: 'POST' }); setConfirming(false); onLeft(); }
    catch (problem) { setError((problem as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="active-room-choice"><p>你已加入「{room.name}」</p>
    {isHost && <p className="panel-description">房主离开后，原房间保留 {(room.hostGracePeriodMs || 180000) / 60000} 分钟，到期自动销毁。</p>}
    <div className="dialog-actions"><a className="pill-button" href={'/room?roomId=' + room.id}>返回原房间</a>
      <button className="pill-button" disabled={busy} onClick={() => { setError(''); setConfirming(true); }}>{busy ? '正在离开…' : '离开原房间'}</button></div>
    {confirming && <LeaveRoomDialog name={room.name} isHost={isHost} graceMs={room.hostGracePeriodMs} busy={busy} error={error} onClose={() => setConfirming(false)} onConfirm={() => void leave()} />}
  </div>;
}
