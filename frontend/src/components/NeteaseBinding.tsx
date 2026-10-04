'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { apiRequest, ApiError } from '@/lib/api';
import { useToastMessage } from '@/contexts/ToastContext';
import type { NeteaseBinding as Binding } from '@/types/room';
import StageDialog from './StageDialog';
import playlistStyles from './playlist.module.css';

type Qr = { sessionId: string; image: string; expiresAt: number };
export default function NeteaseBinding({ onClose, onChanged }: { onClose: () => void; onChanged?: () => Promise<void> }) {
  const [binding, setBinding] = useState<Binding | null>(null);
  const [qr, setQr] = useState<Qr | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useToastMessage(error, { tone: 'error' });
  useToastMessage(status, { tone: status.includes('过期') ? 'warning' : status.includes('成功') || status.includes('解除') ? 'success' : 'info' });
  const [busy, setBusy] = useState(false);
  const session = useRef<string | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const version = generation;
    const controller = new AbortController();
    apiRequest<Binding>('/api/user/netease', { signal: controller.signal }).then(setBinding).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => {
      mounted.current = false; ++version.current; controller.abort();
      if (session.current) void apiRequest('/api/user/netease/qr/' + session.current, { method: 'DELETE', keepalive: true }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!qr) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      if (Date.now() >= qr.expiresAt) { setQr(null); session.current = null; setStatus('二维码已过期，请重新生成'); return; }
      try {
        const result = await apiRequest<{ status: string; binding?: Binding }>('/api/user/netease/qr/' + qr.sessionId + '/check', { method: 'POST', signal: controller.signal });
        if (stopped) return;
        setError('');
        if (result.status === 'authorized' && result.binding) {
          setBinding(result.binding); setQr(null); session.current = null; setStatus('绑定成功，可以查看自己的网易云歌单');
          await onChanged?.(); return;
        }
        if (result.status === 'expired' || Date.now() >= qr.expiresAt) { setQr(null); session.current = null; setStatus('二维码已过期，请重新生成'); return; }
        setStatus(result.status === 'scanned' ? '已扫码，请在网易云 App 中确认' : '使用网易云 App 扫描二维码');
      } catch (problem) {
        if (!stopped) {
          if (problem instanceof ApiError && ['NETEASE_QR_ACCOUNT_PENDING', 'NETEASE_QR_CREDENTIAL_PENDING', 'NETEASE_BINDING_SAVE_FAILED', 'NETEASE_BINDING_SCHEMA_OUTDATED'].includes(problem.code || '')) setStatus('已收到扫码授权，正在完成绑定');
          setError((problem as Error).message);
        }
      }
      if (!stopped) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [qr, onChanged]);
  const createQr = async () => {
    const version = ++generation.current;
    setBusy(true); setError(''); setQr(null);
    try {
      if (session.current) await apiRequest('/api/user/netease/qr/' + session.current, { method: 'DELETE' });
      const next = await apiRequest<Qr>('/api/user/netease/qr', { method: 'POST' });
      if (!mounted.current || version !== generation.current) {
        await apiRequest('/api/user/netease/qr/' + next.sessionId, { method: 'DELETE' }); return;
      }
      session.current = next.sessionId; setQr(next); setStatus('使用网易云 App 扫描二维码');
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const unbind = async () => {
    ++generation.current; setQr(null); session.current = null; setBusy(true); setError('');
    try {
      await apiRequest('/api/user/netease', { method: 'DELETE' });
      if (mounted.current) { setBinding({ status: 'unbound', profile: null, boundAt: null }); setStatus('已解除绑定'); }
      await onChanged?.();
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const bindingState = binding?.status || 'loading';
  const bindingTitle = binding?.status === 'bound' ? binding.profile?.nickname || '网易云账号' : binding?.status === 'expired' ? binding.profile?.nickname || '授权已过期' : binding ? '尚未绑定网易云账号' : '正在读取账号状态';
  const bindingDetail = binding?.status === 'bound' ? '可查看自己的歌单；担任房主时用于房间播放' : binding?.status === 'expired' ? '请重新扫码，恢复账号授权' : binding ? '可搜索公开歌单，绑定后查看个人歌单' : '请稍候';
  const bindingLabel = binding?.status === 'bound' ? '已绑定' : binding?.status === 'expired' ? '授权过期' : binding ? '游客授权' : '检查中';
  const qrAction = busy ? '正在准备二维码…' : qr ? '刷新二维码' : binding?.status === 'bound' ? '重新扫码绑定' : '扫码绑定';

  return <StageDialog label="绑定网易云账号" onClose={onClose} className="netease-dialog">
    <div className="netease-dialog-header">
      <div className="netease-dialog-title">
        <span className="netease-dialog-icon"><MusicNoteRounded /></span>
        <div><span className="netease-kicker">ACCOUNT CONNECTION</span><h2>网易云音乐账号</h2></div>
      </div>
      <button className={playlistStyles.controlButton} aria-label="关闭绑定" title="关闭绑定" onClick={onClose}><CloseRounded fontSize="small" /></button>
    </div>
    <p className="netease-description">绑定后可查看自己的红心、创建和收藏歌单。作为房主时，房间使用此账号播放并提供心动推荐。</p>

    <div className={'netease-binding-card netease-status-' + bindingState}>
      <span className="netease-binding-indicator" aria-hidden="true" />
      <div className="netease-binding-copy"><strong>{bindingTitle}</strong><span>{bindingDetail}</span></div>
      <span className="netease-binding-label">{bindingLabel}</span>
    </div>

    {qr && <div className="netease-qr-panel">
      <div className="qr-image"><Image src={qr.image} alt="使用网易云 App 扫码登录" width={256} height={256} unoptimized /></div>
      <div className="netease-qr-instructions">
        <strong>使用网易云音乐 App 扫码</strong>
        <span>扫码后请在手机上确认，绑定完成后会自动更新。</span>
      </div>
    </div>}


    <div className={playlistStyles.accountControls} role="group" aria-label="网易云账号操作">
      <button className={playlistStyles.controlButton} aria-label={qrAction} title={qrAction} disabled={busy} onClick={() => void createQr()}>{qr ? <RefreshRounded fontSize="small" /> : <QrCode2Rounded fontSize="small" />}</button><span>{qrAction}</span>
      {binding?.status !== 'unbound' && binding && <button className={playlistStyles.controlButton} aria-label="解除绑定" title="解除绑定" disabled={busy} onClick={() => void unbind()}><LinkOffRounded fontSize="small" /></button>}
    </div>
  </StageDialog>;
}
