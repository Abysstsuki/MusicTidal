import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Prisma } from '../../generated/prisma';
import { prisma } from '../../utils/prisma';
import { encryptCredential, decryptCredential } from '../../utils/credentialCrypto';
import { createQqMusicClient } from '../../utils/qqmusicHttp';
import { HttpError } from '../../utils/httpError';
import type { BindingStatus } from '../netease/binding.service';
const api = require('../../../vendor/qqmusic');
const qrFailureMessages = {
  qr_poll: 'QQ 扫码状态查询失败，正在重试',
  check_sig: 'QQ 登录票据确认失败，请刷新二维码重试',
  oauth_authorize: 'QQ 音乐授权跳转失败，请刷新二维码重试',
  music_login: 'QQ 音乐登录凭据交换失败，请刷新二维码重试',
};
const qrFailureReasons = new Set(['TIMEOUT', 'NETWORK', 'INVALID_RESPONSE', 'INVALID_JSON', 'UPSTREAM_REJECTED',
  'MISSING_MUSIC_CREDENTIALS', 'INVALID_QR_STATUS', 'INVALID_REDIRECT', 'REDIRECT_LOOP', 'REDIRECT_LIMIT', 'MISSING_P_SKEY', 'MISSING_OAUTH_REDIRECT', 'MISSING_OAUTH_CODE']);
export const QQ_RENEWAL_LEAD_MS = 30 * 60 * 1000;
type StoredCredential = { cookie: string; expiresAt: number | null };
type Renewal = { encrypted: string; expiresAt: number | null; timer: ReturnType<typeof setTimeout> | null;
  controller: AbortController; attempts: number; terminal: boolean; next?: StoredCredential; pending?: Promise<void> };
type Session = { id: string; expiresAt: number; state?: any; pending?: Promise<any>; cookie?: string; keyExpiresAt?: number | null; result?: any };
function storedCredential(encrypted: string): StoredCredential {
  const plaintext = decryptCredential(encrypted);
  if (!plaintext.startsWith('{')) return { cookie: plaintext, expiresAt: api.credentialInfo(plaintext).expiresAt };
  let value;
  try { value = JSON.parse(plaintext); } catch { throw new HttpError(503, 'QQ 音乐授权数据无法读取'); }
  if (value.version !== 1 || typeof value.cookie !== 'string' || !Number.isFinite(value.expiresAt) || value.expiresAt <= 0) {
    throw new HttpError(503, 'QQ 音乐授权数据无法读取');
  }
  return { cookie: value.cookie, expiresAt: value.expiresAt };
}
function encryptedCredential(value: StoredCredential) {
  return encryptCredential(value.expiresAt ? JSON.stringify({ version: 1, ...value }) : value.cookie);
}
export class QqMusicBindingService extends EventEmitter {
  private sessions = new Map<number, Session>();
  private writes = new Map<number, Promise<unknown>>();
  private renewals = new Map<number, Renewal>();
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposed = false;
  private cleanup = setInterval(() => {
    for (const [id, session] of this.sessions) if (session.expiresAt <= Date.now()) this.sessions.delete(id);
  }, 60000);
  constructor(private readonly repository = prisma.user, private readonly transport = { ...api, client: createQqMusicClient }) { super(); this.cleanup.unref(); }
  private async serialize<T>(id: number, work: () => Promise<T>) {
    const task = (this.writes.get(id) || Promise.resolve()).catch(() => {}).then(work);
    this.writes.set(id, task); try { return await task; } finally { if (this.writes.get(id) === task) this.writes.delete(id); }
  }
  async credential(id: number) {
    return this.serialize(id, async () => {
      const user = await this.repository.findUnique({ where: { id }, select: {
        qqmusicCookieEncrypted: true, qqmusicProfile: true, qqmusicBoundAt: true, qqmusicInvalidAt: true } });
      if (!user) throw new HttpError(401, '请重新登录');
      const raw = user.qqmusicProfile as any;
      const binding: BindingStatus = { status: !user.qqmusicCookieEncrypted ? 'unbound' : user.qqmusicInvalidAt ? 'expired' : 'bound',
        profile: raw?.uid ? { uid: String(raw.uid), nickname: String(raw.nickname || ''), avatarUrl: String(raw.avatarUrl || '') } : null,
        boundAt: user.qqmusicBoundAt?.toISOString() || null };
      const stored = binding.status === 'bound' ? storedCredential(user.qqmusicCookieEncrypted!) : null;
      if (stored) this.schedule(id, user.qqmusicCookieEncrypted!, stored);
      else this.cancelRenewal(id);
      return { binding, encrypted: user.qqmusicCookieEncrypted, cookie: stored?.cookie || '' };
    });
  }
  async startAutoRenewal() {
    if (this.started || this.disposed) return;
    this.started = true;
    await this.restoreRenewals();
  }
  private async restoreRenewals() {
    try {
      let after = 0;
      while (!this.disposed) {
        const users = await this.repository.findMany({ where: { id: { gt: after }, qqmusicCookieEncrypted: { not: null }, qqmusicInvalidAt: null },
          select: { id: true }, orderBy: { id: 'asc' }, take: 200 });
        if (!users.length) break;
        for (const user of users) {
          if (this.disposed) return;
          try { await this.credential(user.id); }
          catch { console.warn('Unable to restore a QQ credential renewal timer.'); }
        }
        after = users[users.length - 1].id;
      }
    } catch {
      if (this.disposed) return;
      console.warn('Unable to load QQ renewal timers; retrying in one minute.');
      this.restoreTimer = setTimeout(() => { this.restoreTimer = null; void this.restoreRenewals(); }, 60000);
      this.restoreTimer.unref();
    }
  }
  private cancelRenewal(id: number) {
    const job = this.renewals.get(id);
    if (job?.timer) clearTimeout(job.timer);
    job?.controller.abort();
    this.renewals.delete(id);
  }
  private schedule(id: number, encrypted: string, stored: StoredCredential) {
    if (this.disposed || this.renewals.get(id)?.encrypted === encrypted) return;
    this.cancelRenewal(id);
    if (!api.credentialInfo(stored.cookie).canRefresh) return;
    const job: Renewal = { encrypted, expiresAt: stored.expiresAt, timer: null, controller: new AbortController(), attempts: 0, terminal: false };
    this.renewals.set(id, job);
    this.armRenewal(id, job, (job.expiresAt ?? Date.now()) - QQ_RENEWAL_LEAD_MS - Date.now());
  }
  private armRenewal(id: number, job: Renewal, delay: number) {
    if (this.disposed || this.renewals.get(id) !== job) return;
    if (job.timer) clearTimeout(job.timer);
    job.timer = setTimeout(() => {
      job.timer = null;
      if (this.disposed || this.renewals.get(id) !== job) return;
      if (!job.attempts && job.expiresAt && job.expiresAt - QQ_RENEWAL_LEAD_MS > Date.now()) {
        this.armRenewal(id, job, job.expiresAt - QQ_RENEWAL_LEAD_MS - Date.now()); return;
      }
      if (job.terminal) {
        if (job.expiresAt && job.expiresAt > Date.now()) { this.armRenewal(id, job, job.expiresAt - Date.now()); return; }
        void this.markInvalid(id, job.encrypted).catch(() => this.armRenewal(id, job, 60000));
      } else void this.renew(id, job);
    }, Math.min(2147483647, Math.max(0, delay)));
    job.timer.unref();
  }
  private async renew(id: number, job: Renewal) {
    if (job.pending) return job.pending;
    job.pending = this.completeRenewal(id, job);
    try { await job.pending; } finally { job.pending = undefined; }
  }
  private async completeRenewal(id: number, job: Renewal) {
    try {
      if (this.disposed || this.renewals.get(id) !== job) return;
      const old = storedCredential(job.encrypted);
      job.next ||= await this.transport.refreshCredential(old.cookie, job.controller.signal);
      if (this.disposed || this.renewals.get(id) !== job) return;
      const next = job.next!;
      if (!next.expiresAt || next.expiresAt - QQ_RENEWAL_LEAD_MS <= Date.now()) throw new Error('Invalid QQ renewal expiry');
      const client = this.transport.client(next.cookie);
      try { if (!(await client.profile())?.creator) throw new Error('QQ profile unavailable'); }
      finally { client.dispose?.(); }
      await this.serialize(id, async () => {
        if (this.disposed || this.renewals.get(id) !== job) return;
        const encrypted = encryptedCredential(next);
        const result = await this.repository.updateMany({ where: { id, qqmusicCookieEncrypted: job.encrypted, qqmusicInvalidAt: null },
          data: { qqmusicCookieEncrypted: encrypted } });
        if (!result.count) { this.cancelRenewal(id); return; }
        this.schedule(id, encrypted, next);
        // Renewal is not an account replacement: listeners retain queues and playlist progress.
        this.emit('renewed', id, job.encrypted, { cookie: next.cookie, encrypted });
      });
    } catch (error) {
      if (this.disposed || this.renewals.get(id) !== job) return;
      const problem = (error || {}) as { reason?: string; code?: string; upstreamCode?: number };
      const reason = ['MISSING_REFRESH_TICKETS', 'INVALID_RESPONSE', 'UPSTREAM_REJECTED', 'MISSING_MUSIC_CREDENTIALS', 'MISSING_EXPIRY', 'ACCOUNT_CHANGED', 'TIMEOUT', 'NETWORK']
        .find(value => value === problem.reason || value === problem.code) || 'STORAGE_OR_PROFILE_ERROR';
      console.warn('QQ Music credential renewal failed:', { reason,
        ...(Number.isSafeInteger(problem.upstreamCode) ? { upstreamCode: problem.upstreamCode } : {}) });
      ++job.attempts;
      job.terminal = reason === 'ACCOUNT_CHANGED' || reason === 'MISSING_REFRESH_TICKETS' || [1000, 104400, 104401].includes(Number(problem.upstreamCode));
      // A rejected refresh ticket does not revoke the still-valid audio key early.
      const delay = job.terminal ? Math.max(0, (job.expiresAt ?? Date.now()) - Date.now()) : Math.min(300000, 60000 * 2 ** Math.min(job.attempts - 1, 3));
      this.armRenewal(id, job, delay);
    }
  }
  async status(id: number) { return (await this.credential(id)).binding; }
  waitForRenewal(id: number, encrypted: string): Promise<void> | null {
    const job = this.renewals.get(id);
    return job?.encrypted === encrypted && job.pending ? job.pending : null;
  }
  async createQr(id: number, channel: unknown = 'qq') {
    if (channel !== 'qq' && channel !== 'wechat') throw new HttpError(400, '请选择 QQ 或微信扫码');
    try { encryptCredential('configuration-check'); } catch { throw new HttpError(503, '请设置 NETEASE_COOKIE_ENCRYPTION_KEY 后绑定音乐账号'); }
    const session: Session = { id: randomUUID(), expiresAt: Date.now() + 300000 };
    await this.serialize(id, async () => { this.sessions.set(id, session); });
    try { session.state = await this.transport.createQr(channel); }
    catch { throw new HttpError(502, 'QQ 音乐二维码生成失败，请重试'); }
    if (this.sessions.get(id) !== session) throw new HttpError(409, '二维码已取消');
    const image = session.state.image; delete session.state.image;
    return { sessionId: session.id, expiresAt: session.expiresAt, image };
  }
  async checkQr(id: number, sessionId: string) {
    const session = this.sessions.get(id);
    if (!session || session.id !== sessionId || session.expiresAt <= Date.now()) return { status: 'expired' };
    if (session.result) return session.result;
    if (session.pending) return session.pending;
    session.pending = this.complete(id, session);
    try { return await session.pending; } finally { session.pending = undefined; }
  }
  private async complete(id: number, session: Session) {
    if (!session.cookie) {
      let result;
      try { result = await this.transport.pollQr(session.state); }
      catch (error) {
        const problem = error as { stage?: unknown; reason?: unknown; httpStatus?: unknown; upstreamCode?: unknown; redirectCount?: unknown; redirectTarget?: unknown };
        const stage = typeof problem?.stage === 'string' && Object.prototype.hasOwnProperty.call(qrFailureMessages, problem.stage) ? problem.stage as keyof typeof qrFailureMessages : null;
        console.warn('QQ Music QR binding failed:', {
          stage: stage || 'unknown', reason: typeof problem?.reason === 'string' && qrFailureReasons.has(problem.reason) ? problem.reason : 'UNKNOWN',
          ...(Number.isInteger(problem?.httpStatus) && Number(problem.httpStatus) >= 100 && Number(problem.httpStatus) <= 599 ? { httpStatus: problem.httpStatus } : {}),
          ...(Number.isSafeInteger(problem?.upstreamCode) ? { upstreamCode: problem.upstreamCode } : {}),
          ...(Number.isInteger(problem?.redirectCount) && Number(problem.redirectCount) >= 0 && Number(problem.redirectCount) <= 5 ? { redirectCount: problem.redirectCount } : {}),
          ...(typeof problem?.redirectTarget === 'string' && ['qq_signature', 'qq_oauth', 'other', 'none'].includes(problem.redirectTarget) ? { redirectTarget: problem.redirectTarget } : {}),
        });
        throw new HttpError(502, stage ? qrFailureMessages[stage] : '扫码状态或音乐授权暂时无法获取，正在重试', 'QQMUSIC_QR_POLL_FAILED');
      }
      if (this.sessions.get(id) !== session) return { status: 'expired' };
      if (result.status !== 'authorized') return { status: result.status };
      session.cookie = result.cookie;
      session.keyExpiresAt = result.expiresAt ?? api.credentialInfo(result.cookie).expiresAt;
    }
    const client = this.transport.client(session.cookie); let account;
    try { account = await client.profile(); }
    catch { throw new HttpError(502, '授权已确认，账号信息暂不可用，正在重试', 'QQMUSIC_QR_ACCOUNT_PENDING'); }
    finally { client.dispose?.(); }
    const uid = api.cookies(session.cookie).qqmusic_uin || api.cookies(session.cookie).uin;
    if (!uid || !account?.creator) throw new HttpError(502, 'QQ 音乐账号信息尚未生效', 'QQMUSIC_QR_ACCOUNT_PENDING');
    const profile = { uid, nickname: String(account.creator.nick || account.creator.nickname || ''), avatarUrl: String(account.creator.headpic || account.creator.avatar || '') };
    return this.serialize(id, async () => {
      if (this.sessions.get(id) !== session || session.expiresAt <= Date.now()) return { status: 'expired' };
      const boundAt = new Date();
      const stored = { cookie: session.cookie!, expiresAt: session.keyExpiresAt ?? null };
      const encrypted = encryptedCredential(stored);
      try { await this.repository.update({ where: { id }, data: { qqmusicCookieEncrypted: encrypted,
        qqmusicProfile: profile, qqmusicBoundAt: boundAt, qqmusicInvalidAt: null } }); }
      catch { throw new HttpError(503, 'QQ 音乐绑定保存失败，请确认数据库迁移已完成', 'QQMUSIC_BINDING_SAVE_FAILED'); }
      session.result = { status: 'authorized', binding: { status: 'bound', profile, boundAt: boundAt.toISOString() } };
      this.schedule(id, encrypted, stored);
      session.cookie = ''; session.state = undefined; this.emit('changed', id); return session.result;
    });
  }
  async cancelQr(id: number, sessionId: string) { await this.serialize(id, async () => { if (this.sessions.get(id)?.id === sessionId) this.sessions.delete(id); }); }
  async cancelAll(id: number) { await this.serialize(id, async () => { this.sessions.delete(id); }); }
  async unbind(id: number) {
    await this.serialize(id, async () => { this.sessions.delete(id); await this.repository.update({ where: { id }, data: {
      qqmusicCookieEncrypted: null, qqmusicProfile: Prisma.DbNull, qqmusicBoundAt: null, qqmusicInvalidAt: null } }); this.cancelRenewal(id); this.emit('changed', id); });
  }
  async markInvalid(id: number, encrypted: string) {
    // A request made with the old Key can fail while its replacement is being
    // issued/persisted. Let that renewal commit before comparing the old ciphertext.
    await this.waitForRenewal(id, encrypted);
    await this.serialize(id, async () => { const result = await this.repository.updateMany({ where: { id, qqmusicCookieEncrypted: encrypted, qqmusicInvalidAt: null },
      data: { qqmusicInvalidAt: new Date() } });
      if (this.renewals.get(id)?.encrypted === encrypted) this.cancelRenewal(id);
      if (result.count) this.emit('changed', id);
    });
  }
  dispose() {
    this.disposed = true; clearInterval(this.cleanup); this.sessions.clear();
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    for (const id of this.renewals.keys()) this.cancelRenewal(id);
  }
}
export const qqmusicBindings = new QqMusicBindingService();
