const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

// Isolate queue behavior from cookies, networking and the database.
function createQueue(getPlayInfo = async id => ({ url: 'https://example.invalid/' + id, time: 1000 })) {
  const broadcasts = [];
  const snapshots = [];
  const songModule = require.resolve('../src/services/netease/song.service.ts');
  const wsModule = require.resolve('../src/services/websocketServer.ts');
  const queueModule = require.resolve('../src/services/songQueueService.ts');
  require.cache[songModule] = { exports: { getSongPlayInfo: getPlayInfo } };
  require.cache[wsModule] = { exports: { broadcast: data => broadcasts.push(data), setCurrentSongInfo: (...data) => snapshots.push(data) } };
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
