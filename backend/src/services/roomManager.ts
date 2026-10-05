import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';
import { createNeteaseClient, type NeteaseClient } from '../utils/neteaseHttp';
import { HttpError } from '../utils/httpError';
import { neteaseBindings, type BindingStatus } from './netease/binding.service';
import { getSongPlayInfo } from './netease/song.service';
import { HeartModeSession } from './netease/recommendation.service';
import { SongQueueService } from './songQueueService';
import { playlistCatalog } from './netease/playlist.service';
import { qqmusicPlaylistCatalog } from './qqmusic/playlist.service';
import { qqmusicBindings } from './qqmusic/binding.service';
import { createQqMusicClient, QqMusicClient } from '../utils/qqmusicHttp';
import type { MusicProvider } from '../types/song';
import { providerName, neteaseSong, qqSong } from './music/song';
import { prisma } from '../utils/prisma';

export const RECONNECT_GRACE_MS = 180_000;
export const SUPER_ROOM_ID = 'super-room';
export const SUPER_ROOM_ACCOUNT_USERNAME = 'Abyss';
export const SUPER_ROOM_RECOMMENDATIONS_DISABLED = '超级房间仅支持点歌与歌单播放，所有自动推荐续播均已禁用。';
export type RoomKind = 'normal' | 'super';
export type RoomUser = { id: number; username: string };
export type RoomEvent = { type: string; roomId: string; revision: number; payload: any };
export interface RoomConnection { send(event: RoomEvent): void; close(): void }
type Member = RoomUser & { connections: Set<RoomConnection>; expiresAt: number | null; timer: ReturnType<typeof setTimeout> | null };
type Credential = { cookie: string; encrypted: string | null; binding: BindingStatus };
type QqDependencies = { credentials: (id: number) => Promise<Credential>; invalidate: (id: number, encrypted: string) => Promise<void>;
  clientFactory: typeof createQqMusicClient; waitForRenewal?: (id: number, encrypted: string) => Promise<void> | null };

export class Room {
  readonly queue: SongQueueService;
  readonly host: RoomUser | null;
  authorizationUserId: number | null;
  private readonly inviteToken: string | null;
  readonly members = new Map<number, Member>();
  readonly messages: { id: string; userId: number; username: string; text: string }[] = [];
  client: NeteaseClient = createNeteaseClient('');
  binding: BindingStatus = { status: 'unbound', profile: null, boundAt: null };
  qqmusicBinding: BindingStatus = { status: 'unbound', profile: null, boundAt: null };
  qqmusicClient: QqMusicClient = createQqMusicClient('');
  anonymousClient: NeteaseClient = createNeteaseClient('');
  anonymousQqmusicClient: QqMusicClient = createQqMusicClient('');
  qqmusicVersion = 0;
  qqmusicEncrypted: string | null = null;
  qqmusicAuthorizationTask: Promise<void> | null = null;
  revision = 0;
  closed = false;
  credentialVersion = 0;
  authorizationTask: Promise<void> | null = null;
  constructor(readonly id: string, readonly name: string, host: RoomUser | null, readonly passwordHash: string | null, readonly kind: RoomKind = 'normal') {
    this.host = host ? { id: host.id, username: host.username } : null;
    this.authorizationUserId = host?.id ?? null;
    this.inviteToken = passwordHash ? randomBytes(32).toString('hex') : null;
    this.queue = new SongQueueService({
      recommendationsDisabledReason: kind === 'super' ? SUPER_ROOM_RECOMMENDATIONS_DISABLED : null,
      authorizationChangedReason: kind === 'super' ? '公共播放授权已变化，请重新激活歌单' : undefined,
      unavailableReason: song => this.providerUnavailableReason(song.provider || 'netease'),
      canPlaySong: song => this.bindingFor(song.provider || 'netease').status === 'bound',
      getPlayInfo: async (id, song) => {
        const provider = song?.provider || 'netease';
        await (provider === 'netease' ? this.authorizationTask : this.qqmusicAuthorizationTask);
        this.requireProvider(provider);
        if (this.closed) throw new HttpError(404, '房间已结束', 'ROOM_CLOSED');
        return provider === 'qqmusic' ? this.qqmusicClient.play(song!) : getSongPlayInfo(id, this.client);
      },
      createHeartSession: initial => new HeartModeSession(initial, this.client),
      createRecommendationSession: (provider, initial) => {
        if (provider === 'netease') return new HeartModeSession(initial, this.client);
        const client = this.qqmusicClient; let previous: number[] = [];
        return { nextSongs: async () => { const songs = await client.roam(previous); previous = songs.map(song => song.id); return songs; } };
      },
      getPlaylistSong: async candidate => {
        const catalog = candidate.provider === 'qqmusic' ? qqmusicPlaylistCatalog : playlistCatalog;
        this.requireProvider(candidate.provider || 'netease');
        if (this.kind === 'super') {
          if (candidate.provider === 'qqmusic') return (await this.qqmusicClient.details([candidate.songId])).map(qqSong)[0];
          const { data } = await this.client.get('/song/detail', { params: { ids: String(candidate.songId) } });
          const raw = data?.songs?.find((song: any) => Number(song.id) === candidate.songId);
          return raw ? neteaseSong(raw, data.privileges?.find((song: any) => Number(song.id) === candidate.songId)) : undefined;
        }
        await catalog.index(candidate.userId, candidate.playlistId);
        return (await catalog.songs(candidate.userId, [candidate.songId]))[0];
      },
      emit: event => this.broadcast(event.type, event.payload),
    });
  }
  summary() {
    const song = this.queue.getCurrentSong()?.song;
    return { id: this.id, name: this.name, kind: this.kind, host: this.host, locked: Boolean(this.passwordHash),
      onlineCount: this.onlineMembers().length,
      currentSong: song ? { id: song.id, provider: song.provider || 'netease', access: song.access, trial: song.trial, name: song.name, artist: song.artist, prcUrl: song.prcUrl } : null,
      hostDisconnectedUntil: this.host ? this.members.get(this.host.id)?.expiresAt || null : null,
      hostGracePeriodMs: this.host ? RECONNECT_GRACE_MS : 0 };
  }
  onlineMembers() { return [...this.members.values()].filter(member => member.connections.size > 0).map(member => ({ id: member.id, username: member.username, isHost: member.id === this.host?.id })); }
  get catalogClient() { return this.kind === 'super' ? this.anonymousClient : this.client; }
  get catalogQqmusicClient() { return this.kind === 'super' ? this.anonymousQqmusicClient : this.qqmusicClient; }
  bindingFor(provider: MusicProvider) { return provider === 'netease' ? this.binding : this.qqmusicBinding; }
  providerUnavailableReason(provider: MusicProvider) {
    return this.kind === 'super' ? `超级房间${providerName(provider)}播放授权暂不可用` : `房主尚未有效绑定${providerName(provider)}`;
  }
  requireProvider(provider: MusicProvider) {
    if (this.bindingFor(provider).status !== 'bound') throw new HttpError(409, this.providerUnavailableReason(provider), 'MUSIC_BINDING_REQUIRED');
  }
  info() {
    const publicBinding = (binding: BindingStatus): BindingStatus => this.kind === 'super' ? { status: binding.status, profile: null, boundAt: null } : binding;
    return { ...this.summary(), binding: publicBinding(this.binding), bindings: { netease: publicBinding(this.binding), qqmusic: publicBinding(this.qqmusicBinding) },
    enabledProviders: (['netease', 'qqmusic'] as MusicProvider[]).filter(provider => this.bindingFor(provider).status === 'bound'), inviteToken: this.inviteToken }; }
  acceptsInvite(token: unknown) {
    return Boolean(this.inviteToken && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
      && timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(this.inviteToken, 'hex')));
  }
  state() {
    return { room: this.info(), revision: this.revision,
      playback: this.queue.getPlayback(), queue: this.queue.getQueue(), recommendations: this.queue.getRecommendationState(),
      playlists: this.queue.getPlaylistState(),
      members: this.onlineMembers(), messages: [...this.messages] };
  }
  broadcast(type: string, payload: unknown) {
    if (this.closed) return;
    const event = { type, roomId: this.id, revision: ++this.revision, payload };
    for (const member of this.members.values()) for (const connection of member.connections) {
      try { connection.send(event); } catch { /* Heartbeat owns dead-connection cleanup. */ }
    }
  }
  changed() { this.broadcast('ROOM_UPDATED', this.info()); this.broadcast('update', this.onlineMembers()); }
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private activeByUser = new Map<number, string>();
  private superRoomTask: Promise<void> | null = null;
  private superRoomRetry: ReturnType<typeof setTimeout> | null = null;
  private superRoomReady = false;
  private superRoomLoadedProviders = new Set<MusicProvider>();
  private disposed = false;
  constructor(private readonly credentials: (userId: number) => Promise<Credential> = id => neteaseBindings.credential(id),
    private readonly invalidate: (userId: number, encrypted: string) => Promise<void> = (id, encrypted) => neteaseBindings.markInvalid(id, encrypted),
    private readonly clientFactory = createNeteaseClient,
    private readonly qq?: QqDependencies,
    private readonly superRoomAccount: (username: string) => Promise<{ id: number } | null> = username => prisma.user.findUnique({ where: { username }, select: { id: true } })) {}

  async initializeSuperRoom(): Promise<Room> {
    if (this.disposed) throw new HttpError(503, '服务已停止');
    let room = this.rooms.get(SUPER_ROOM_ID);
    if (!room) {
      room = new Room(SUPER_ROOM_ID, '超级房间', null, null, 'super');
      this.rooms.set(room.id, room);
    }
    if (!this.superRoomReady && !this.superRoomTask) {
      this.superRoomTask = this.loadSuperRoomAuthorization(room).finally(() => { this.superRoomTask = null; });
    }
    await this.superRoomTask;
    return room;
  }

  private async loadSuperRoomAuthorization(room: Room) {
    try {
      const account = await this.superRoomAccount(SUPER_ROOM_ACCOUNT_USERNAME);
      if (this.disposed || room.closed) return;
      if (!account) throw new Error('Super room account unavailable');
      if (room.authorizationUserId !== account.id) this.superRoomLoadedProviders.clear();
      room.authorizationUserId = account.id;
      const pending = (['netease', 'qqmusic'] as const).filter(provider => !this.superRoomLoadedProviders.has(provider));
      const results = await Promise.allSettled(pending.map(async provider => {
        await (provider === 'netease' ? this.refreshRoomAuthorization(room, account.id) : this.refreshQqAuthorization(room, account.id));
        this.superRoomLoadedProviders.add(provider);
      }));
      if (results.some(result => result.status === 'rejected')) throw new Error('Super room authorization unavailable');
      if (this.disposed || room.closed) return;
      this.superRoomReady = true;
      if (this.superRoomRetry) clearTimeout(this.superRoomRetry);
      this.superRoomRetry = null;
    } catch {
      if (this.disposed || room.closed || this.superRoomRetry) return;
      console.warn('Unable to load super room playback authorization; retrying in 30 seconds.');
      this.superRoomRetry = setTimeout(() => {
        this.superRoomRetry = null;
        void this.initializeSuperRoom().catch(() => {});
      }, 30_000);
      this.superRoomRetry.unref?.();
    }
  }

  list() {
    return [...this.rooms.values()].sort((a, b) => Number(b.kind === 'super') - Number(a.kind === 'super')).map(room => {
      const summary = room.summary();
      return { ...summary, currentSong: summary.locked ? null : summary.currentSong };
    });
  }
  get(id: string) {
    const room = this.rooms.get(id);
    if (!room || room.closed) throw new HttpError(404, '房间已结束或不存在', 'ROOM_CLOSED');
    return room;
  }
  active(userId: number) { const id = this.activeByUser.get(userId); return id ? this.rooms.get(id)?.summary() || null : null; }
  private ensureAvailable(userId: number, roomId?: string) {
    const active = this.activeByUser.get(userId);
    if (active && active !== roomId) throw new HttpError(409, '你已加入其他房间，请先退出原房间', 'ACTIVE_ROOM');
  }
  member(id: string, userId: number) {
    const room = this.get(id);
    if (!room.members.has(userId) || this.activeByUser.get(userId) !== id) throw new HttpError(403, '请先加入房间', 'NOT_MEMBER');
    return room;
  }
  host(id: string, userId: number) {
    const room = this.member(id, userId);
    if (room.host?.id !== userId) throw new HttpError(403, '只有房主可以执行此操作');
    return room;
  }
  playbackController(id: string, userId: number) {
    const room = this.member(id, userId);
    return room.kind === 'super' ? room : this.host(id, userId);
  }
  async create(user: RoomUser, name: unknown, password?: unknown) {
    this.ensureAvailable(user.id);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new HttpError(400, '房间名称需要 1–60 个字符');
    if (password !== undefined && (typeof password !== 'string' || Buffer.byteLength(password) > 72)) throw new HttpError(400, '密码过长');
    const hash = password ? await bcrypt.hash(password as string, 10) : null;
    const credential = await this.credentials(user.id);
    const qqCredential = this.qq ? await this.qq.credentials(user.id) : null;
    this.ensureAvailable(user.id);
    const room = new Room(randomUUID(), name.trim(), user, hash);
    this.rooms.set(room.id, room);
    this.applyCredential(room, credential);
    if (qqCredential) this.applyQqCredential(room, qqCredential);
    this.addMember(room, user);
    return room;
  }
  async join(id: string, user: RoomUser, password?: unknown, inviteToken?: unknown) {
    let room = this.get(id);
    this.ensureAvailable(user.id, id);
    if (room.members.has(user.id)) {
      // A departed host keeps only a reconnect reservation, not room access.
      this.activeByUser.set(user.id, id);
      return room;
    }
    if (room.passwordHash && !room.acceptsInvite(inviteToken)) {
      if (inviteToken !== undefined && inviteToken !== null && inviteToken !== '') throw new HttpError(403, '邀请凭据无效，请输入房间密码', 'ROOM_INVITE');
      if (typeof password !== 'string' || Buffer.byteLength(password) > 72 || !await bcrypt.compare(password, room.passwordHash)) throw new HttpError(403, '房间密码不正确', 'ROOM_PASSWORD');
    }
    room = this.get(id); // The host can leave while password verification runs.
    this.ensureAvailable(user.id, id);
    if (!room.members.has(user.id)) this.addMember(room, user);
    return room;
  }
  private addMember(room: Room, user: RoomUser) {
    const member: Member = { id: user.id, username: user.username, connections: new Set(), expiresAt: null, timer: null };
    room.members.set(user.id, member); this.activeByUser.set(user.id, room.id);
    this.scheduleExpiry(room, member); room.changed();
  }
  private scheduleExpiry(room: Room, member: Member) {
    if (member.timer) clearTimeout(member.timer);
    member.expiresAt = Date.now() + RECONNECT_GRACE_MS;
    member.timer = setTimeout(() => {
      if (room.closed || room.members.get(member.id) !== member || member.connections.size) return;
      if (member.id === room.host?.id) this.destroy(room.id, '房主离开超过 3 分钟，房间已销毁');
      else this.leave(room.id, member.id);
    }, RECONNECT_GRACE_MS);
    member.timer.unref?.();
  }
  connect(id: string, userId: number, connection: RoomConnection) {
    const room = this.member(id, userId);
    const member = room.members.get(userId)!;
    if (member.timer) clearTimeout(member.timer);
    member.timer = null; member.expiresAt = null; member.connections.add(connection);
    room.changed();
    connection.send({ type: 'ROOM_SNAPSHOT', roomId: id, revision: room.revision, payload: room.state() });
  }
  disconnect(id: string, userId: number, connection: RoomConnection) {
    const room = this.rooms.get(id); const member = room?.members.get(userId);
    if (!room || room.closed || !member || !member.connections.delete(connection)) return;
    if (!member.connections.size) this.scheduleExpiry(room, member);
    room.changed();
  }
  leave(id: string, userId: number) {
    const room = this.rooms.get(id); const member = room?.members.get(userId);
    if (!room || !member || this.activeByUser.get(userId) !== id) return;
    if (member.timer) clearTimeout(member.timer);
    this.activeByUser.delete(userId);
    const connections = [...member.connections];
    member.connections.clear();
    if (userId === room.host?.id) this.scheduleExpiry(room, member);
    else room.members.delete(userId);
    for (const connection of connections) {
      try { connection.send({ type: 'ROOM_CLOSED', roomId: id, revision: ++room.revision, payload: { reason: '你已离开房间' } }); }
      catch { /* Cleanup must continue if a departed connection cannot receive. */ }
      try { connection.close(); } catch { /* Already closed. */ }
    }
    room.changed();
  }
  destroy(id: string, reason: string, shutdown = false) {
    const room = this.rooms.get(id);
    if (!room || room.closed || (room.kind === 'super' && !shutdown)) return;
    room.broadcast('ROOM_CLOSED', { reason }); room.closed = true;
    room.queue.dispose(); ++room.credentialVersion;
    room.client.dispose?.();
    ++room.qqmusicVersion; room.qqmusicClient.dispose();
    room.anonymousClient.dispose?.(); room.anonymousQqmusicClient.dispose();
    this.rooms.delete(id);
    for (const member of room.members.values()) {
      if (member.timer) clearTimeout(member.timer);
      if (this.activeByUser.get(member.id) === id) this.activeByUser.delete(member.id);
      for (const connection of member.connections) connection.close();
      member.connections.clear();
    }
    room.members.clear(); room.messages.splice(0);
  }
  chat(id: string, userId: number, text: unknown) {
    const room = this.member(id, userId); const member = room.members.get(userId)!;
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new HttpError(400, '消息需要 1–2000 个字符');
    const message = { id: randomUUID(), userId, username: member.username, text: text.trim() };
    room.messages.push(message); if (room.messages.length > 25) room.messages.shift();
    room.broadcast('chat', message);
  }
  private applyCredential(room: Room, credential: Credential) {
    const userId = room.authorizationUserId;
    const version = ++room.credentialVersion;
    room.client.dispose?.(true);
    room.binding = credential.binding;
    room.client = this.clientFactory(credential.cookie, () => {
      if (room.closed || version !== room.credentialVersion || !credential.encrypted) return;
      ++room.credentialVersion;
      room.binding = { ...room.binding, status: 'expired' }; room.client.dispose?.(true); room.client = this.clientFactory('');
      room.queue.resetAuthorization('netease'); room.changed();
      if (userId !== null) void this.invalidate(userId, credential.encrypted).catch(() => console.warn('Unable to persist Netease expiry status.'));
    });
    room.queue.resetAuthorization('netease');
    room.changed();
  }
  async refreshAuthorization(userId: number, provider: MusicProvider = 'netease') {
    if (this.disposed) return;
    if (this.rooms.has(SUPER_ROOM_ID) && !this.superRoomReady) await this.initializeSuperRoom();
    for (const room of this.rooms.values()) if (room.kind !== 'super') room.queue.invalidatePlaylistSource(userId, provider);
    // A host may bind again after leaving; retained rooms must also revoke old credentials.
    await Promise.all([...this.rooms.values()].filter(room => room.authorizationUserId === userId)
      .map(room => provider === 'netease' ? this.refreshRoomAuthorization(room, userId) : this.refreshQqAuthorization(room, userId)));
  }
  private async refreshRoomAuthorization(room: Room, userId: number) {
    const version = ++room.credentialVersion;
    // Revoke the previous context immediately, before an asynchronous credential read.
    room.client.dispose?.(true); room.client = this.clientFactory('');
    room.binding = { status: 'unbound', profile: null, boundAt: null };
    const task = this.credentials(userId).then(credential => {
      if (!room.closed && version === room.credentialVersion) this.applyCredential(room, credential);
    }).finally(() => { if (room.authorizationTask === task) room.authorizationTask = null; });
    room.authorizationTask = task;
    room.queue.resetAuthorization('netease'); room.changed();
    await task;
  }
  private applyQqCredential(room: Room, credential: Credential) {
    const version = ++room.qqmusicVersion;
    room.qqmusicClient.dispose(); room.qqmusicBinding = credential.binding;
    room.qqmusicEncrypted = credential.encrypted;
    room.qqmusicClient = (this.qq?.clientFactory || createQqMusicClient)(credential.cookie, this.qqExpiryHandler(room, credential.encrypted, version));
    room.queue.resetAuthorization('qqmusic'); room.changed();
  }
  private qqExpiryHandler(room: Room, encrypted: string | null, version: number) {
    const userId = room.authorizationUserId;
    const expire = () => {
      if (room.closed || version !== room.qqmusicVersion || !encrypted || encrypted !== room.qqmusicEncrypted) return;
      ++room.qqmusicVersion; room.qqmusicBinding = { ...room.qqmusicBinding, status: 'expired' };
      room.qqmusicClient.dispose(); room.queue.resetAuthorization('qqmusic'); room.changed();
      if (userId !== null) void this.qq?.invalidate(userId, encrypted).catch(() => console.warn('Unable to persist QQ binding expiry.'));
    };
    return () => {
      if (room.closed || version !== room.qqmusicVersion || !encrypted || encrypted !== room.qqmusicEncrypted) return;
      const pending = userId !== null ? this.qq?.waitForRenewal?.(userId, encrypted) : null;
      if (pending) return pending.then(expire, expire);
      expire();
    };
  }
  async renewQqAuthorization(userId: number, previousEncrypted: string, credential: { cookie: string; encrypted: string }) {
    if (this.disposed) return;
    await Promise.all([...this.rooms.values()].filter(room => room.authorizationUserId === userId).map(async room => {
      await room.qqmusicAuthorizationTask;
      if (room.closed || room.authorizationUserId !== userId || room.qqmusicEncrypted !== previousEncrypted) return;
      if (room.qqmusicBinding.status !== 'bound') { await this.refreshQqAuthorization(room, userId); return; }
      // Keep the client used by an active QQ roaming session and in-flight playback.
      // The account, authorization version and playlist/recommendation queues are unchanged.
      room.qqmusicEncrypted = credential.encrypted;
      room.qqmusicClient.updateCredential(credential.cookie, this.qqExpiryHandler(room, credential.encrypted, room.qqmusicVersion));
    }));
  }
  private async refreshQqAuthorization(room: Room, userId: number) {
    if (!this.qq) return;
    const version = ++room.qqmusicVersion;
    room.qqmusicClient.dispose(); room.qqmusicBinding = { status: 'unbound', profile: null, boundAt: null };
    room.qqmusicEncrypted = null;
    const task = this.qq.credentials(userId).then(credential => {
      if (!room.closed && version === room.qqmusicVersion) this.applyQqCredential(room, credential);
    }).finally(() => { if (room.qqmusicAuthorizationTask === task) room.qqmusicAuthorizationTask = null; });
    room.qqmusicAuthorizationTask = task;
    room.queue.resetAuthorization('qqmusic'); room.changed(); await task;
  }
  dispose() {
    this.disposed = true;
    if (this.superRoomRetry) clearTimeout(this.superRoomRetry);
    this.superRoomRetry = null;
    for (const id of [...this.rooms.keys()]) this.destroy(id, '服务已停止', true);
  }
}

export const roomManager = new RoomManager(undefined, undefined, undefined, { credentials: id => qqmusicBindings.credential(id),
  invalidate: (id, encrypted) => qqmusicBindings.markInvalid(id, encrypted), clientFactory: createQqMusicClient,
  waitForRenewal: (id, encrypted) => qqmusicBindings.waitForRenewal(id, encrypted) });
neteaseBindings.on('changed', (userId: number) => {
  void roomManager.refreshAuthorization(userId).catch(() => console.warn('Unable to refresh room authorization.'));
});
qqmusicBindings.on('changed', (userId: number) => {
  void roomManager.refreshAuthorization(userId, 'qqmusic').catch(() => console.warn('Unable to refresh QQ room authorization.'));
});
qqmusicBindings.on('renewed', (userId: number, previousEncrypted: string, credential: { cookie: string; encrypted: string }) => {
  void roomManager.renewQqAuthorization(userId, previousEncrypted, credential).catch(() => console.warn('Unable to apply renewed QQ room authorization.'));
});
