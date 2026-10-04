const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { HeartModeSession, normalizeRecommendedSongs, normalizeHeartModeSongs } = require('../src/services/netease/recommendation.service');
function client(uid = 1, songs = [10, 11, 12, 13]) {
  const calls = [];
  return { calls, get: async (endpoint, options) => {
    calls.push({ endpoint, options });
    const body = endpoint === '/user/account' ? { profile: { userId: uid } } : endpoint === '/user/playlist' ? { playlist: [
      { id: 999, specialType: 5, creator: { userId: uid + 1 } }, { id: uid * 100, specialType: 5, creator: { userId: uid } },
    ] } : endpoint === '/likelist' ? { ids: [10, 11] } : { data: songs.map(id => ({ songInfo: { id, name: 'Track ' + id } })) };
    return { data: { code: 200, ...body } };
  } };
}
test('normalizes legacy song fields and nested heart records without duplicates', () => {
  assert.deepEqual(normalizeRecommendedSongs([
    { id: 1, name: ' Track ', ar: [{ name: 'A' }], al: { picUrl: 'cover' }, dt: 1000 },
    { id: 1, name: 'duplicate' }, null, { id: -1, name: 'invalid' },
    { id: 2, name: 'FM', artists: [{ name: 'B' }], album: { picUrl: 'fm' }, duration: 2000 },
  ]), [
    { provider: 'netease', access: 'unknown', id: 1, name: 'Track', artist: 'A', prcUrl: 'cover', duration: 1000 },
    { provider: 'netease', access: 'unknown', id: 2, name: 'FM', artist: 'B', prcUrl: 'fm', duration: 2000 },
  ]);
  assert.equal(normalizeHeartModeSongs([{ songInfo: { id: 3, name: 'Heart' } }])[0].id, 3);
});
test('heart sessions choose the owner liked playlist and preserve unconsumed batches', async () => {
  const a = client(7); const session = new HeartModeSession(10, a);
  assert.deepEqual((await session.nextSongs()).map(song => song.id), [10, 11, 12]);
  assert.deepEqual((await session.nextSongs()).map(song => song.id), [13]);
  const call = a.calls.find(item => item.endpoint === '/playmode/intelligence/list');
  assert.equal(call.options.params.pid, 700); assert.equal(call.options.params.id, 10);
  assert.equal(a.calls.filter(item => item.endpoint === '/playmode/intelligence/list').length, 1);
});
test('two account sessions use their own clients and playlist sources', async () => {
  const a = client(1); const b = client(2);
  await Promise.all([new HeartModeSession(10, a).nextSongs(), new HeartModeSession(10, b).nextSongs()]);
  assert.equal(a.calls.at(-1).options.params.pid, 100); assert.equal(b.calls.at(-1).options.params.pid, 200);
});
test('account expiry and empty liked playlists are terminal, network failures are retryable', async () => {
  await assert.rejects(new HeartModeSession(undefined, { get: async () => ({ data: { code: 301 } }) }).nextSongs(), error => !error.retryable && /失效/.test(error.message));
  const empty = client(); const original = empty.get;
  empty.get = (endpoint, options) => endpoint === '/likelist' ? Promise.resolve({ data: { code: 200, ids: [] } }) : original(endpoint, options);
  await assert.rejects(new HeartModeSession(undefined, empty).nextSongs(), error => !error.retryable && /为空/.test(error.message));
  await assert.rejects(new HeartModeSession(undefined, { get: async () => { throw new Error('private request configuration'); } }).nextSongs(), error => error.retryable && !error.message.includes('private'));
});
