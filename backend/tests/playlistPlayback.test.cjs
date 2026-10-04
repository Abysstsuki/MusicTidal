const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { SongQueueService } = require('../src/services/songQueueService');
const song = id => ({ id, name: 'Track ' + id, artist: 'Test', prcUrl: '', duration: 1000 });
const index = (id, ids) => ({ playlist: { id, name: 'Playlist ' + id, coverUrl: '', creator: 'Test', trackCount: ids.length, isLiked: false }, trackIds: ids });
const settle = () => new Promise(resolve => setImmediate(resolve));
function make(t, overrides = {}) {
  const events = [];
  const queue = new SongQueueService({ getPlayInfo: async id => ({ url: 'https://example.invalid/' + id, time: 1000 }),
    createHeartSession: () => ({ nextSongs: async () => [song(30), song(31), song(32)] }),
    getPlaylistSong: async candidate => song(candidate.songId), emit: event => events.push(event), ...overrides });
  t.after(() => queue.dispose());
  const add = (id, ids) => queue.addPlaylist(index(id, ids), { id: 3, username: 'Member' });
  return { queue, add, events };
}

test('mode switches keep the current timer and preserve both regular and heart queues', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let sessions = 0;
  const { queue, add } = make(t, { createHeartSession: () => { sessions++; return { nextSongs: async () => [song(30), song(31), song(32)] }; } });
  queue.enqueue(song(1)); queue.enqueue(song(2)); await settle(); await queue.startHeartMode();
  const saved = queue.getQueue().map(item => item.id);
  const entry = add(700, [10, 11]); queue.activatePlaylist(entry);
  assert.equal(queue.getCurrentSong().song.id, 1);
  assert.equal(queue.getRecommendationState().paused, true);
  assert.deepEqual(queue.getQueue().map(item => item.id), saved);
  t.mock.timers.tick(1000); await settle();
  assert.equal(queue.getCurrentSong().song.id, 10);
  assert.equal(queue.getCurrentSong().song.source, 'playlist');
  queue.setMode('regular');
  assert.equal(queue.getCurrentSong().song.id, 10);
  t.mock.timers.tick(1000); await settle(); assert.equal(queue.getCurrentSong().song.id, 2);
  assert.equal(queue.getRecommendationState().enabled, true); assert.equal(sessions, 1);
  assert.equal(queue.getPlaylistState().entries[0].remaining, 1);
});

test('shuffle covers the entire selected playlist, stops in place, and repeats only when enabled', async t => {
  t.mock.method(Math, 'random', () => 0);
  const { queue, add } = make(t);
  const ids = Array.from({ length: 65 }, (_, i) => i + 10);
  const a = add(700, ids), b = add(701, [200, 201]);
  assert.equal(add(700, ids), a);
  queue.setPlaylistSettings(a, 'shuffle'); queue.activatePlaylist(a); await settle();
  const heard = [];
  for (let i = 0; i < ids.length; i++) { heard.push(queue.getCurrentSong().song.id); queue.skipToNext(); await settle(); }
  assert.equal(new Set(heard).size, ids.length);
  assert.deepEqual([...heard].sort((x, y) => x - y), ids);
  assert.ok(heard.some(id => id >= 40)); assert.equal(queue.getCurrentSong(), null);
  assert.equal(queue.getPlaylistState().mode, 'playlist'); assert.equal(queue.getPlaylistState().activeEntryId, a);
  assert.equal(queue.getPlaylistState().entries.find(entry => entry.entryId === b).remaining, 2);
  queue.setPlaylistSettings(a, undefined, true); await settle(); assert.ok(queue.getCurrentSong());
});

test('next nominations are FIFO, deduplicated, and do not activate playlist mode', async t => {
  const { queue, add } = make(t);
  queue.enqueue(song(1)); await settle(); const a = add(700, [10, 11, 12, 13]); queue.activatePlaylist(a); queue.setMode('regular');
  queue.nominatePlaylistSong(a, 12); queue.nominatePlaylistSong(a, 11); queue.nominatePlaylistSong(a, 12);
  assert.equal(queue.getPlaylistState().mode, 'regular');
  assert.deepEqual(queue.getPlaylistState().entries[0].priorityNext, [12, 11]);
  const b = add(701, [200]); assert.throws(() => queue.nominatePlaylistSong(b, 200), /当前选定/);
  queue.setMode('playlist'); queue.skipToNext(); await settle(); assert.equal(queue.getCurrentSong().song.id, 12);
  queue.skipToNext(); await settle(); assert.equal(queue.getCurrentSong().song.id, 11);
  queue.skipToNext(); await settle(); assert.equal(queue.getCurrentSong().song.id, 10);
  queue.nominatePlaylistSong(a, 12); queue.skipToNext(); await settle(); assert.equal(queue.getCurrentSong().song.id, 12);
});

test('stale manual URLs and stale playlist details cannot overwrite a new selection', async t => {
  let resolveManual, resolveA; let manualCalls = 0;
  const { queue, add } = make(t, { getPlayInfo: id => id === '1' && !manualCalls++ ? new Promise(resolve => { resolveManual = resolve; }) : Promise.resolve({ url: 'https://example.invalid/' + id, time: 1000 }),
    getPlaylistSong: candidate => candidate.songId === 10 ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve(song(candidate.songId)) });
  queue.enqueue(song(1)); queue.enqueue(song(2)); const a = add(700, [10, 11]), b = add(701, [200]);
  queue.activatePlaylist(a); await settle(); queue.activatePlaylist(b); await settle();
  resolveManual({ url: 'https://example.invalid/1', time: 1000 }); resolveA(song(10)); await settle();
  assert.equal(queue.getCurrentSong().song.id, 200);
  assert.deepEqual(queue.getQueue().map(item => item.id), [1, 2]);
  assert.equal(queue.getPlaylistState().entries.find(entry => entry.entryId === a).remaining, 2);
});

test('concurrent skips advance once, and removing the active playlist keeps its current song', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { queue, add } = make(t); const a = add(700, [10, 11, 12]); queue.activatePlaylist(a); await settle();
  const revision = queue.getPlayback().playbackRevision;
  queue.skipToNext(revision); queue.skipToNext(revision); await settle(); assert.equal(queue.getCurrentSong().song.id, 11);
  queue.removePlaylist(a); assert.equal(queue.getCurrentSong().song.id, 11);
  t.mock.timers.tick(1000); await settle(); assert.equal(queue.getCurrentSong(), null);
  assert.equal(queue.getPlaylistState().mode, 'playlist'); assert.equal(queue.getPlaylistState().entries.length, 0);
});

test('ten unavailable songs halt instead of endlessly repeating, and activation resumes', async t => {
  let unavailable = true;
  const { queue, add } = make(t, { getPlayInfo: async id => { if (unavailable) throw new Error('Unavailable'); return { url: 'https://example.invalid/' + id, time: 1000 }; } });
  const a = add(700, Array.from({ length: 12 }, (_, i) => i + 10));
  queue.setPlaylistSettings(a, undefined, true); queue.activatePlaylist(a); await settle();
  assert.equal(queue.getCurrentSong(), null); assert.match(queue.getPlaylistState().entries[0].error, /10/);
  assert.equal(queue.getPlaylistState().entries[0].remaining, 2);
  unavailable = false; queue.activatePlaylist(a); await settle(); assert.equal(queue.getCurrentSong().song.id, 20);
});

test('binding changes and disposal reject late playlist work without consuming its index', async t => {
  let resolve;
  const { queue, add, events } = make(t, { getPlaylistSong: () => new Promise(done => { resolve = done; }) });
  const a = add(700, [10, 11]); queue.activatePlaylist(a); await settle();
  queue.invalidatePlaylistSource(3); resolve(song(10)); await settle();
  assert.equal(queue.getCurrentSong(), null); assert.equal(queue.getPlaylistState().entries[0].remaining, 2);
  queue.activatePlaylist(a); await settle(); queue.dispose(); const count = events.length; resolve(song(10)); await settle();
  assert.equal(events.length, count); assert.equal(queue.getCurrentSong(), null);
});
