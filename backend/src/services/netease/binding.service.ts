import { EventEmitter } from 'events';
import { randomBytes, randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { Prisma } from '../../generated/prisma';
import { prisma } from '../../utils/prisma';
import { encryptCredential, decryptCredential } from '../../utils/credentialCrypto';
import { callNeteaseModule, createNeteaseClient, NeteaseApiError } from '../../utils/neteaseHttp';
import { HttpError } from '../../utils/httpError';

export type BindingStatus = {
  status: 'unbound' | 'bound' | 'expired';
  profile: { uid: string; nickname: string; avatarUrl: string } | null;
  boundAt: string | null;
};
type QrSession = {
  id: string; expiresAt: number; key: string; cookie: string; confirmed?: boolean;
  pending?: Promise<unknown>; result?: { status: 'authorized'; binding: BindingStatus };
};

// Set-Cookie attributes must never become request-cookie names.
export function mergeCookies(previous: string, headers: string[]) {
  const pairs = new Map<string, string>();
  for (const part of [...previous.split(';'), ...headers.map(header => header.split(';')[0])]) {
    const index = part.indexOf('=');
    if (index > 0) pairs.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return [...pairs].map(([name, value]) => name + '=' + value).join('; ');
}

export class NeteaseBindingService extends EventEmitter {
  private sessions = new Map<number, QrSession>();
  private writes = new Map<number, Promise<unknown>>();
  private cleanup: ReturnType<typeof setInterval>;
  constructor(private readonly repository = prisma.user,
    private readonly transport = { call: callNeteaseModule, client: createNeteaseClient }) {
    super();
    this.cleanup = setInterval(() => {
      for (const [userId, session] of this.sessions) if (session.expiresAt <= Date.now()) this.sessions.delete(userId);
    }, 60_000);
    this.cleanup.unref();
  }
  private async serialize<T>(userId: number, work: () => Promise<T>): Promise<T> {
    const task = (this.writes.get(userId) || Promise.resolve()).catch(() => {}).then(work);
    this.writes.set(userId, task);
    try { return await task; }
    finally { if (this.writes.get(userId) === task) this.writes.delete(userId); }
  }
  async credential(userId: number) {
    const user = await this.repository.findUnique({ where: { id: userId }, select: {
      neteaseCookieEncrypted: true, neteaseProfile: true, neteaseBoundAt: true, neteaseInvalidAt: true,
    } });
    if (!user) throw new HttpError(401, '请重新登录');
    const raw = user.neteaseProfile as Record<string, unknown> | null;
    const profile = raw && typeof raw.uid === 'string' ? {
      uid: raw.uid, nickname: String(raw.nickname || ''), avatarUrl: String(raw.avatarUrl || ''),
    } : null;
    const binding: BindingStatus = {
      status: !user.neteaseCookieEncrypted ? 'unbound' : user.neteaseInvalidAt ? 'expired' : 'bound',
      profile, boundAt: user.neteaseBoundAt?.toISOString() || null,
    };
    return { binding, encrypted: user.neteaseCookieEncrypted,
      cookie: binding.status === 'bound' ? decryptCredential(user.neteaseCookieEncrypted!) : '' };
  }
  async status(userId: number): Promise<BindingStatus> { return (await this.credential(userId)).binding; }

  async createQr(userId: number) {
    // Validate configuration before the user scans an unusable QR code.
    try { encryptCredential('configuration-check'); }
    catch { throw new HttpError(503, '网易云绑定尚未配置，请设置 NETEASE_COOKIE_ENCRYPTION_KEY'); }
    const device = randomBytes(16).toString('hex');
    const session: QrSession = { id: randomUUID(), expiresAt: Date.now() + 5 * 60_000, key: '',
      cookie: 'os=pc; appver=3.1.17.204416; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease; deviceId=' + device };
    await this.serialize(userId, async () => { this.sessions.set(userId, session); });
    const response = await this.transport.call('/login/qr/key', session.cookie, { timestamp: Date.now() });
    session.key = response.body?.unikey || response.body?.data?.unikey || '';
    if (!session.key || response.body?.code !== 200) throw new HttpError(502, '二维码生成失败，请重试');
    session.cookie = mergeCookies(session.cookie, response.cookie || []);
    const url = 'https://music.163.com/login?codekey=' + encodeURIComponent(session.key);
    const image = await QRCode.toDataURL(url, { width: 256, margin: 2 });
    if (this.sessions.get(userId) !== session) throw new HttpError(409, '二维码已取消');
    return { sessionId: session.id, image, expiresAt: session.expiresAt };
  }
  async checkQr(userId: number, id: string) {
    const session = this.sessions.get(userId);
    if (!session || session.id !== id || session.expiresAt <= Date.now()) return { status: 'expired' };
    if (session.result) return session.result;
    if (session.pending) return session.pending;
    session.pending = this.completeQr(userId, session);
    try { return await session.pending; }
    finally { session.pending = undefined; }
  }
  private async completeQr(userId: number, session: QrSession) {
    if (!session.confirmed) {
      let response;
      try {
        response = await this.transport.call('/login/qr/check', session.cookie, { key: session.key, noCookie: 'true', timestamp: Date.now() });
      } catch (error) {
        this.logFailure('poll', error);
        throw new HttpError(502, '扫码状态暂时无法获取，正在重试', 'NETEASE_QR_POLL_FAILED');
      }
      if (this.sessions.get(userId) !== session) return { status: 'expired' };
      session.cookie = mergeCookies(session.cookie, response.cookie || []);
      switch (Number(response.body?.code)) {
        case 800: this.sessions.delete(userId); return { status: 'expired' };
        case 801: return { status: 'waiting' };
        case 802: return { status: 'scanned' };
        case 803: break;
        default: throw new HttpError(502, '授权状态暂时无法获取，请稍后重试', 'NETEASE_QR_POLL_FAILED');
      }
      if (!/(?:^|;\s*)MUSIC_U=([^;]+)/.test(session.cookie)) {
        throw new HttpError(502, '已收到扫码确认，正在等待网易云返回登录凭据', 'NETEASE_QR_CREDENTIAL_PENDING');
      }
      session.confirmed = true;
    }
    const cookie = session.cookie;
    let account;
    try {
      const response = (await this.transport.client(cookie).get('/login/status', { params: { timestamp: Date.now() } })).data;
      account = response?.data || response;
      if (Number(account?.code) !== 200) throw new NeteaseApiError(Number(account?.code) || 502);
    } catch (error) {
      this.logFailure('account', error);
      throw new HttpError(502, '已收到扫码授权，账号信息校验暂时失败，正在重试', 'NETEASE_QR_ACCOUNT_PENDING');
    }
    const uid = account.profile?.userId || account.account?.id;
    if (!uid || !account.profile) throw new HttpError(502, '已收到扫码授权，正在等待账号信息生效', 'NETEASE_QR_ACCOUNT_PENDING');
    const profile = { uid: String(uid), nickname: String(account.profile.nickname || ''), avatarUrl: String(account.profile.avatarUrl || '') };
    const encrypted = encryptCredential(cookie);
    return this.serialize(userId, async () => {
      if (this.sessions.get(userId) !== session || session.expiresAt <= Date.now()) return { status: 'expired' };
      try {
        await this.repository.update({ where: { id: userId }, data: {
          neteaseCookieEncrypted: encrypted, neteaseProfile: profile, neteaseBoundAt: new Date(), neteaseInvalidAt: null,
        } });
      } catch (error) {
        this.logFailure('save', error);
        const schemaMissing = /^P202[12]$/.test(String((error as { code?: unknown })?.code));
        throw new HttpError(503, schemaMissing ? '绑定存储尚未完成初始化，请先完成数据库迁移' : '授权已确认，保存绑定暂时失败，正在重试',
          schemaMissing ? 'NETEASE_BINDING_SCHEMA_OUTDATED' : 'NETEASE_BINDING_SAVE_FAILED');
      }
      session.result = { status: 'authorized', binding: { status: 'bound', profile, boundAt: new Date().toISOString() } };
      session.cookie = ''; session.key = '';
      this.emit('changed', userId);
      return session.result;
    });
  }
  private logFailure(stage: 'poll' | 'account' | 'save', error: unknown) {
    const code = error instanceof NeteaseApiError ? error.code : String((error as { code?: unknown })?.code || '');
    // Only known numeric/API codes: never log the error body, SQL, Cookie or credentials.
    console.warn('Netease QR binding failed:', { stage, code: typeof code === 'number' || /^P\d{4}$/.test(code) ? code : 'UNKNOWN' });
  }
  async cancelQr(userId: number, id: string) {
    await this.serialize(userId, async () => { if (this.sessions.get(userId)?.id === id) this.sessions.delete(userId); });
  }
  async cancelAll(userId: number) {
    await this.serialize(userId, async () => { this.sessions.delete(userId); });
  }
  async unbind(userId: number) {
    await this.serialize(userId, async () => {
      this.sessions.delete(userId);
      await this.repository.update({ where: { id: userId }, data: {
        neteaseCookieEncrypted: null, neteaseProfile: Prisma.DbNull, neteaseBoundAt: null, neteaseInvalidAt: null,
      } });
      this.emit('changed', userId);
    });
  }
  async markInvalid(userId: number, encrypted: string) {
    await this.serialize(userId, async () => {
      const result = await this.repository.updateMany({ where: { id: userId, neteaseCookieEncrypted: encrypted, neteaseInvalidAt: null }, data: { neteaseInvalidAt: new Date() } });
      if (result.count) this.emit('changed', userId);
    });
  }
  dispose() { clearInterval(this.cleanup); this.sessions.clear(); }
}

export const neteaseBindings = new NeteaseBindingService();
