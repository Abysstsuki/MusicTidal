'use client';

import { useEffect, useState } from 'react';

export default function RoomClosureNotice({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const countdown = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  return <div className="room-banner room-closure-notice">
    <span>房主已离开，{seconds ? '房间销毁倒计时' : '房间正在关闭'}</span>
    <strong role="timer" aria-live="off" aria-label={'距离房间销毁还有 ' + seconds + ' 秒'}>{countdown}</strong>
    <span>房主重新加入后取消倒计时</span>
  </div>;
}
