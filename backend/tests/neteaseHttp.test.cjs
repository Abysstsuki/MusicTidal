const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const vendorPath = require.resolve('../vendor/netease');
const real = require(vendorPath);
let calls = [];
let responseCode = 200;
let beforeRespond;
const fakeModule = async params => { calls.push(params); await beforeRespond?.(params); return { status: 200, body: { code: responseCode, result: { songs: [] } }, cookie: [] }; };
require.cache[vendorPath].exports = { ...real, cloudsearch: fakeModule, user_account: fakeModule };
const { createNeteaseClient, neteaseHttp } = require('../src/utils/neteaseHttp');
test('request/cache identities are account-specific and guest requests ignore the global cookie', async t => {
  const previousCookie = process.env.NETEASE_COOKIE, previousGuest = process.env.NETEASE_ANONYMOUS_TOKEN;
  process.env.NETEASE_COOKIE = 'MUSIC_U=global-fixture'; process.env.NETEASE_ANONYMOUS_TOKEN = 'anonymous-fixture';
  t.after(() => { if (previousCookie === undefined) delete process.env.NETEASE_COOKIE; else process.env.NETEASE_COOKIE = previousCookie; if (previousGuest === undefined) delete process.env.NETEASE_ANONYMOUS_TOKEN; else process.env.NETEASE_ANONYMOUS_TOKEN = previousGuest; });
  const a = createNeteaseClient('MUSIC_U=account-a'), b = createNeteaseClient('MUSIC_U=account-b');
  const options = { params: { keywords: 'isolation-fixture' } };
  await Promise.all([a.get('/cloudsearch', options), b.get('/cloudsearch', options)]);
  await a.get('/cloudsearch', options); assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.cookie).sort(), ['MUSIC_U=account-a', 'MUSIC_U=account-b']);
  await neteaseHttp.get('/cloudsearch', options);
  assert.equal(calls.at(-1).cookie, ''); assert.equal(calls.at(-1).anonymousToken, 'anonymous-fixture');
});
test('expired authorization is reported once and upstream payloads stay private', async () => {
  responseCode = 401; let expired = 0;
  const client = createNeteaseClient('MUSIC_U=expired-fixture', () => expired++);
  for (let i = 0; i < 2; i++) await assert.rejects(client.get('/user/account'), error => error.code === 401 && error.body === undefined && !error.message.includes('expired-fixture'));
  assert.equal(expired, 1);
});

test('binding disposal drops stale in-flight results and clears only that account cache', async t => {
  responseCode = 200; let expired = 0;
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  beforeRespond = async params => { if (params.cookie === 'MUSIC_U=disposed-fixture') { started(); await gate; } };
  t.after(() => { release(); beforeRespond = undefined; responseCode = 200; });
  const options = { params: { keywords: 'disposal-fixture' } };
  const other = createNeteaseClient('MUSIC_U=unaffected-fixture');
  await other.get('/cloudsearch', options);
  const client = createNeteaseClient('MUSIC_U=disposed-fixture', () => expired++);
  const pending = client.get('/cloudsearch', options);
  await entered;
  client.dispose(true); release();
  await assert.rejects(pending, error => error.code === 409);
  beforeRespond = undefined;
  const callCount = calls.length;
  await other.get('/cloudsearch', options);
  assert.equal(calls.length, callCount, 'unrelated cached requests remain cached');
  await createNeteaseClient('MUSIC_U=disposed-fixture').get('/cloudsearch', options);
  assert.equal(calls.length, callCount + 1, 'stale result must not recreate the invalidated cache');
  const stale = createNeteaseClient('MUSIC_U=stale-expiry-fixture', () => expired++);
  beforeRespond = async params => { if (params.cookie === 'MUSIC_U=stale-expiry-fixture') stale.dispose(true); };
  responseCode = 401;
  await assert.rejects(stale.get('/user/account'));
  assert.equal(expired, 0, 'an old request cannot invalidate a replacement binding');
});

test('a live client still reports expiry when its coalesced request creator was disposed', async t => {
  responseCode = 401; let oldExpired = 0, liveExpired = 0, release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  beforeRespond = async () => { started(); await gate; };
  t.after(() => { release(); beforeRespond = undefined; responseCode = 200; });
  const old = createNeteaseClient('MUSIC_U=shared-expiry-fixture', () => oldExpired++);
  const live = createNeteaseClient('MUSIC_U=shared-expiry-fixture', () => liveExpired++);
  const options = { params: { keywords: 'shared-expiry-fixture' } };
  const first = old.get('/cloudsearch', options); await entered;
  const second = live.get('/cloudsearch', options);
  await new Promise(resolve => setImmediate(resolve));
  old.dispose(); release();
  await assert.rejects(first); await assert.rejects(second);
  assert.equal(oldExpired, 0); assert.equal(liveExpired, 1);
});

test('desktop QR transport retains session identity and accepts plain string status codes', async () => {
  const axiosPath = require.resolve('axios'), requestPath = require.resolve('../vendor/netease/util/request');
  const axiosCache = require.cache[axiosPath], requestCache = require.cache[requestPath];
  const originalAxios = axiosCache.exports;
  let code;
  axiosCache.exports = { default: async settings => {
    assert.equal(settings.url, 'https://interfacepc.music.163.com/eapi/login/qrcode/client/login');
    assert.ok(settings.headers.Cookie.includes('NMTID=qr-session'));
    return { status: 200, data: Buffer.from(JSON.stringify({ code })), headers: { 'set-cookie': ['MUSIC_U=qr-fixture; Path=/'] } };
  } };
  delete require.cache[requestPath];
  try {
    const request = require(requestPath);
    for (code of ['800', '801', '802', '803']) {
      const result = await request('POST', 'https://interfacepc.music.163.com/api/login/qrcode/client/login', { key: 'qr-fixture', type: 3, e_r: false }, {
        crypto: 'eapi', url: '/api/login/qrcode/client/login', cookie: { os: 'pc', NMTID: 'qr-session' }, ua: 'pc',
      });
      assert.equal(result.status, 200); assert.equal(result.body.code, Number(code));
      assert.equal(result.cookie.length, 1);
    }
  } finally {
    axiosCache.exports = originalAxios; require.cache[requestPath] = requestCache;
  }
});
