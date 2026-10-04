const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { PlaylistCatalog, pagination } = require('../src/services/netease/playlist.service');
const { neteaseBindings } = require('../src/services/netease/binding.service');
const { NeteaseApiError } = require('../src/utils/neteaseHttp');
const { RoomManager } = require('../src/services/roomManager');
const { playlistCatalog } = require('../src/services/netease/playlist.service');
test.after(() => neteaseBindings.dispose());
const credential = id => ({ cookie: id === 3 ? '' : 'MUSIC_U=fixture-' + id, encrypted: id === 3 ? null : 'encrypted-fixture-' + id,
  binding: { status: id === 3 ? 'unbound' : 'bound', profile: id === 3 ? null : { uid: String(id), nickname: 'Member', avatarUrl: '' }, boundAt: null } });

test('personal catalogs use member credentials, cache independently and page only requested details', async () => {
  const calls = [];
  const catalog = new PlaylistCatalog(async id => credential(id), cookie => ({ get: async (path, config) => {
    const params = config.params; calls.push({ cookie, path, params });
    return { data: { code: 200, ...(path === '/playlist/user' ? { playlist: [{ id: 700, name: 'Liked', specialType: 5, creator: { userId: params.uid } }], more: false }
      : path === '/playlist/search' ? { result: { playlists: [], playlistCount: 0 } }
        : path === '/playlist/detail' ? { playlist: { id: 700, name: 'Long', trackIds: Array.from({ length: 65 }, (_, i) => ({ id: i + 10 })) } }
          : { songs: params.ids.split(',').map(Number).map(id => ({ id, name: 'Track', ar: [], al: {}, dt: 1000 })) }) } };
  } }));
  const page = { offset: 0, limit: 30 };
  assert.equal((await catalog.list(1, page)).items[0].isLiked, true); await catalog.list(2, page); await catalog.list(1, page);
  assert.equal(calls.length, 2); assert.equal(calls[0].cookie, credential(1).cookie); assert.equal(calls[1].params.uid, '2');
  await assert.rejects(catalog.search(3, 'test', page), error => error.status === 409);
  await catalog.search(1, 'test', page); assert.equal(calls.at(-1).cookie, credential(1).cookie); assert.equal(calls.at(-1).params.type, 1000);
  await assert.rejects(catalog.list(3, page), error => error.status === 409);
  const first = await catalog.tracks(1, 700, page), second = await catalog.tracks(1, 700, { offset: 30, limit: 30 });
  assert.equal(first.items.length, 30); assert.equal(second.items[0].id, 40); assert.equal(second.total, 65);
  assert.equal(calls.filter(call => call.path === '/playlist/detail').length, 1);
  assert.ok(calls.filter(call => call.path === '/song/detail').every(call => call.params.ids.split(',').length === 30));
  catalog.invalidateUser(1); await catalog.list(1, page); assert.equal(calls.at(-1).path, '/playlist/user');
  assert.throws(() => pagination({ limit: 101 }), /最多/);
});

test('binding expiry is a Netease 409 and late account work cannot enter cache', async () => {
  const invalid = [];
  const expired = new PlaylistCatalog(async id => credential(id), () => ({ get: async () => { throw new NeteaseApiError(401); } }), async (id, encrypted) => invalid.push({ id, encrypted }));
  await assert.rejects(expired.list(1, { offset: 0, limit: 30 }), error => error.status === 409 && error.code === 'NETEASE_BINDING_EXPIRED');
  assert.equal(invalid[0].id, 1);
  let resolve;
  const late = new PlaylistCatalog(async id => credential(id), () => ({ get: () => new Promise(done => { resolve = done; }) }));
  const pending = late.index(1, 700); await new Promise(done => setImmediate(done));
  late.invalidateUser(1); resolve({ data: { code: 200, playlist: { id: 700, trackIds: [] } } });
  await assert.rejects(pending, error => error.code === 'NETEASE_BINDING_CHANGED');
});

test('enhanced modules use explicit cookies, n=1 and bounded song IDs through the legacy transport', async t => {
  const transportPath = require.resolve('../vendor/netease/util/request'), enhancedPath = require.resolve('../vendor/netease/enhanced');
  const transport = require(transportPath), saved = require.cache[transportPath].exports;
  const requests = [];
  require.cache[transportPath].exports = async (method, uri, data, options) => { requests.push({ method, uri, data, options }); return { body: { code: 200 }, cookie: [], status: 200 }; };
  delete require.cache[enhancedPath];
  t.after(() => { require.cache[transportPath].exports = saved; delete require.cache[enhancedPath]; });
  const modules = require(enhancedPath)(require('../vendor/netease').cookieToJson);
  await modules.playlist_detail({ id: 700, cookie: '', anonymousToken: 'fixture-guest', timeout: 250 });
  await modules.playlist_search({ keywords: 'test', type: 1000, cookie: '' });
  await modules.song_detail({ ids: '10,11', cookie: 'MUSIC_U=fixture' });
  assert.equal(requests[0].data.n, 1); assert.deepEqual(requests[0].options.cookie, Object.create(null));
  assert.equal(requests[0].options.anonymousToken, 'fixture-guest'); assert.equal(requests[0].options.timeout, 250);
  assert.equal(requests[1].data.type, 1000); assert.equal(requests[1].options.crypto, 'eapi');
  assert.equal(requests[2].options.crypto, 'weapi'); assert.equal(JSON.parse(requests[2].data.c).length, 2);
  assert.ok(requests.every(request => request.data.e_r === false));
});

test('room playlist metadata uses its adding member while audio uses the host credential', async t => {
  const calls = [], savedIndex = playlistCatalog.index, savedSongs = playlistCatalog.songs;
  const index = { playlist: { id: 700, name: 'Shared', creator: 'Member', coverUrl: '', trackCount: 1, isLiked: false }, trackIds: [10] };
  playlistCatalog.index = async (userId, playlistId) => { calls.push({ kind: 'index', userId, playlistId }); return index; };
  playlistCatalog.songs = async (userId, ids) => { calls.push({ kind: 'details', userId, ids }); return [{ id: 10, name: 'Track', artist: 'Member', prcUrl: '', duration: 1000 }]; };
  const manager = new RoomManager(async id => credential(id), async () => {}, cookie => ({ get: async (path, config) => {
    calls.push({ kind: 'audio', cookie, path, id: config.params.id });
    return { data: { data: [{ url: 'https://fixture.invalid/audio', time: 1000 }] } };
  } }));
  t.after(() => { manager.dispose(); playlistCatalog.index = savedIndex; playlistCatalog.songs = savedSongs; });
  const room = await manager.create({ id: 1, username: 'Host' }, 'Shared room');
  room.queue.activatePlaylist(room.queue.addPlaylist(index, { id: 2, username: 'Member' }));
  await new Promise(done => setImmediate(done));
  assert.equal(room.queue.getCurrentSong().song.source, 'playlist');
  assert.equal(calls.find(call => call.kind === 'index').userId, 2);
  assert.equal(calls.find(call => call.kind === 'details').userId, 2);
  assert.equal(calls.find(call => call.kind === 'audio').cookie, credential(1).cookie);
});
