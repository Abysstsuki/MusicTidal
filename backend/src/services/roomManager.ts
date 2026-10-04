import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';
import { createNeteaseClient, type NeteaseClient } from '../utils/neteaseHttp';
import { HttpError } from '../utils/httpError';
import { neteaseBindings, type BindingStatus } from './netease/binding.service';
import { getSongPlayInfo } from './netease/song.service';
import { HeartModeSession } from './netease/recommendation.service';
import { SongQueueService } from './songQueueService';

export const RECONNECT_GRACE_MS = 180_000;
export type RoomUser = { id: number; username: string };
export type RoomEvent = { type: string; roomId: string; revision: number; payload: any };
export interface RoomConnection { send(event: RoomEvent): void; close(): void }
type Member = RoomUser & { connections: Set<RoomConnection>; expiresAt: number | null; timer: ReturnType<typeof setTimeout> | null };
type Credential = { cookie: string; encrypted: string | null; binding: BindingStatus };

export class Room {
  readonly queue: SongQueueService;
  readonly host: RoomUser;
  private readonly inviteToken: string | null;
  readonly members = new Map<number, Member>();
  readonly messages: { id: string; userId: number; username: string; text: string }[] = [];
  client: NeteaseClient = createNeteaseClient('');
  binding: BindingStatus = { status: 'unbound', profile: null, boundAt: null };
  revision = 0;
  closed = false;
  credentialVersion = 0;
  authorizationTask: Promise<void> | null = null;
  constructor(readonly id: string, readonly name: string, host: RoomUser, readonly passwordHash: string | null) {
    this.host = { id: host.id, username: host.username };
    this.inviteToken = passwordHash ? randomBytes(32).toString('hex') : null;
    this.queue = new SongQueueService({
      getPlayInfo: async id => {
        await this.authorizationTask;
        if (this.closed) throw new HttpError(404, '房间已结束', 'ROOM_CLOSED');
        return getSongPlayInfo(id, this.client);
      },
      createHeartSession: initial => new HeartModeSession(initial, this.client),
      emit: event => this.broadcast(event.type, event.payload),
    });
  }
  summary() {
    const song = this.queue.getCurrentSong()?.song;
    return { id: this.id, name: this.name, host: this.host, locked: Boolean(this.passwordHash),
      onlineCount: this.onlineMembers().length,
      currentSong: song ? { id: song.id, name: song.name, artist: song.artist, prcUrl: song.prcUrl } : null,
      hostDisconnectedUntil: this.members.get(this.host.id)?.expiresAt || null,
      hostGracePeriodMs: RECONNECT_GRACE_MS };
  }
  onlineMembers() { return [...this.members.values()].filter(member => member.connections.size > 0).map(member => ({ id: member.id, username: member.username, isHost: member.id === this.host.id })); }
  info() { return { ...this.summary(), binding: this.binding, inviteToken: this.inviteToken }; }
  acceptsInvite(token: unknown) {
    return Boolean(this.inviteToken && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
      && timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(this.inviteToken, 'hex')));
  }
  state() {
    return { room: this.info(), revision: this.revision,
      playback: this.queue.getPlayback(), queue: this.queue.getQueue(), recommendations: this.queue.getRecommendationState(),
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
  constructor(private readonly credentials: (userId: number) => Promise<Credential> = id => neteaseBindings.credential(id),
    private readonly invalidate: (userId: number, encrypted: string) => Promise<void> = (id, encrypted) => neteaseBindings.markInvalid(id, encrypted),
    private readonly clientFactory = createNeteaseClient) {}

  list() {
    return [...this.rooms.values()].map(room => {
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
    if (room.host.id !== userId) throw new HttpError(403, '只有房主可以执行此操作');
    return room;
  }
  async create(user: RoomUser, name: unknown, password?: unknown) {
    this.ensureAvailable(user.id);
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw new HttpError(400, '房间名称需要 1–60 个字符');
    if (password !== undefined && (typeof password !== 'string' || Buffer.byteLength(password) > 72)) throw new HttpError(400, '密码过长');
    const hash = password ? await bcrypt.hash(password as string, 10) : null;
    const credential = await this.credentials(user.id);
    this.ensureAvailable(user.id);
    const room = new Room(randomUUID(), name.trim(), user, hash);
    this.rooms.set(room.id, room);
    this.applyCredential(room, credential);
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
      if (member.id === room.host.id) this.destroy(room.id, '房主离开超过 3 分钟，房间已销毁');
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
    if (userId === room.host.id) this.scheduleExpiry(room, member);
    else room.members.delete(userId);
    for (const connection of connections) {
      try { connection.send({ type: 'ROOM_CLOSED', roomId: id, revision: ++room.revision, payload: { reason: '你已离开房间' } }); }
      catch { /* Cleanup must continue if a departed connection cannot receive. */ }
      try { connection.close(); } catch { /* Already closed. */ }
    }
    room.changed();
  }
  destroy(id: string, reason: string) {
    const room = this.rooms.get(id);
    if (!room || room.closed) return;
    room.broadcast('ROOM_CLOSED', { reason }); room.closed = true;
    room.queue.dispose(); ++room.credentialVersion;
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
    const version = ++room.credentialVersion;
    room.binding = credential.binding;
    room.client = this.clientFactory(credential.cookie, () => {
      if (room.closed || version !== room.credentialVersion || !credential.encrypted) return;
      ++room.credentialVersion;
      room.binding = { ...room.binding, status: 'expired' }; room.client = this.clientFactory('');
      room.queue.resetAuthorization(); room.changed();
      void this.invalidate(room.host.id, credential.encrypted).catch(() => console.warn('Unable to persist Netease expiry status.'));
    });
    room.queue.resetAuthorization();
    room.changed();
  }
  async refreshAuthorization(userId: number) {
    // A host may bind again after leaving; retained rooms must also revoke old credentials.
    await Promise.all([...this.rooms.values()].filter(room => room.host.id === userId)
      .map(room => this.refreshRoomAuthorization(room, userId)));
  }
  private async refreshRoomAuthorization(room: Room, userId: number) {
    const version = ++room.credentialVersion;
    // Revoke the previous context immediately, before an asynchronous credential read.
    room.client = this.clientFactory('');
    room.binding = { status: 'unbound', profile: null, boundAt: null };
    const task = this.credentials(userId).then(credential => {
      if (!room.closed && version === room.credentialVersion) this.applyCredential(room, credential);
    }).finally(() => { if (room.authorizationTask === task) room.authorizationTask = null; });
    room.authorizationTask = task;
    room.queue.resetAuthorization(); room.changed();
    await task;
  }
  dispose() { for (const id of [...this.rooms.keys()]) this.destroy(id, '服务已停止'); }
}

export const roomManager = new RoomManager();
neteaseBindings.on('changed', (userId: number) => {
  void roomManager.refreshAuthorization(userId).catch(() => console.warn('Unable to refresh room authorization.'));
});
