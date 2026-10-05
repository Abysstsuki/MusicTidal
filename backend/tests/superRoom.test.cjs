const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { RoomManager, SUPER_ROOM_ID, SUPER_ROOM_ACCOUNT_USERNAME, RECONNECT_GRACE_MS } = require('../src/services/roomManager');
const { SongQueueService } = require('../src/services/songQueueService');
const guest = { cookie: '', encrypted: null, binding: { status: 'unbound', profile: null, boundAt: null } };
const bound = cookie => ({ cookie, encrypted: cookie, binding: { status: 'bound', profile: { uid: 'private-uid', nickname: 'private-profile', avatarUrl: 'private-avatar' }, boundAt: 'private-date' } });
const user = id => ({ id, username: 'Member ' + id });
const socket = () => ({ events: [], send(event) { this.events.push(event); }, close() {} });
const settle = () => new Promise(resolve => setImmediate(resolve));
const song = id => ({ id, name: 'Song ' + id, artist: 'Fixture', prcUrl: '', duration: 1000 });

test('super room initialization, member expiry, disposal and recreation preserve the fixed identity', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let lookups = 0;
  const m = new RoomManager(async () => guest, undefined, undefined, undefined, async username => {
    assert.equal(username, SUPER_ROOM_ACCOUNT_USERNAME); ++lookups; return { id: 99 };
  });
  t.after(() => m.dispose());
  const normal = await m.create(user(1), 'Normal');
  const [room, same] = await Promise.all([m.initializeSuperRoom(), m.initializeSuperRoom()]);
  assert.equal(room, same); assert.equal(lookups, 1); assert.equal(room.host, null);
  assert.equal(m.active(99), null); assert.equal(room.members.size, 0);
  assert.equal(m.list()[0].id, SUPER_ROOM_ID); assert.equal(room.info().locked, false);
  assert.equal(room.info().hostDisconnectedUntil, null); assert.equal(room.info().hostGracePeriodMs, 0);
  await m.join(room.id, user(2));
  assert.equal(m.playbackController(room.id, 2), room);
  assert.throws(() => m.playbackController(room.id, 3), error => error.code === 'NOT_MEMBER');
  await assert.rejects(m.join(normal.id, user(2)), error => error.code === 'ACTIVE_ROOM');
  const first = socket(), second = socket(); m.connect(room.id, 2, first); m.connect(room.id, 2, second);
  assert.equal(room.summary().onlineCount, 1); assert.equal(room.onlineMembers()[0].isHost, false);
  m.disconnect(room.id, 2, first); m.disconnect(room.id, 2, second);
  t.mock.timers.tick(RECONNECT_GRACE_MS);
  assert.equal(m.active(2), null); assert.equal(m.get(room.id), room); assert.equal(room.members.size, 0);
  assert.throws(() => m.get(normal.id), error => error.code === 'ROOM_CLOSED');
  await m.join(room.id, user(2)); m.chat(room.id, 2, 'Temporary chat'); m.leave(room.id, 2);
  m.destroy(room.id, 'ordinary cleanup'); assert.equal(m.get(room.id), room);
  t.mock.timers.tick(RECONNECT_GRACE_MS); assert.equal(m.get(room.id), room);
  m.dispose(); assert.equal(room.closed, true); assert.equal(room.messages.length, 0);
  const restarted = new RoomManager(async () => guest, undefined, undefined, undefined, async () => ({ id: 99 }));
  t.after(() => restarted.dispose());
  const rebuilt = await restarted.initializeSuperRoom();
  assert.equal(rebuilt.id, room.id); assert.equal(rebuilt.messages.length, 0);
  assert.deepEqual(rebuilt.queue.getQueue(), []); assert.deepEqual(rebuilt.queue.getPlaylistState().entries, []);
});

test('missing account or failed credential load retries in 30 seconds while the room stays accessible', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0, reads = 0;
  const m = new RoomManager(async () => { if (++reads === 1) throw new Error('database unavailable'); return guest; },
    undefined, undefined, undefined, async () => ++attempts === 1 ? null : { id: 99 });
  t.after(() => m.dispose());
  const room = await m.initializeSuperRoom();
  await m.join(room.id, user(2)); m.chat(room.id, 2, 'Still available');
  assert.throws(() => room.requireProvider('netease'), /超级房间网易云播放授权暂不可用/);
  t.mock.timers.tick(30000); await settle(); assert.equal(attempts, 2);
  t.mock.timers.tick(30000); await settle(); assert.equal(attempts, 3);
  t.mock.timers.tick(30000); await settle(); assert.equal(attempts, 3);
  assert.equal(m.get(room.id), room); assert.equal(room.messages.length, 1);
});

test('playback continues with no members and expiry/rebinding affect only the correct source platform', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const expiries = {}, invalid = [], cookies = [], reads = [];
  let netease = bound('n1'), qq = bound('q1');
  const m = new RoomManager(async id => { reads.push(id); return netease; }, async (id, encrypted) => invalid.push([id, encrypted]),
    (cookie, onExpired) => {
      expiries[cookie] = onExpired;
      return { dispose() {}, get: async () => { cookies.push(cookie); return { data: { code: 200, data: [{ url: 'https://example.invalid/' + cookie, time: 1000 }] } }; } };
    }, { credentials: async id => { reads.push(id); return qq; }, invalidate: async (id, encrypted) => invalid.push([id, encrypted]),
      clientFactory: (cookie, onExpired) => { expiries[cookie] = onExpired; return { dispose() {} }; } }, async () => ({ id: 99 }));
  t.after(() => m.dispose()); const room = await m.initializeSuperRoom();
  assert.deepEqual(reads, [99, 99]);
  const exposed = JSON.stringify(room.state());
  for (const secret of ['private-uid', 'private-profile', 'private-avatar', 'private-date', SUPER_ROOM_ACCOUNT_USERNAME, 'authorizationUserId']) assert.ok(!exposed.includes(secret));
  room.queue.enqueueMany([song(10), song(11)]); await settle();
  assert.equal(room.queue.getPlayback().song.id, 10); assert.equal(room.members.size, 0);
  t.mock.timers.tick(1000); await settle(); assert.equal(room.queue.getPlayback().song.id, 11);
  t.mock.timers.tick(1000); await settle(); assert.equal(room.queue.getPlayback().song, null);
  expiries.n1(); await settle(); assert.deepEqual(invalid, [[99, 'n1']]);
  assert.equal(room.binding.status, 'expired'); assert.equal(room.qqmusicBinding.status, 'bound');
  netease = bound('n2'); await m.refreshAuthorization(99); expiries.n1();
  room.queue.enqueue(song(12)); await settle(); assert.equal(room.queue.getPlayback().url, 'https://example.invalid/n2');
  expiries.q1(); await settle(); assert.deepEqual(invalid[1], [99, 'q1']); assert.equal(room.binding.status, 'bound');
  qq = guest; await m.refreshAuthorization(99, 'qqmusic'); assert.equal(room.qqmusicBinding.status, 'unbound');
  assert.equal(m.get(SUPER_ROOM_ID), room); assert.deepEqual(cookies, ['n1', 'n1', 'n2']);
});

test('retrying one failed platform does not revoke or pause the healthy platform', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let neteaseReads = 0, qqReads = 0;
  const m = new RoomManager(async () => { ++neteaseReads; return bound('healthy'); }, undefined, () => ({ dispose() {} }),
    { credentials: async () => { if (++qqReads === 1) throw new Error('temporary read failure'); return guest; }, invalidate: async () => {}, clientFactory: () => ({ dispose() {} }) },
    async () => ({ id: 99 }));
  t.after(() => m.dispose()); const room = await m.initializeSuperRoom();
  room.queue.addPlaylist({ playlist: { provider: 'netease', id: 700, name: 'Shared', creator: '', coverUrl: '', trackCount: 1, isLiked: false }, trackIds: [10] }, user(2));
  t.mock.timers.tick(30000); await settle();
  assert.equal(neteaseReads, 1); assert.equal(qqReads, 2);
  assert.equal(room.binding.status, 'bound'); assert.equal(room.queue.getPlaylistState().entries[0].error, null);
});

test('disabled queue cannot create recommendation sessions or schedule refill/retry work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let factories = 0, plays = 0;
  const q = new SongQueueService({ recommendationsDisabledReason: 'Only manual and playlists', emit() {},
    getPlayInfo: async () => { ++plays; return { url: 'https://example.invalid/audio', time: 1000 }; },
    createHeartSession: () => { ++factories; throw new Error('must never create'); },
    createRecommendationSession: () => { ++factories; throw new Error('must never create'); } });
  t.after(() => q.dispose());
  for (const provider of ['netease', 'qqmusic']) await assert.rejects(q.startHeartMode(provider), error => error.status === 403 && error.code === 'RECOMMENDATIONS_DISABLED');
  q.stopRecommendations(); q.setMode('regular'); q.resetAuthorization();
  t.mock.timers.tick(300000); await settle();
  const state = q.getRecommendationState();
  assert.equal(state.available, false); assert.equal(state.enabled, false); assert.equal(state.loading, false);
  assert.equal(state.queued, 0); assert.equal(state.provider, null); assert.equal(factories, 0); assert.equal(plays, 0);
});
