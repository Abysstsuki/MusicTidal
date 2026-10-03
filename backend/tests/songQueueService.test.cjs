const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { SongQueueService } = require('../src/services/songQueueService');
const { HeartModeError } = require('../src/services/netease/recommendation.service');
const song = (id, duration = 1000) => ({ id, name: 'Track ' + id, artist: 'Test', duration, prcUrl: '' });
const settle = () => new Promise(resolve => setImmediate(resolve));
function createQueue(t, getPlayInfo = async id => ({ url: 'https://example.invalid/' + id, time: id === '2' ? 2000 : 1000 }), heart) {
  const broadcasts = [];
  let next = 10;
  const queue = new SongQueueService({ getPlayInfo,
    createHeartSession: () => ({ nextSongs: heart || (async () => [song(next++), song(next++), song(next++)]) }),
    emit: event => broadcasts.push(event) });
  t.after(() => queue.dispose());
  return { queue, broadcasts };
}

test('server advances once at song duration and stores the same playback URL', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue, broadcasts } = createQueue(t);
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle();
  assert.equal(queue.getPlayback().url, 'https://example.invalid/1');
  t.mock.timers.tick(999); assert.equal(queue.getCurrentSong().song.id, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(queue.getCurrentSong().song.id, 2);
  t.mock.timers.tick(1000); await settle(); assert.equal(queue.getCurrentSong(), null);
  assert.equal(broadcasts.filter(event => event.type === 'PLAY_SONG' && event.payload.song).length, 2);
});
test('concurrent skip requests for one playback version advance only once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(t);
  [1, 2, 3].forEach(id => queue.enqueue(song(id))); await settle();
  const version = queue.getPlayback().playbackRevision;
  queue.skipToNext(version); queue.skipToNext(version); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
  assert.deepEqual(queue.getQueue().map(item => item.id), [3]);
});
test('a shorter playable preview advances at the available audio duration', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(t, async id => ({ url: 'https://example.invalid/' + id, time: 30000 }));
  queue.enqueue(song(1, 180000)); queue.enqueue(song(2, 180000)); await settle();
  assert.equal(queue.getPlayback().song.duration, 30000);
  t.mock.timers.tick(30000); await settle(); assert.equal(queue.getPlayback().song.id, 2);
});
test('manual skip cancels the old timer without cutting short the next song', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(t);
  queue.enqueue(song(1)); queue.enqueue(song(2, 2000)); queue.enqueue(song(3)); await settle();
  t.mock.timers.tick(500); queue.skipToNext(); await settle();
  t.mock.timers.tick(500); await settle(); assert.equal(queue.getCurrentSong().song.id, 2);
  t.mock.timers.tick(1500); await settle(); assert.equal(queue.getCurrentSong().song.id, 3);
});
test('a pending URL cannot overwrite playback after a skip', async t => {
  let resolveFirst;
  const { queue } = createQueue(t, id => id === '1' ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve({ url: 'https://example.invalid/' + id, time: 1000 }));
  queue.enqueue(song(1)); queue.enqueue(song(2)); queue.skipToNext(); await settle();
  resolveFirst({ url: 'https://example.invalid/1', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
});
test('unavailable songs do not stall manual playback', async t => {
  const { queue } = createQueue(t, async id => { if (id === '1') throw new Error('Unavailable'); return { url: 'https://example.invalid/' + id, time: 1000 }; });
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
});
test('manual songs take priority and stopping heart mode keeps current playback', async t => {
  const { queue } = createQueue(t);
  queue.enqueue(song(1)); await settle(); await queue.startHeartMode();
  queue.enqueue(song(2)); assert.equal(queue.getQueue()[0].id, 2);
  queue.stopRecommendations();
  assert.equal(queue.getCurrentSong().song.id, 1);
  assert.deepEqual(queue.getQueue().map(item => item.id), [2]);
});
test('stopped heart batches cannot restore an old recommendation session', async t => {
  const resolvers = [];
  const { queue } = createQueue(t, undefined, () => new Promise(resolve => resolvers.push(resolve)));
  queue.enqueue(song(1)); await settle();
  const old = queue.startHeartMode(); queue.stopRecommendations();
  const current = queue.startHeartMode(); resolvers[1]([song(20), song(21), song(22)]); await current;
  resolvers[0]([song(10), song(11), song(12)]); await old;
  assert.deepEqual(queue.getQueue().map(item => item.id), [20, 21, 22]);
});
test('disposed rooms ignore late URLs and never broadcast or restart playback', async t => {
  let resolveUrl;
  const { queue, broadcasts } = createQueue(t, () => new Promise(resolve => { resolveUrl = resolve; }));
  queue.enqueue(song(1)); queue.dispose(); const count = broadcasts.length;
  resolveUrl({ url: 'https://example.invalid/1', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong(), null); assert.equal(broadcasts.length, count);
});
test('disposed heart requests cannot restart refill or retry timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveBatch;
  const { queue, broadcasts } = createQueue(t, undefined, () => new Promise(resolve => { resolveBatch = resolve; }));
  const request = queue.startHeartMode(); queue.dispose(); const count = broadcasts.length;
  resolveBatch([song(10)]); await request; t.mock.timers.tick(180000); await settle();
  assert.equal(queue.getQueue().length, 0); assert.equal(broadcasts.length, count);
});
test('empty recommendations are bounded and retry after 30 seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const { queue } = createQueue(t, undefined, async () => { calls++; return []; });
  await queue.startHeartMode(); assert.equal(calls, 3);
  t.mock.timers.tick(29999); await settle(); assert.equal(calls, 3);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 6);
  queue.stopRecommendations(); t.mock.timers.tick(30000); await settle(); assert.equal(calls, 6);
});
test('authorization errors disable heart mode while preserving manual songs', async t => {
  const { queue } = createQueue(t, undefined, async () => { throw new HeartModeError('授权已过期', false); });
  queue.enqueue(song(1)); await settle(); queue.enqueue(song(2)); await queue.startHeartMode();
  assert.equal(queue.getRecommendationState().enabled, false);
  assert.match(queue.getRecommendationState().error, /授权已过期/);
  assert.deepEqual(queue.getQueue().map(item => item.id), [2]);
});
test('replacing authorization preserves the playing timer and manual queue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(t);
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle(); await queue.startHeartMode();
  queue.resetAuthorization(); t.mock.timers.tick(1000); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2); assert.equal(queue.getRecommendationState().enabled, false);
});
test('a heart song moved to the top becomes a manual request and survives stopping', async t => {
  const { queue } = createQueue(t);
  queue.enqueue(song(1)); await settle(); await queue.startHeartMode();
  const target = queue.getQueue()[1]; queue.moveToTop(target.instanceId); queue.stopRecommendations();
  assert.deepEqual(queue.getQueue().map(item => [item.id, item.source]), [[target.id, 'manual']]);
});
