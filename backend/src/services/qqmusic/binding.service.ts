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
type Session = { id: string; expiresAt: number; state?: any; pending?: Promise<any>; cookie?: string; result?: any };
export class QqMusicBindingService extends EventEmitter {
  private sessions = new Map<number, Session>();
  private writes = new Map<number, Promise<unknown>>();
  private cleanup = setInterval(() => {
    for (const [id, session] of this.sessions) if (session.expiresAt <= Date.now()) this.sessions.delete(id);
  }, 60000);
  constructor(private readonly repository = prisma.user, private readonly transport = { ...api, client: createQqMusicClient }) { super(); this.cleanup.unref(); }
  private async serialize<T>(id: number, work: () => Promise<T>) {
    const task = (this.writes.get(id) || Promise.resolve()).catch(() => {}).then(work);
    this.writes.set(id, task); try { return await task; } finally { if (this.writes.get(id) === task) this.writes.delete(id); }
  }
  async credential(id: number) {
    const user = await this.repository.findUnique({ where: { id }, select: {
      qqmusicCookieEncrypted: true, qqmusicProfile: true, qqmusicBoundAt: true, qqmusicInvalidAt: true } });
    if (!user) throw new HttpError(401, '请重新登录');
    const raw = user.qqmusicProfile as any;
    const binding: BindingStatus = { status: !user.qqmusicCookieEncrypted ? 'unbound' : user.qqmusicInvalidAt ? 'expired' : 'bound',
      profile: raw?.uid ? { uid: String(raw.uid), nickname: String(raw.nickname || ''), avatarUrl: String(raw.avatarUrl || '') } : null,
      boundAt: user.qqmusicBoundAt?.toISOString() || null };
    return { binding, encrypted: user.qqmusicCookieEncrypted, cookie: binding.status === 'bound' ? decryptCredential(user.qqmusicCookieEncrypted!) : '' };
  }
  async status(id: number) { return (await this.credential(id)).binding; }
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
      try { await this.repository.update({ where: { id }, data: { qqmusicCookieEncrypted: encryptCredential(session.cookie!),
        qqmusicProfile: profile, qqmusicBoundAt: boundAt, qqmusicInvalidAt: null } }); }
      catch { throw new HttpError(503, 'QQ 音乐绑定保存失败，请确认数据库迁移已完成', 'QQMUSIC_BINDING_SAVE_FAILED'); }
      session.result = { status: 'authorized', binding: { status: 'bound', profile, boundAt: boundAt.toISOString() } };
      session.cookie = ''; session.state = undefined; this.emit('changed', id); return session.result;
    });
  }
  async cancelQr(id: number, sessionId: string) { await this.serialize(id, async () => { if (this.sessions.get(id)?.id === sessionId) this.sessions.delete(id); }); }
  async cancelAll(id: number) { await this.serialize(id, async () => { this.sessions.delete(id); }); }
  async unbind(id: number) {
    await this.serialize(id, async () => { this.sessions.delete(id); await this.repository.update({ where: { id }, data: {
      qqmusicCookieEncrypted: null, qqmusicProfile: Prisma.DbNull, qqmusicBoundAt: null, qqmusicInvalidAt: null } }); this.emit('changed', id); });
  }
  async markInvalid(id: number, encrypted: string) {
    await this.serialize(id, async () => { const result = await this.repository.updateMany({ where: { id, qqmusicCookieEncrypted: encrypted, qqmusicInvalidAt: null },
      data: { qqmusicInvalidAt: new Date() } }); if (result.count) this.emit('changed', id); });
  }
  dispose() { clearInterval(this.cleanup); this.sessions.clear(); }
}
export const qqmusicBindings = new QqMusicBindingService();
