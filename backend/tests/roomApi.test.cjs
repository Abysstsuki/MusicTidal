const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { start } = require('./fixtures/apiHarness.cjs');

test('REST and WebSocket enforce admission, roles, isolation and immediate room destruction', async t => {
  const api = await start(); t.after(() => api.close());
  const request = async (path, id, method = 'GET', body) => {
    const response = await fetch(api.origin + path, { method, headers: { ...(id ? { Authorization: 'Bearer ' + api.token(id) } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  assert.equal((await request('/api/rooms')).status, 200);
  assert.equal((await request('/api/rooms', undefined, 'POST', { name: 'Unauthorized' })).status, 401);
  const a = (await request('/api/rooms', 1, 'POST', { name: 'A', password: 'secret' })).body.room;
  const b = (await request('/api/rooms', 2, 'POST', { name: 'B' })).body.room;
  assert.equal((await request('/api/rooms/' + a.id + '/state')).status, 401);
  assert.equal((await request('/api/rooms/' + a.id + '/state', 3)).status, 403);
  assert.equal((await request('/api/rooms/' + a.id + '/join', 3, 'POST', { password: 'wrong' })).body.code, 'ROOM_PASSWORD');
  assert.equal((await request('/api/rooms/' + a.id + '/join', 3, 'POST', { password: 'secret' })).status, 200);
  assert.equal((await request('/api/rooms/' + b.id + '/join', 3, 'POST')).body.code, 'ACTIVE_ROOM');
  assert.equal((await request('/api/rooms/' + a.id + '/queue/recommendations/start', 3, 'POST')).status, 403);
  assert.equal((await request('/api/queue/list')).status, 404);
  assert.equal((await request('/api/netease/song/url?id=10')).status, 404);
  const opened = [];
  async function connect(id, roomId, admit = true) {
    const socket = new WebSocket(api.origin.replace('http', 'ws')); opened.push(socket);
    const messages = []; socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    const first = new Promise(resolve => socket.on('message', raw => { const event = JSON.parse(raw.toString()); if (event.type === 'ROOM_SNAPSHOT' || event.type === 'ERROR') resolve(event); }));
    await once(socket, 'open'); assert.equal(messages.length, 0);
    socket.send(JSON.stringify({ type: 'AUTH', token: api.token(id), roomId }));
    const event = await first;
    assert.equal(event.type, admit ? 'ROOM_SNAPSHOT' : 'ERROR');
    return { socket, messages };
  }
  t.after(() => opened.forEach(socket => socket.terminate()));
  await connect(2, a.id, false);
  const host = await connect(1, a.id); const member = await connect(3, a.id); const other = await connect(2, b.id);
  const chat = new Promise(resolve => host.socket.on('message', raw => { const event = JSON.parse(raw.toString()); if (event.type === 'chat') resolve(event); }));
  member.socket.send(JSON.stringify({ type: 'chat', roomId: a.id, username: 'FakeHost', text: 'Hello room A' }));
  const event = await chat; assert.equal(event.payload.username, 'Friends'); assert.equal(event.payload.userId, 3);
  assert.ok(!other.messages.some(event => event.type === 'chat'));
  const payload = { song: { id: 10, name: 'Test', artist: 'Artist', duration: 300000, prcUrl: '' } };
  assert.equal((await request('/api/rooms/' + a.id + '/queue/add', 3, 'POST', payload)).status, 200);
  assert.equal((await request('/api/rooms/' + a.id + '/netease/song/search?keywords=test', 3)).status, 200);
  const state = (await request('/api/rooms/' + a.id + '/state', 3)).body;
  assert.equal(state.playback.song.id, 10); assert.ok(state.playback.url);
  assert.equal((await request('/api/rooms/' + b.id + '/state', 2)).body.playback.song, null);
  const closed = new Promise(resolve => member.socket.on('message', raw => { const event = JSON.parse(raw.toString()); if (event.type === 'ROOM_CLOSED') resolve(event); }));
  assert.equal((await request('/api/rooms/' + a.id + '/leave', 1, 'POST')).status, 200); await closed;
  assert.equal((await request('/api/rooms/' + a.id + '/state', 3)).status, 404);
  assert.equal((await request('/api/rooms/' + b.id + '/state', 2)).status, 200);
  const registered = await request('/api/auth/register', undefined, 'POST', { username: 'New', email: 'new@musictidal.test', password: 'DemoMusic123' });
  assert.deepEqual(Object.keys(registered.body).sort(), ['email', 'id', 'username']);
});
