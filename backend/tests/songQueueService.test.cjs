const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

// Isolate queue behavior from cookies, networking and the database.
function createQueue(getPlayInfo = async id => ({ url: 'https://example.invalid/' + id, time: 1000 }), recommendations = {}) {
  const broadcasts = [];
  const snapshots = [];
  const songModule = require.resolve('../src/services/netease/song.service.ts');
  const wsModule = require.resolve('../src/services/websocketServer.ts');
  const recommendationModule = require.resolve('../src/services/netease/recommendation.service.ts');
  const queueModule = require.resolve('../src/services/songQueueService.ts');
  require.cache[songModule] = { exports: { getSongPlayInfo: getPlayInfo } };
  require.cache[wsModule] = { exports: { broadcast: data => broadcasts.push(data), setCurrentSongInfo: (...data) => snapshots.push(data) } };
  require.cache[recommendationModule] = { exports: {
    getDailyRecommendedSongs: recommendations.daily || (async () => []),
    getPersonalFmSongs: recommendations.fm || (async () => []),
  } };
  delete require.cache[queueModule];
  const queue = require(queueModule).songQueueService;
  return { queue, broadcasts, snapshots };
}
const song = (id, duration = 1000) => ({ id, name: 'Track ' + id, artist: 'Test', duration, prcUrl: '' });
const settle = () => new Promise(resolve => setImmediate(resolve));

test('advances once at the millisecond duration and broadcasts an empty final state', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue, broadcasts } = createQueue();
  queue.enqueue(song(1)); queue.enqueue(song(2));
  await settle();
  assert.equal(queue.getCurrentSong().song.id, 1);
  assert.equal(queue.getQueue().length, 1);
  t.mock.timers.tick(999);
  assert.equal(queue.getCurrentSong().song.id, 1);
  t.mock.timers.tick(1); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
  assert.equal(queue.getQueue().length, 0);
  t.mock.timers.tick(1000); await settle();
  assert.equal(queue.getCurrentSong(), null);
  assert.equal(broadcasts.filter(data => data.type === 'PLAY_SONG' && data.payload.song).length, 2);
  assert.equal(broadcasts.at(-1).payload.song, null);
});

test('manual skip cancels the old timer instead of cutting short the next song', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue();
  queue.enqueue(song(1)); queue.enqueue(song(2, 2000)); queue.enqueue(song(3));
  await settle();
  t.mock.timers.tick(500); queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
  t.mock.timers.tick(500); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
  t.mock.timers.tick(1500); await settle();
  assert.equal(queue.getCurrentSong().song.id, 3);
});

test('concurrent enqueue waits for the pending song URL', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveFirst;
  const calls = [];
  const { queue } = createQueue(id => {
    calls.push(id);
    return new Promise(resolve => { resolveFirst = resolve; });
  });
  queue.enqueue(song(1)); queue.enqueue(song(2));
  assert.deepEqual(calls, ['1']);
  assert.equal(queue.getQueue().length, 1);
  resolveFirst({ url: 'https://example.invalid/1', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong().song.id, 1);
});

test('an old pending URL cannot overwrite playback after a skip', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveFirst;
  const { queue } = createQueue(id => id === '1' ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve({ url: 'https://example.invalid/' + id, time: 1000 }));
  queue.enqueue(song(1)); queue.enqueue(song(2));
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
  resolveFirst({ url: 'https://example.invalid/1', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
});

test('unavailable songs do not stall the queue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(async id => {
    if (id === '1') throw new Error('Unavailable');
    return { url: 'https://example.invalid/' + id, time: 1000 };
  });
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
});

test('manual requests play before daily songs and FM follows the daily queue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fmCalls = 0;
  const { queue, broadcasts } = createQueue(undefined, {
    daily: async () => [song(10), song(11), song(12), song(13)],
    fm: async () => { fmCalls++; return [song(10), song(12), song(20), song(21), song(22)]; },
  });
  queue.enqueue(song(1)); queue.enqueue(song(2));
  await queue.startDailyRecommendations(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 1);
  assert.deepEqual(queue.getQueue().map(item => item.id), [2, 10, 11, 12, 13]);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 2);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 10);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 11);
  assert.equal(fmCalls, 1);
  assert.deepEqual(queue.getQueue().map(item => [item.id, item.source]), [[12, 'daily'], [13, 'daily'], [20, 'fm']]);
  queue.enqueue(song(3));
  assert.equal(queue.getQueue()[0].id, 3);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 3);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 12);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 13);
  queue.skipToNext(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 20);
  assert.ok(broadcasts.some(item => item.type === 'RECOMMENDATIONS_UPDATED' && item.payload.enabled));
});

test('concurrent start requests fetch daily songs only once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveDaily, calls = 0;
  const { queue } = createQueue(undefined, { daily: () => { calls++; return new Promise(resolve => { resolveDaily = resolve; }); } });
  const first = queue.startDailyRecommendations();
  const second = queue.startDailyRecommendations();
  assert.equal(first, second);
  assert.equal(queue.getRecommendationState().loading, true);
  resolveDaily([song(10), song(11), song(12), song(13)]);
  await first; await settle();
  await queue.startDailyRecommendations();
  assert.equal(calls, 1);
  assert.equal(queue.getCurrentSong().song.id, 10);
});

test('manual requests take priority while a recommended URL is still loading', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveRecommended;
  const { queue } = createQueue(id => id === '10' ? new Promise(resolve => { resolveRecommended = resolve; }) : Promise.resolve({ url: 'https://example.invalid/' + id, time: 1000 }), {
    daily: async () => [song(10), song(11), song(12), song(13)],
  });
  await queue.startDailyRecommendations();
  queue.enqueue(song(1));
  resolveRecommended({ url: 'https://example.invalid/10', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong().song.id, 1);
  assert.equal(queue.getQueue()[0].id, 10);
});

test('FM does not duplicate a recommendation whose URL is pending', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveRecommended;
  const { queue } = createQueue(() => new Promise(resolve => { resolveRecommended = resolve; }), {
    daily: async () => [song(10), song(11), song(12)],
    fm: async () => [song(10), song(20), song(21)],
  });
  await queue.startDailyRecommendations(); await settle();
  assert.deepEqual(queue.getQueue().map(item => item.id), [11, 12, 20]);
  resolveRecommended({ url: 'https://example.invalid/10', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong().song.id, 10);
});

test('stopping recommendations preserves the current song and manual requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(undefined, { daily: async () => [song(10), song(11), song(12), song(13)] });
  await queue.startDailyRecommendations(); await settle();
  queue.enqueue(song(1));
  const state = queue.stopRecommendations();
  assert.deepEqual(state, { enabled: false, loading: false, phase: null, queued: 0, error: null });
  assert.equal(queue.getCurrentSong().song.id, 10);
  assert.deepEqual(queue.getQueue().map(item => item.id), [1]);
  t.mock.timers.tick(1000); await settle();
  assert.equal(queue.getCurrentSong().song.id, 1);
  t.mock.timers.tick(1000); await settle();
  assert.equal(queue.getCurrentSong(), null);
});

test('an old daily response cannot restore recommendations after stop and restart', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const resolvers = [];
  const { queue } = createQueue(undefined, { daily: () => new Promise(resolve => resolvers.push(resolve)) });
  const oldRequest = queue.startDailyRecommendations();
  queue.stopRecommendations();
  const newRequest = queue.startDailyRecommendations();
  resolvers[1]([song(20), song(21), song(22), song(23)]);
  await newRequest; await settle();
  resolvers[0]([song(10), song(11), song(12), song(13)]);
  await oldRequest; await settle();
  assert.equal(queue.getCurrentSong().song.id, 20);
  assert.deepEqual(queue.getQueue().map(item => item.id), [21, 22, 23]);
});

test('an old FM response is ignored after stopping', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveFm;
  const { queue } = createQueue(undefined, {
    daily: async () => [song(10)],
    fm: () => new Promise(resolve => { resolveFm = resolve; }),
  });
  await queue.startDailyRecommendations(); await settle();
  assert.equal(queue.getRecommendationState().loading, true);
  queue.stopRecommendations();
  resolveFm([song(20), song(21), song(22)]); await settle();
  assert.equal(queue.getCurrentSong().song.id, 10);
  assert.equal(queue.getQueue().length, 0);
  assert.equal(queue.getRecommendationState().enabled, false);
});

test('an old recommended URL cannot play after stop and restart', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveOld, starts = 0;
  const { queue } = createQueue(id => id === '10' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ url: 'https://example.invalid/' + id, time: 1000 }), {
    daily: async () => (++starts === 1 ? [10, 11, 12, 13] : [20, 21, 22, 23]).map(id => song(id)),
  });
  await queue.startDailyRecommendations();
  queue.stopRecommendations();
  await queue.startDailyRecommendations();
  resolveOld({ url: 'https://example.invalid/10', time: 1000 }); await settle();
  assert.equal(queue.getCurrentSong().song.id, 20);
  assert.ok(!queue.getQueue().some(item => item.id === 10));
});

test('duplicate or empty FM results have bounded requests and a 30 second retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const { queue } = createQueue(undefined, {
    daily: async () => [song(10, 900000)],
    fm: async () => { calls++; return [song(10)]; },
  });
  await queue.startDailyRecommendations(); await settle();
  assert.equal(calls, 3);
  assert.equal(queue.getQueue().length, 0);
  assert.equal(queue.getRecommendationState().loading, false);
  assert.match(queue.getRecommendationState().error, /重试/);
  queue.enqueue(song(1));
  assert.equal(calls, 3);
  t.mock.timers.tick(29999); await settle(); assert.equal(calls, 3);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 6);
  queue.stopRecommendations();
  t.mock.timers.tick(30000); await settle(); assert.equal(calls, 6);
});

test('daily results filter duplicates, manual songs and recently played songs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(undefined, {
    daily: async () => [1, 2, 10, 10, 11, 12, 13].map(id => song(id)),
  });
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle();
  await queue.startDailyRecommendations();
  assert.deepEqual(queue.getQueue().map(item => item.id), [2, 10, 11, 12, 13]);
});

test('a failed daily request disables the mode and can be retried', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const { queue } = createQueue(undefined, {
    daily: async () => { if (++calls === 1) throw new Error('每日推荐暂不可用'); return [10, 11, 12, 13].map(id => song(id)); },
  });
  await assert.rejects(queue.startDailyRecommendations(), /每日推荐暂不可用/);
  assert.equal(queue.getRecommendationState().enabled, false);
  assert.equal(queue.getRecommendationState().loading, false);
  await queue.startDailyRecommendations(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 10);
});

test('an unavailable recommended song is skipped and excluded from FM refill', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(async id => ({ url: id === '10' ? '' : 'https://example.invalid/' + id, time: 1000 }), {
    daily: async () => [10, 11, 12, 13].map(id => song(id)),
    fm: async () => [10, 20, 21, 22].map(id => song(id)),
  });
  await queue.startDailyRecommendations(); await settle();
  assert.equal(queue.getCurrentSong().song.id, 11);
  assert.deepEqual(queue.getQueue().map(item => item.id), [12, 13, 20]);
});

test('a recommended song explicitly moved to the top is kept as a manual request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue } = createQueue(undefined, { daily: async () => [10, 11, 12, 13].map(id => song(id)) });
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle();
  await queue.startDailyRecommendations();
  queue.moveToTop(queue.getQueue().find(item => item.id === 12).instanceId);
  queue.stopRecommendations();
  assert.deepEqual(queue.getQueue().map(item => [item.id, item.source]), [[12, 'manual'], [2, 'manual']]);
});
