const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { NeteaseBindingService, mergeCookies } = require('../src/services/netease/binding.service');
const { encryptCredential, decryptCredential } = require('../src/utils/credentialCrypto');
function fixture(t, check, hooks = {}) {
  const previousKey = process.env.NETEASE_COOKIE_ENCRYPTION_KEY;
  process.env.NETEASE_COOKIE_ENCRYPTION_KEY = 'a'.repeat(64);
  t.after(() => { if (previousKey === undefined) delete process.env.NETEASE_COOKIE_ENCRYPTION_KEY; else process.env.NETEASE_COOKIE_ENCRYPTION_KEY = previousKey; });
  let user = { neteaseCookieEncrypted: null, neteaseProfile: null, neteaseBoundAt: null, neteaseInvalidAt: null };
  let writes = 0;
  const repository = {
    findUnique: async () => ({ ...user }),
    update: async ({ data }) => { await hooks.save?.(data); writes++; user = { ...user, ...data }; if (typeof user.neteaseProfile?.uid !== 'string') user.neteaseProfile = null; return user; },
    updateMany: async ({ where, data }) => {
      if (user.neteaseCookieEncrypted !== where.neteaseCookieEncrypted || user.neteaseInvalidAt) return { count: 0 };
      user = { ...user, ...data }; return { count: 1 };
    },
  };
  let keys = 0;
  const transport = {
    call: async (endpoint, cookie, params) => {
      assert.equal(typeof params.timestamp, 'number');
      assert.ok(cookie.includes('deviceId='));
      if (endpoint === '/login/qr/key') return { body: { code: 200, unikey: 'test-key-' + ++keys }, cookie: ['NMTID=fixture; Path=/'] };
      assert.equal(params.noCookie, 'true'); assert.ok(cookie.includes('NMTID=fixture'));
      return check();
    },
    client: cookie => ({ get: async endpoint => { assert.equal(endpoint, '/login/status'); assert.ok(cookie.includes('MUSIC_U=fixture')); await hooks.account?.(); return { data: { code: 200, profile: { userId: 7, nickname: 'Fixture', avatarUrl: '' } } }; } }),
  };
  const service = new NeteaseBindingService(repository, transport); t.after(() => service.dispose());
  return { service, writes: () => writes, stored: () => user };
}
test('AES-GCM encrypts with fresh nonces and rejects tampering', t => {
  fixture(t, () => {});
  const a = encryptCredential('MUSIC_U=fixture'), b = encryptCredential('MUSIC_U=fixture');
  assert.notEqual(a, b); assert.equal(decryptCredential(a), 'MUSIC_U=fixture'); assert.ok(!a.includes('fixture'));
  const parts = a.split('.'); parts[2] = Buffer.alloc(16).toString('base64');
  assert.throws(() => decryptCredential(parts.join('.')), /无法解密/);
});
test('cookie merge removes attributes and keeps values containing equals signs', () => {
  assert.equal(mergeCookies('a=old', ['a=new=value; Path=/; HttpOnly', 'MUSIC_U=fixture; SameSite=None']), 'a=new=value; MUSIC_U=fixture');
});
test('QR states bind once, return sanitized metadata and persist an encrypted cookie', async t => {
  const codes = [801, 802, 803];
  const { service, writes, stored } = fixture(t, () => ({ body: { code: codes.shift() }, cookie: ['MUSIC_U=fixture; Path=/'] }));
  const qr = await service.createQr(1);
  assert.equal((await service.checkQr(2, qr.sessionId)).status, 'expired');
  assert.equal((await service.checkQr(1, qr.sessionId)).status, 'waiting');
  assert.equal((await service.checkQr(1, qr.sessionId)).status, 'scanned');
  const result = await service.checkQr(1, qr.sessionId);
  assert.equal(result.status, 'authorized'); assert.equal(result.binding.profile.uid, '7');
  assert.deepEqual(await service.checkQr(1, qr.sessionId), result); assert.equal(writes(), 1);
  assert.ok(!JSON.stringify(result).includes('MUSIC_U')); assert.ok(!JSON.stringify(result).includes('neteaseCookieEncrypted'));
  assert.ok(decryptCredential(stored().neteaseCookieEncrypted).includes('MUSIC_U=fixture'));
  assert.equal((await service.status(1)).status, 'bound');
});
test('cancelled, replaced and expired QR sessions cannot bind', async t => {
  let resolve;
  const { service, writes } = fixture(t, () => new Promise(done => { resolve = done; }));
  const old = await service.createQr(1); const pending = service.checkQr(1, old.sessionId);
  await service.cancelQr(1, old.sessionId); resolve({ body: { code: 803 }, cookie: ['MUSIC_U=fixture'] });
  assert.equal((await pending).status, 'expired'); assert.equal(writes(), 0);
  const first = await service.createQr(1); const second = await service.createQr(1);
  assert.equal((await service.checkQr(1, first.sessionId)).status, 'expired');
  assert.notEqual(first.sessionId, second.sessionId);
});
test('network failure does not replace credentials and stale expiry cannot invalidate a new binding', async t => {
  const { service, stored } = fixture(t, () => ({ body: { code: 803 }, cookie: ['MUSIC_U=fixture'] }));
  const first = await service.createQr(1); await service.checkQr(1, first.sessionId);
  const old = stored().neteaseCookieEncrypted;
  const second = await service.createQr(1); await service.checkQr(1, second.sessionId);
  await service.markInvalid(1, old); assert.equal((await service.status(1)).status, 'bound');
  await service.markInvalid(1, stored().neteaseCookieEncrypted); assert.equal((await service.status(1)).status, 'expired');
  await service.unbind(1); assert.equal((await service.status(1)).status, 'unbound');
  assert.equal((await service.checkQr(1, second.sessionId)).status, 'expired');
});
test('transport errors do not save a binding and logout cancels pending authorization', async t => {
  const { service, writes } = fixture(t, () => { throw new Error('safe transport failure'); });
  const qr = await service.createQr(1); await assert.rejects(service.checkQr(1, qr.sessionId));
  assert.equal(writes(), 0); assert.equal((await service.status(1)).status, 'unbound');
  await service.cancelAll(1); assert.equal((await service.checkQr(1, qr.sessionId)).status, 'expired');
});

test('confirmed QR credentials survive temporary account and database failures without repolling', async t => {
  let polls = 0, accounts = 0, saves = 0;
  const { service, writes, stored } = fixture(t, () => {
    polls++; return { body: { code: polls === 1 ? 803 : 800 }, cookie: ['MUSIC_U=fixture'] };
  }, {
    account: () => { if (++accounts === 1) throw new Error('temporary account failure'); },
    save: () => { if (++saves === 1) throw Object.assign(new Error('temporary database failure'), { code: 'P1001' }); },
  });
  const qr = await service.createQr(1);
  await assert.rejects(service.checkQr(1, qr.sessionId), error => error.code === 'NETEASE_QR_ACCOUNT_PENDING');
  await assert.rejects(service.checkQr(1, qr.sessionId), error => error.code === 'NETEASE_BINDING_SAVE_FAILED');
  assert.equal((await service.checkQr(1, qr.sessionId)).status, 'authorized');
  assert.equal(polls, 1); assert.equal(writes(), 1);
  assert.ok(decryptCredential(stored().neteaseCookieEncrypted).includes('MUSIC_U=fixture'));
});

test('missing database columns produce a safe migration error and cancel stops confirmed retries', async t => {
  const { service, writes } = fixture(t, () => ({ body: { code: 803 }, cookie: ['MUSIC_U=fixture'] }), {
    save: () => { throw Object.assign(new Error('SQL containing MUSIC_U=fixture'), { code: 'P2022' }); },
  });
  const qr = await service.createQr(1);
  await assert.rejects(service.checkQr(1, qr.sessionId), error => {
    assert.equal(error.status, 503); assert.equal(error.code, 'NETEASE_BINDING_SCHEMA_OUTDATED');
    assert.ok(!error.message.includes('MUSIC_U')); return true;
  });
  await service.cancelAll(1);
  assert.equal((await service.checkQr(1, qr.sessionId)).status, 'expired'); assert.equal(writes(), 0);
});
