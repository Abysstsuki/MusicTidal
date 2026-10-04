'use client';

import { useToastMessage } from '@/contexts/ToastContext';

export default function RoomClosureNotice({ deadline, roomId }: { deadline: number; roomId: string }) {
  useToastMessage('房主已离开，房间销毁倒计时', { id: 'room-close-' + roomId, tone: 'warning', duration: null,
    detail: '房主重新加入后取消倒计时', countdownUntil: deadline });
  return null;
}
