const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const WebSocket = require('ws');
const { start } = require('./fixtures/apiHarness.cjs');
const { playlistCatalog } = require('../src/services/netease/playlist.service');
const { qqmusicPlaylistCatalog } = require('../src/services/qqmusic/playlist.service');

test('super room REST/WS collaboration, personal library isolation and source-independent playback', async t => {
  const api = await start({ superRoom: true }); t.after(() => api.close());
  const call = async (path, id = 2, method = 'GET', body) => {
    const response = await fetch(api.origin + '/api' + path, { method, headers: { ...(id ? { Authorization: 'Bearer ' + api.token(id) } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  const root = '/rooms/super-room', room = api.roomManager.get('super-room');
  const normal = (await call('/rooms', 1, 'POST', { name: 'Ordinary room' })).data.room;
  assert.equal((await call('/rooms', 0)).data.rooms[0].id, 'super-room');
  assert.equal(api.roomManager.active(4), null);
  assert.equal((await call(root + '/join', 0, 'POST')).status, 401);
  assert.equal((await call(root + '/queue/mode', 2, 'POST', { mode: 'regular' })).status, 403);
  assert.equal((await call(root + '/join', 2, 'POST')).status, 200);
  assert.equal((await call('/rooms/' + normal.id + '/join', 2, 'POST')).data.code, 'ACTIVE_ROOM');
  await call(root + '/join', 3, 'POST');
  const ws = new WebSocket(api.origin.replace('http', 'ws')); t.after(() => ws.terminate());
  await once(ws, 'open');
  const event = type => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.off('message', listen); reject(new Error('Missing event ' + type)); }, 3000);
    const listen = raw => { const data = JSON.parse(raw); if (data.type === type) { clearTimeout(timeout); ws.off('message', listen); resolve(data); } };
    ws.on('message', listen);
  });
  const snapshot = event('ROOM_SNAPSHOT'); ws.send(JSON.stringify({ type: 'AUTH', token: api.token(2), roomId: 'super-room' }));
  const payload = (await snapshot).payload;
  assert.equal(payload.room.host, null); assert.equal(payload.room.kind, 'super');
  assert.equal(payload.room.bindings.netease.profile, null); assert.equal(payload.room.bindings.qqmusic.profile, null);
  assert.equal(payload.recommendations.available, false); assert.match(payload.recommendations.disabledReason, /所有自动推荐续播均已禁用/);
  assert.ok(payload.members.every(member => !member.isHost));
  for (const provider of ['netease', 'qqmusic']) {
    const disabled = await call(root + '/queue/recommendations/start', 2, 'POST', { provider });
    assert.equal(disabled.status, 403); assert.equal(disabled.data.code, 'RECOMMENDATIONS_DISABLED');
    for (const path of ['', '/search?keywords=test', '/700', '/700/tracks']) assert.equal((await call('/user/' + provider + '/playlists' + path + (path.includes('?') ? '&' : '?') + 'userId=4', 2)).status, 409);
    assert.equal((await call(root + '/playlists', 2, 'POST', { provider, playlistId: 700 })).status, 409);
  }
  assert.equal((await call(root + '/queue/recommendations/stop', 2, 'POST')).data.recommendations.available, false);

  // The public playback credential must never be used for search or lyrics, including legacy routes.
  const anonymous = [], playback = [];
  room.anonymousClient = { get: async (path, config) => { anonymous.push('netease:' + path); return api.client.get(path, config); } };
  room.anonymousQqmusicClient = { ...api.qqClient, search: async (...args) => { anonymous.push('qqmusic:search'); return api.qqClient.search(...args); }, lyric: async (...args) => { anonymous.push('qqmusic:lyric'); return api.qqClient.lyric(...args); } };
  room.client = { get: async (path, config) => { playback.push('netease:' + path); assert.ok(['/song/detail', '/song/url/v1'].includes(path)); return api.client.get(path, config); } };
  room.qqmusicClient = { ...api.qqClient, search: () => { throw new Error('Public search borrowed playback account'); }, lyric: () => { throw new Error('Public lyrics borrowed playback account'); },
    get: () => { throw new Error('Public library borrowed playback account'); } };
  assert.equal((await call(root + '/music/song/search?keywords=fixture')).status, 200);
  assert.equal((await call(root + '/netease/song/search?keywords=fixture')).status, 200);
  for (const provider of ['netease', 'qqmusic']) assert.equal((await call(root + '/music/lyric?id=10&provider=' + provider)).status, 200);
  assert.equal((await call(root + '/netease/lyric?id=10')).status, 200);
  assert.ok(anonymous.includes('netease:/cloudsearch')); assert.ok(anonymous.includes('qqmusic:search')); assert.ok(anonymous.includes('qqmusic:lyric')); assert.deepEqual(playback, []);
  room.anonymousClient = { get: async () => { throw new Error('anonymous upstream unavailable'); } };
  assert.equal((await call(root + '/music/song/search?keywords=failed')).data.providers.netease.songs.length, 0);
  assert.deepEqual(playback, []);

  await api.bind(3); await api.bind(3, 'qqmusic');
  const readers = [];
  for (const [provider, catalog] of [['netease', playlistCatalog], ['qqmusic', qqmusicPlaylistCatalog]]) {
    const credentials = catalog.credentials; catalog.credentials = async id => { readers.push([provider, id]); return credentials(id); };
    t.after(() => { catalog.credentials = credentials; });
  }
  assert.equal((await call(root + '/queue/add', 2, 'POST', { song: { id: 99, name: 'Manual', artist: 'Fixture', prcUrl: '', duration: 300000 } })).status, 200);
  const before = (await call(root + '/state')).data.playback;
  const entries = {};
  for (const provider of ['netease', 'qqmusic']) {
    const added = await call(root + '/playlists', 3, 'POST', { provider, playlistId: 700 }); assert.equal(added.status, 200);
    entries[provider] = root + '/playlists/' + added.data.entryId;
    assert.equal((await call(entries[provider] + '/tracks', 2)).status, 409);
    const own = await call(entries[provider] + '/tracks?offset=30&limit=30&userId=4', 3);
    assert.equal(own.status, 200); assert.equal(own.data.items[0].id, 40); assert.equal(own.data.total, 65);
    assert.equal((await call(entries[provider] + '/settings', 2, 'PATCH', { order: 'shuffle', repeat: true })).status, 200);
    assert.equal((await call(entries[provider] + '/settings', 2, 'PATCH', { order: 'sequential', repeat: false })).status, 200);
  }
  assert.ok(readers.every(([, id]) => id === 2 || id === 3));
  // A bound viewer who cannot access a private playlist receives an error, without a credential fallback.
  const originalLibraryFactory = playlistCatalog.clientFactory;
  playlistCatalog.invalidateUser(3);
  playlistCatalog.clientFactory = () => ({ get: async () => ({ data: { code: 403 } }) });
  try { assert.equal((await call(entries.netease + '/tracks', 3)).data.code, 'PLAYLIST_UNAVAILABLE'); }
  finally { playlistCatalog.clientFactory = originalLibraryFactory; playlistCatalog.invalidateUser(3); }
  const changed = event('PLAYLIST_STATE_UPDATED');
  assert.equal((await call(entries.netease + '/activate', 2, 'POST')).status, 200);
  assert.equal((await changed).payload.mode, 'playlist');
  assert.deepEqual((await call(root + '/state')).data.playback, before);
  await call(root + '/queue/mode', 2, 'POST', { mode: 'regular' });
  assert.deepEqual((await call(root + '/state')).data.playback, before);
  await call(root + '/queue/mode', 2, 'POST', { mode: 'playlist' });
  await call(root + '/leave', 3, 'POST');
  await call('/user/netease', 3, 'DELETE'); await call('/user/qqmusic', 3, 'DELETE');
  await api.roomManager.refreshAuthorization(3); await api.roomManager.refreshAuthorization(3, 'qqmusic');
  const readCount = readers.length;
  assert.equal((await call(entries.netease + '/activate', 2, 'POST')).status, 200);
  await call(root + '/queue/skipNext', 2, 'POST', { playbackRevision: before.playbackRevision });
  await new Promise(resolve => setImmediate(resolve));
  const netease = (await call(root + '/state')).data;
  assert.equal(netease.playback.song.source, 'playlist'); assert.equal(netease.playback.song.id, 10);
  assert.equal(netease.playlists.entries[0].error, null);
  assert.equal((await call(entries.qqmusic + '/activate', 2, 'POST')).status, 200);
  await call(root + '/queue/skipNext', 2, 'POST', { playbackRevision: netease.playback.playbackRevision });
  await new Promise(resolve => setImmediate(resolve));
  const qq = (await call(root + '/state')).data; assert.equal(qq.playback.song.provider, 'qqmusic');
  assert.equal(readers.length, readCount); // No adder/source library credentials requested during continuation.
  await call('/user/qqmusic', 4, 'DELETE'); await api.roomManager.refreshAuthorization(4, 'qqmusic');
  const unavailable = await call(root + '/music/song/url?id=10&provider=qqmusic');
  assert.equal(unavailable.status, 409); assert.match(unavailable.data.error, /超级房间QQ 音乐播放授权暂不可用/);
  assert.equal((await call(root + '/state')).data.room.bindings.netease.status, 'bound');
  await api.bind(4, 'qqmusic'); assert.equal((await call(entries.qqmusic + '/activate', 2, 'POST')).status, 200);
  assert.equal((await call(entries.netease, 2, 'DELETE')).status, 200);
  assert.equal((await call(entries.qqmusic, 2, 'DELETE')).status, 200);
  await call(root + '/leave', 2, 'POST');
  assert.equal((await call(root + '/state', 2)).status, 403);
  assert.equal(api.roomManager.get('super-room').summary().onlineCount, 0);
  assert.equal(api.roomManager.get('super-room').queue.getPlayback().song.provider, 'qqmusic');
});
