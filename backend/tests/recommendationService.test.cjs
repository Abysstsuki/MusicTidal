const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

function createService(get) {
  const httpModule = require.resolve('../src/utils/neteaseHttp.ts');
  const serviceModule = require.resolve('../src/services/netease/recommendation.service.ts');
  require.cache[httpModule] = { exports: { neteaseHttp: { get } } };
  delete require.cache[serviceModule];
  return require(serviceModule);
}

test('normalizes daily and FM formats and drops invalid or duplicate songs', () => {
  const { normalizeRecommendedSongs } = createService();
  assert.deepEqual(normalizeRecommendedSongs([
    { id: 1, name: ' Daily ', ar: [{ name: 'A' }, { name: 'B' }], al: { picUrl: 'https://example.invalid/daily.jpg' }, dt: 1000 },
    { id: 2, name: 'FM', artists: [{ name: 'C' }], album: { picUrl: 'https://example.invalid/fm.jpg' }, duration: 2000 },
    { id: 1, name: 'Duplicate' }, null, 3, { id: -1, name: 'Invalid' }, { id: 4, name: ' ' }, { id: '5', name: 'Invalid' },
    { id: 6, name: 'Fallback', artists: [null, { name: 42 }], duration: -1 },
  ]), [
    { id: 1, name: 'Daily', artist: 'A, B', prcUrl: 'https://example.invalid/daily.jpg', duration: 1000 },
    { id: 2, name: 'FM', artist: 'C', prcUrl: 'https://example.invalid/fm.jpg', duration: 2000 },
    { id: 6, name: 'Fallback', artist: '', prcUrl: '', duration: 0 },
  ]);
  assert.deepEqual(normalizeRecommendedSongs({ dailySongs: [] }), []);
});

test('uses the existing endpoints and distinct cache keys for consecutive requests', async () => {
  const calls = [];
  const { getDailyRecommendedSongs, getPersonalFmSongs } = createService(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { data: endpoint === '/recommend/songs' ? { code: 200, data: { dailySongs: [{ id: 1, name: 'Daily' }] } } : { code: 200, data: [{ id: 2, name: 'FM' }] } };
  });
  assert.equal((await getDailyRecommendedSongs())[0].id, 1);
  assert.equal((await getPersonalFmSongs())[0].id, 2);
  await getPersonalFmSongs();
  assert.deepEqual(calls.map(call => call.endpoint), ['/recommend/songs', '/personal_fm', '/personal_fm']);
  assert.equal(new Set(calls.map(call => call.options.params.timestamp)).size, 3);
});

test('accepts the older daily recommendation response shape', async () => {
  const { getDailyRecommendedSongs } = createService(async () => ({ data: { code: 200, recommend: [{ id: 1, name: 'Legacy daily' }] } }));
  assert.equal((await getDailyRecommendedSongs())[0].name, 'Legacy daily');
});

test('upstream errors are replaced by safe user messages', async () => {
  const { getDailyRecommendedSongs, getPersonalFmSongs } = createService(async () => { throw new Error('private upstream request details'); });
  await assert.rejects(getDailyRecommendedSongs(), error => error.message === '每日推荐暂不可用，请检查网易云登录状态或稍后重试');
  await assert.rejects(getPersonalFmSongs(), error => error.message === '私人 FM 暂不可用，稍后会自动重试');
  const invalid = createService(async () => ({ data: { code: 301, message: 'private upstream details' } }));
  await assert.rejects(invalid.getDailyRecommendedSongs(), /每日推荐暂不可用/);
});
