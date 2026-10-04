'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import CloseRounded from '@mui/icons-material/CloseRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import HeadphonesRounded from '@mui/icons-material/HeadphonesRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import LibraryMusicOutlined from '@mui/icons-material/LibraryMusicOutlined';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import { apiRequest } from '@/lib/api';
import { useToastMessage } from '@/contexts/ToastContext';
import type { NeteaseBinding as Binding } from '@/types/room';
import { providerName, type MusicProvider } from '@/types/music';
import StageDialog from './StageDialog';
import styles from './music-accounts.module.css';
type Qr = { sessionId: string; image: string; expiresAt: number };
function AccountCard({ provider, onChanged }: { provider: MusicProvider; onChanged?: () => Promise<void> }) {
  const base = '/api/user/' + provider, label = providerName(provider);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [qr, setQr] = useState<Qr | null>(null);
  const [channel, setChannel] = useState<'qq' | 'wechat'>('qq');
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const session = useRef<string | null>(null), generation = useRef(0), mounted = useRef(true);
  const changed = useRef(onChanged); changed.current = onChanged;
  useToastMessage(error, { tone: 'error' });
  useEffect(() => {
    mounted.current = true; const controller = new AbortController(), version = generation;
    apiRequest<Binding>(base, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setBinding(value); })
      .catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => { mounted.current = false; ++version.current; controller.abort();
      if (session.current) void apiRequest(base + '/qr/' + session.current, { method: 'DELETE', keepalive: true }).catch(() => {}); };
  }, [base]);
  useEffect(() => {
    if (!qr) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (Date.now() >= qr.expiresAt) { setQr(null); setStatus('二维码已过期，请重新生成'); return; }
      try {
        const result = await apiRequest<{ status: string; binding?: Binding }>(base + '/qr/' + qr.sessionId + '/check', { method: 'POST', signal: controller.signal });
        if (controller.signal.aborted) return;
        setError('');
        if (result.status === 'authorized' && result.binding) {
          setBinding(result.binding); setQr(null); setEditing(false); session.current = null; setStatus('绑定成功');
          window.dispatchEvent(new CustomEvent('music-binding-changed', { detail: { provider } })); await changed.current?.(); return;
        }
        if (result.status === 'expired') { setQr(null); setStatus('二维码已过期或取消，请重新生成'); return; }
        setStatus(result.status === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码');
      } catch (problem) { if (!controller.signal.aborted) setError((problem as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 2000);
    };
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [qr, base, provider]);
  const create = async () => {
    const version = ++generation.current; setBusy(true); setError(''); setStatus(''); setEditing(true); setQr(null);
    try {
      if (session.current) await apiRequest(base + '/qr/' + session.current, { method: 'DELETE' });
      const next = await apiRequest<Qr>(base + '/qr', { method: 'POST', body: JSON.stringify({ channel }) });
      if (!mounted.current || version !== generation.current) { await apiRequest(base + '/qr/' + next.sessionId, { method: 'DELETE' }); return; }
      session.current = next.sessionId; setQr(next); setStatus('等待扫码');
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const cancel = async (keepEditing = false) => { ++generation.current; setQr(null); setEditing(keepEditing); const id = session.current; session.current = null;
    setStatus(keepEditing ? '' : id ? '已取消扫码' : '');
    if (id) await apiRequest(base + '/qr/' + id, { method: 'DELETE' }); };
  const unbind = async () => {
    setBusy(true); setError('');
    try { await cancel(); await apiRequest(base, { method: 'DELETE' });
      if (mounted.current) { setBinding({ status: 'unbound', profile: null, boundAt: null }); setStatus('已解除绑定'); }
      window.dispatchEvent(new CustomEvent('music-binding-changed', { detail: { provider } }));
      await changed.current?.();
    } catch (problem) { if (mounted.current) setError((problem as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const bound = binding?.status === 'bound', expired = binding?.status === 'expired';
  const app = provider === 'netease' ? '网易云音乐 App' : channel === 'qq' ? '手机 QQ' : '微信';
  const scanned = status === '已扫码，请在手机上确认';
  const statusClass = bound ? styles.bound : expired ? styles.expired : '';
  const showSetup = (provider === 'qqmusic' && (!bound || editing)) || (!qr && !bound);
  return <section className={styles.card + ' ' + (provider === 'qqmusic' ? styles.qqmusic : styles.netease)} aria-label={label + '账号'}>
    <div className={styles.accountHeader}>
      <span className={styles.platformIcon} aria-hidden="true">{provider === 'netease' ? <MusicNoteRounded /> : <HeadphonesRounded />}</span>
      <div className={styles.accountCopy}>
        <h3>{label}</h3>
        <p title={binding?.profile?.nickname}>{binding?.profile?.nickname || (binding ? expired ? '授权已过期，重新扫码即可恢复' : '连接你的音乐账号' : '正在读取账号状态…')}</p>
      </div>
      <div className={styles.accountSide}>
        <span className={styles.badge + ' ' + statusClass}>{bound ? <CheckRounded aria-hidden="true" /> : <span className={styles.badgeDot} aria-hidden="true" />}
          {bound ? '已绑定' : expired ? '授权过期' : binding ? '未绑定' : '读取中'}</span>
        {binding && binding.status !== 'unbound' && !qr && <div className={styles.boundActions}>
          {bound && <button className={styles.secondaryButton} disabled={busy} onClick={() => void create()}>
            {busy ? <RefreshRounded className={styles.spinning} aria-hidden="true" /> : <QrCode2Rounded aria-hidden="true" />}{busy ? '正在处理…' : '重新绑定'}</button>}
          <button className={styles.unlinkButton} disabled={busy} onClick={() => void unbind()}><LinkOffRounded aria-hidden="true" />解除绑定</button>
        </div>}
      </div>
    </div>
    {showSetup && <div className={styles.setup}>
      {provider === 'qqmusic' && <div className={styles.channels} role="group" aria-label="QQ 音乐登录方式">
        {(['qq','wechat'] as const).map(value => <button key={value} disabled={busy} aria-pressed={channel === value} className={channel === value ? styles.selected : ''}
          onClick={() => { if (channel === value) return; void cancel(true).catch(problem => setError(problem.message)); setChannel(value); }}>
          {value === 'qq' ? <QrCode2Rounded aria-hidden="true" /> : <ChatBubbleOutlineRounded aria-hidden="true" />}{value === 'qq' ? 'QQ 扫码' : '微信扫码'}</button>)}
      </div>}
      {!qr && !bound && <button className={styles.connectButton} disabled={busy} onClick={() => void create()}>
        {busy ? <RefreshRounded className={styles.spinning} aria-hidden="true" /> : <QrCode2Rounded aria-hidden="true" />}{busy ? '正在生成…' : '扫码绑定'}</button>}
    </div>}
    {qr && <div className={styles.scanArea}>
      <div className={styles.qrPanel}>
        <div className={styles.qrImage}><Image src={qr.image} alt={label + '扫码登录'} width={220} height={220} unoptimized /></div>
        <div className={styles.instructions}>
          <span className={styles.scanKicker}>{bound ? '更换音乐账号' : 'SCAN TO CONNECT'}</span>
          <strong>使用{app}扫码</strong>
          <p>在手机上确认，即可完成绑定。</p>
          <ol><li>打开{app}</li><li>扫描左侧二维码</li><li>确认授权，自动连接</li></ol>
          {bound && <small>确认后将替换当前{label}账号</small>}
        </div>
      </div>
      <div className={styles.scanFooter}>
        <p className={styles.scanStatus + (scanned ? ' ' + styles.scanned : '')} role="status"><span aria-hidden="true" />{status}</p>
        <div className={styles.scanActions}>
          <button className={styles.textButton} disabled={busy} onClick={() => void create()}><RefreshRounded aria-hidden="true" />刷新</button>
          <button className={styles.textButton} disabled={busy} onClick={() => void cancel().catch(problem => setError(problem.message))}>取消扫码</button>
        </div>
      </div>
    </div>}
    {!qr && status && <p className={styles.feedback + (status.includes('过期') ? ' ' + styles.expired : '')} role="status">{status}</p>}
    {error && <p className={styles.error} role="alert"><ErrorOutlineRounded aria-hidden="true" />{error}</p>}
  </section>;
}
export default function NeteaseBinding({ onClose, onChanged }: { onClose: () => void; onChanged?: () => Promise<void> }) {
  return <StageDialog label="音乐账号" onClose={onClose} className={styles.dialog}>
    <div className={styles.header}><div className={styles.title}><span className={styles.titleIcon} aria-hidden="true"><MusicNoteRounded /></span>
      <div><span className={styles.kicker}>MUSIC ACCOUNTS</span><h2>音乐账号</h2></div></div>
      <button className={styles.closeButton} aria-label="关闭绑定" onClick={onClose}><CloseRounded fontSize="small" /></button></div>
    <p className={styles.description}>网易云与 QQ 音乐可以同时绑定。</p>
    <div className={styles.accounts}><AccountCard provider="netease" onChanged={onChanged} /><AccountCard provider="qqmusic" onChanged={onChanged} /></div>
    <div className={styles.footer}><span><LibraryMusicOutlined aria-hidden="true" />个人歌单使用你的账号</span><span><HeadphonesRounded aria-hidden="true" />播放与推荐使用房主账号</span></div>
  </StageDialog>;
}
