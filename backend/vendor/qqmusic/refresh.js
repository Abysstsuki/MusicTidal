'use strict';
const { request, cookies, merge, hash, MUSICU } = require('./request');
// Legacy Cookies do not contain keyExpiresIn. This is the lifetime observed
// from QQ's web login/refresh responses; new credentials retain the actual TTL.
const LEGACY_KEY_LIFETIME_MS = 259200000;
function timestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? (number < 1e12 ? number * 1000 : number) : null;
}
function credentialInfo(cookie) {
  const c = cookies(cookie), musicid = Number(String(c.qqmusic_uin || c.uin || '').replace(/^o/, ''));
  const qq = Number(c.tmeLoginType || 2) === 2 && !(c.qqmusic_key || c.qm_keyst || '').startsWith('W_X');
  const createdAt = timestamp(c.psrf_musickey_createtime);
  return { canRefresh: qq && Number.isSafeInteger(musicid) && musicid > 0 &&
    Boolean((c.qqmusic_key || c.qm_keyst) && c.psrf_qqrefresh_token && c.psrf_qqaccess_token && c.psrf_qqopenid),
    expiresAt: qq && createdAt ? createdAt + LEGACY_KEY_LIFETIME_MS : null };
}
function loginCredential(cookie, data = {}) {
  const c = cookies(cookie);
  if (Number(data.loginType ?? c.tmeLoginType ?? 2) !== 2) return { cookie, expiresAt: null };
  const mapping = { refresh_token: 'psrf_qqrefresh_token', access_token: 'psrf_qqaccess_token',
    openid: 'psrf_qqopenid', unionid: 'psrf_qqunionid', expired_at: 'psrf_access_token_expiresAt',
    musickeyCreateTime: 'psrf_musickey_createtime' };
  const pairs = Object.entries(mapping).filter(([field]) => data[field] !== undefined && data[field] !== null && data[field] !== '')
    .map(([field, name]) => `${name}=${data[field]}`);
  cookie = merge(cookie, pairs);
  const createdAt = timestamp(data.musickeyCreateTime || cookies(cookie).psrf_musickey_createtime);
  const lifetime = Number(data.keyExpiresIn);
  const expiresAt = createdAt && Number.isFinite(lifetime) && lifetime > 0
    ? createdAt + lifetime * 1000 : credentialInfo(cookie).expiresAt;
  return { cookie, expiresAt };
}
function failure(reason, upstreamCode) {
  const error = new Error('QQ 音乐凭据续期暂不可用');
  error.reason = reason;
  if (Number.isSafeInteger(upstreamCode)) error.upstreamCode = upstreamCode;
  return error;
}
async function refreshCredential(cookie, signal) {
  if (!credentialInfo(cookie).canRefresh) throw failure('MISSING_REFRESH_TICKETS');
  const c = cookies(cookie), musicid = Number(String(c.qqmusic_uin || c.uin).replace(/^o/, ''));
  const key = c.qqmusic_key || c.qm_keyst;
  const response = await request(MUSICU, { method: 'POST', responseType: 'text', signal,
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    data: JSON.stringify({ comm: { platform: 'yqq', ct: 24, cv: 0, uin: musicid, tmeLoginType: 2, authst: key, g_tk: hash(key) },
      req: { module: 'QQConnectLogin.LoginServer', method: 'QQLogin', param: { musicid, musickey: key,
        openid: c.psrf_qqopenid, access_token: c.psrf_qqaccess_token, refresh_token: c.psrf_qqrefresh_token,
        expired_in: Number(c.psrf_access_token_expiresAt || 0), refresh_key: '' } } }) });
  let body;
  try { body = JSON.parse(String(response.data).replace(/("musicid"\s*:\s*)(\d+)/g, '$1"$2"')); }
  catch { throw failure('INVALID_RESPONSE'); }
  const code = Number(body?.req?.code ?? body?.code);
  if (Number(body?.code) !== 0 || code !== 0) throw failure('UPSTREAM_REJECTED', code);
  const data = body.req?.data || {}, headers = response.headers['set-cookie'] || [];
  const received = cookies(merge('', headers));
  const nextKey = data.musickey || received.qqmusic_key || received.qm_keyst;
  if (!nextKey) throw failure('MISSING_MUSIC_CREDENTIALS');
  const nextId = Number(data.musicid || received.qqmusic_uin || received.uin || musicid);
  if (nextId !== musicid || Number(data.loginType ?? 2) !== 2) throw failure('ACCOUNT_CHANGED');
  const nextCookie = merge(merge(cookie, headers), [`uin=${musicid}`, `qqmusic_uin=${musicid}`,
    `qqmusic_key=${nextKey}`, `qm_keyst=${nextKey}`, 'tmeLoginType=2']);
  const result = loginCredential(nextCookie, data);
  if (!result.expiresAt) throw failure('MISSING_EXPIRY');
  return result;
}
module.exports = { credentialInfo, loginCredential, refreshCredential };
