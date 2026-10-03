'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import type { RoomSummary } from '@/types/room';

export default function ActiveRoomChoice({ room, onLeft }: { room: RoomSummary; onLeft: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const leave = async () => {
    setBusy(true); setError('');
    try { await apiRequest('/api/rooms/' + room.id + '/leave', { method: 'POST' }); onLeft(); }
    catch (problem) { setError((problem as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="active-room-choice"><p>你已加入「{room.name}」</p>
    {user?.id === room.host.id && <p className="panel-description">结束原房间后，原房间的所有成员会返回大厅。</p>}
    <div className="dialog-actions"><a className="pill-button" href={'/room?roomId=' + room.id}>返回原房间</a>
      <button className="pill-button" disabled={busy} onClick={() => void leave()}>{busy ? '正在退出…' : user?.id === room.host.id ? '结束原房间' : '退出原房间'}</button></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
