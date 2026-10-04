const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { RoomManager, RECONNECT_GRACE_MS } = require('../src/services/roomManager');
const guest = { cookie: '', encrypted: null, binding: { status: 'unbound', profile: null, boundAt: null } };
const user = id => ({ id, username: 'User ' + id });
const socket = () => ({ events: [], closed: false, send(event) { this.events.push(event); }, close() { this.closed = true; } });
const song = id => ({ id, name: 'Song ' + id, artist: 'Artist', duration: 900000, prcUrl: '' });
const settle = () => new Promise(resolve => setImmediate(resolve));
function manager(t) { const value = new RoomManager(async () => guest); t.after(() => value.dispose()); return value; }

test('rooms isolate queue, playback, messages and broadcast recipients', async t => {
  const m = manager(t); const a = await m.create({ ...user(1), email: 'private', password: 'sensitive', neteaseCookieEncrypted: 'secret' }, 'Room A'); const b = await m.create(user(2), 'Room B');
  const sa = socket(), sb = socket(); m.connect(a.id, 1, sa); m.connect(b.id, 2, sb);
  for (const room of [a, b]) {
    room.binding = { status: 'bound', profile: null, boundAt: null };
    room.client = { get: async () => ({ data: { code: 200, data: [{ url: 'https://example.invalid/' + room.id, time: 900000 }] } }) };
  }
  a.queue.enqueue(song(10)); b.queue.enqueue(song(20)); await settle();
  m.chat(a.id, 1, 'private A');
  assert.equal(a.queue.getCurrentSong().song.id, 10); assert.equal(b.queue.getCurrentSong().song.id, 20);
  assert.equal(b.messages.length, 0);
  assert.ok(sa.events.some(event => event.type === 'chat'));
  assert.ok(sb.events.every(event => event.roomId === b.id && event.type !== 'chat'));
  const publicList = JSON.stringify(m.list());
  assert.ok(!publicList.includes('private A')); assert.ok(!publicList.includes('https://example.invalid/'));
  assert.ok(!publicList.includes('binding')); assert.ok(!publicList.includes('passwordHash'));
  assert.deepEqual(a.summary().host, user(1)); assert.ok(!publicList.includes('private') && !publicList.includes('sensitive') && !publicList.includes('secret'));
});
test('passwords and membership are enforced and one user cannot enter two rooms', async t => {
  const password = 'p'.repeat(72);
  const m = manager(t); const a = await m.create(user(1), 'A', password); const b = await m.create(user(2), 'B');
  await assert.rejects(m.join(a.id, user(3), 'wrong'), error => error.code === 'ROOM_PASSWORD');
  await assert.rejects(m.join(a.id, user(3), password + 'extra'), error => error.code === 'ROOM_PASSWORD');
  assert.throws(() => m.member(a.id, 3), error => error.status === 403);
  await m.join(a.id, user(3), password);
  await m.join(a.id, user(3)); // Refresh does not require the password again.
  await assert.rejects(m.join(b.id, user(3)), error => error.code === 'ACTIVE_ROOM');
  assert.throws(() => m.host(a.id, 3), error => error.status === 403);
});
test('concurrent creates by the same user leave only one room', async t => {
  const m = manager(t);
  const results = await Promise.allSettled([m.create(user(1), 'A'), m.create(user(1), 'B')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(m.list().length, 1);
});
test('multiple tabs count once and host reconnect cancels the destruction deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const m = manager(t); const a = await m.create(user(1), 'A');
  const first = socket(), second = socket(); m.connect(a.id, 1, first); m.connect(a.id, 1, second);
  assert.equal(a.summary().onlineCount, 1);
  m.disconnect(a.id, 1, first); assert.equal(a.summary().hostDisconnectedUntil, null);
  m.disconnect(a.id, 1, second); assert.equal(a.summary().onlineCount, 0);
  assert.equal(a.summary().hostDisconnectedUntil, Date.now() + RECONNECT_GRACE_MS);
  t.mock.timers.tick(RECONNECT_GRACE_MS - 1); m.connect(a.id, 1, first);
  t.mock.timers.tick(1); assert.equal(m.get(a.id), a);
  m.disconnect(a.id, 1, first); t.mock.timers.tick(RECONNECT_GRACE_MS);
  assert.throws(() => m.get(a.id), error => error.code === 'ROOM_CLOSED'); assert.equal(m.active(1), null);
});
test('new rooms without a first connection expire and release the owner', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = manager(t); await m.create(user(1), 'A');
  t.mock.timers.tick(RECONNECT_GRACE_MS); assert.equal(m.list().length, 0); assert.equal(m.active(1), null);
});
test('leaving removes all user tabs while owner departure schedules only that room for destruction', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const m = manager(t); const a = await m.create(user(1), 'A'); const b = await m.create(user(2), 'B');
  await m.join(a.id, user(3));
  const host = socket(), first = socket(), second = socket(), other = socket();
  m.connect(a.id, 1, host); m.connect(a.id, 3, first); m.connect(a.id, 3, second); m.connect(b.id, 2, other);
  m.leave(a.id, 3); assert.ok(first.closed && second.closed); assert.equal(m.active(3), null); assert.equal(a.summary().onlineCount, 1);
  m.leave(a.id, 1); m.leave(a.id, 1);
  assert.ok(host.closed); assert.ok(host.events.some(event => event.type === 'ROOM_CLOSED'));
  assert.equal(m.get(a.id), a); assert.equal(m.active(1), null);
  assert.throws(() => m.member(a.id, 1), error => error.code === 'NOT_MEMBER');
  assert.equal(a.summary().hostDisconnectedUntil, Date.now() + RECONNECT_GRACE_MS);
  t.mock.timers.tick(RECONNECT_GRACE_MS);
  assert.throws(() => m.get(a.id), error => error.code === 'ROOM_CLOSED');
  assert.equal(m.get(b.id), b); assert.equal(other.closed, false);
});
test('member expiry releases membership without destroying the room', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = manager(t); const a = await m.create(user(1), 'A'); m.connect(a.id, 1, socket());
  await m.join(a.id, user(3)); t.mock.timers.tick(RECONNECT_GRACE_MS);
  assert.equal(m.active(3), null); assert.equal(m.get(a.id), a);
});
test('chat identity comes from admitted users and history is bounded per room', async t => {
  const m = manager(t); const a = await m.create(user(1), 'A');
  for (let i = 0; i < 30; i++) m.chat(a.id, 1, 'Message ' + i);
  assert.equal(a.messages.length, 25); assert.equal(a.messages[0].text, 'Message 5');
  assert.equal(a.messages[0].username, 'User 1'); assert.throws(() => m.chat(a.id, 99, 'fake'), error => error.status === 403);
});

test('authorization replacement cancels old work immediately and ignores stale expiry', async t => {
  let deferred; let expireOld; const calls = [];
  const bound = cookie => ({ cookie, encrypted: cookie, binding: { status: 'bound', profile: { uid: cookie, nickname: cookie, avatarUrl: '' }, boundAt: null } });
  let credential = bound('first');
  const m = new RoomManager(async () => credential instanceof Promise ? await credential : credential,
    async (_id, encrypted) => calls.push('expired:' + encrypted),
    (cookie, onExpired) => { if (cookie === 'first') expireOld = onExpired; return { get: async () => { calls.push(cookie); return { data: { code: 200, data: [{ url: 'https://example.invalid/' + cookie, time: 900000 }] } }; } }; });
  t.after(() => m.dispose());
  const a = await m.create(user(1), 'A');
  a.queue.enqueue(song(10)); await settle();
  const playing = a.queue.getPlayback();
  a.queue.enqueue(song(11));
  credential = new Promise(resolve => { deferred = resolve; });
  const refreshing = m.refreshAuthorization(1);
  assert.equal(a.queue.getRecommendationState().enabled, false);
  expireOld(); assert.ok(!calls.includes('expired:first'));
  a.queue.skipToNext(playing.playbackRevision); await settle();
  assert.equal(a.queue.getPlayback().song, null); assert.deepEqual(calls, ['first']);
  deferred(bound('second')); await refreshing; await settle();
  assert.equal(a.queue.getPlayback().song.id, 11);
  assert.equal(a.queue.getPlayback().url, 'https://example.invalid/second');
  assert.ok(calls.slice(1).every(cookie => cookie === 'second'));
});
