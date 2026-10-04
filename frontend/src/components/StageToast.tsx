'use client';

import { useEffect, useState } from 'react';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import type { ToastItem } from '@/contexts/ToastContext';

export default function StageToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string, version?: number) => void }) {
  const { id, version, message, tone, expiresAt, detail, countdownUntil } = toast;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setTimeout(() => onDismiss(id, version), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [id, version, expiresAt, onDismiss]);
  useEffect(() => {
    if (!countdownUntil) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [countdownUntil]);
  const seconds = countdownUntil ? Math.max(0, Math.ceil((countdownUntil - now) / 1000)) : null;
  const countdown = seconds === null ? '' : String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  return <div className={'stage-toast is-' + tone} role={tone === 'error' ? 'alert' : 'status'}>
    {tone === 'success' ? <CheckCircleOutlineRounded fontSize="small" /> : tone === 'warning' ? <WarningAmberRounded fontSize="small" /> : <InfoOutlined fontSize="small" />}
    <div className="stage-toast-copy"><span>{seconds === 0 ? '房间正在关闭' : message}</span>{detail && <small>{detail}</small>}</div>
    {seconds !== null && <strong className="stage-toast-countdown" role="timer" aria-live="off" aria-label={'距离房间销毁还有 ' + seconds + ' 秒'}>{countdown}</strong>}
  </div>;
}
