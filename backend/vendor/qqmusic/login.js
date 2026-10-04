'use strict';
const { randomUUID } = require('crypto');
const { CookieJar } = require('tough-cookie');
const { request, cookies, merge, hash, MUSICU } = require('./request');
const WX_APPID = 'wx48db31d50e334801';
const QQ_LOGIN_REFERER = 'https://xui.ptlogin2.qq.com/';
const QQ_OAUTH_RETURN = 'https://graph.qq.com/oauth2.0/login_jump';
const SIGNATURE_HOSTS = new Set(['ssl.ptlogin2.qq.com', 'ptlogin2.qq.com', 'ssl.ptlogin2.graph.qq.com']);
const SIGNATURE_MAX_REDIRECTS = 5;
function failure(reason, metadata = {}) {
  return Object.assign(new Error('QQ 音乐登录步骤失败'), { reason, ...metadata });
}
async function loginStep(stage, work) {
  try { return await work(); }
  catch (error) {
    if (error.stage) throw error;
    const reason = error.reason || (['TIMEOUT', 'NETWORK'].includes(error.code) ? error.code : 'INVALID_RESPONSE');
    throw Object.assign(failure(reason), { stage,
      ...(Number.isInteger(error.httpStatus) ? { httpStatus: error.httpStatus } : {}),
      ...(Number.isSafeInteger(error.upstreamCode) ? { upstreamCode: error.upstreamCode } : {}),
      ...(Number.isInteger(error.redirectCount) ? { redirectCount: error.redirectCount } : {}),
      ...(['qq_signature', 'qq_oauth', 'other', 'none'].includes(error.redirectTarget) ? { redirectTarget: error.redirectTarget } : {}) });
  }
}
function signatureTarget(value, base, initial = false) {
  let target;
  try { target = new URL(value, base); } catch { throw failure('INVALID_REDIRECT', { redirectTarget: 'other' }); }
  // Upgrade legacy QQ redirects before transmitting any ticket or Cookie.
  if (target.protocol === 'http:') target.protocol = 'https:';
  const signature = SIGNATURE_HOSTS.has(target.hostname) && target.pathname === '/check_sig';
  const oauth = !initial && target.hostname === 'graph.qq.com' && target.pathname === '/oauth2.0/login_jump';
  if (target.protocol !== 'https:' || target.port || target.username || target.password || target.hash || (!signature && !oauth)) {
    throw failure('INVALID_REDIRECT', { redirectTarget: 'other' });
  }
  return target;
}
function cookieJar(state) {
  if (!state.cookieJar) {
    state.cookieJar = new CookieJar();
    // Support private in-memory states created before obtaining a response.
    for (const [name, value] of Object.entries(cookies(state.cookie))) {
      const domain = ['p_skey', 'p_uin', 'pt4_token'].includes(name) ? 'graph.qq.com' : 'qq.com';
      state.cookieJar.setCookieSync(`${name}=${value}; Domain=${domain}; Path=/; Secure`, 'https://' + domain);
    }
  }
  return state.cookieJar;
}
function cookieHeader(state, url) { return cookieJar(state).getCookieStringSync(url); }
async function sessionRequest(state, url, options = {}) {
  const response = await request(url, { ...options,
    headers: { ...options.headers, Cookie: options.headers?.Cookie ?? cookieHeader(state, url) } });
  for (const header of response.headers['set-cookie'] || []) {
    // Cookie identity includes domain and path. A qq.com deletion must not
    // erase the graph.qq.com p_skey in the same Tencent response.
    cookieJar(state).setCookieSync(header, url, { ignoreError: true });
  }
  return response;
}
async function confirmSignature(state) {
  if (state.signatureChecked && cookies(cookieHeader(state, QQ_OAUTH_RETURN)).p_skey) return;
  let target = signatureTarget(state.signatureCursor || state.checkSig, undefined, !state.signatureCursor);
  const deadline = Date.now() + 15000;
  const visited = new Set();
  for (;;) {
    const redirectCount = state.signatureRedirects || 0;
    const redirectTarget = target.pathname === '/check_sig' ? 'qq_signature' : 'qq_oauth';
    if (visited.has(target.href)) throw failure('REDIRECT_LOOP', { redirectCount, redirectTarget });
    const timeout = deadline - Date.now();
    if (timeout <= 0) throw failure('TIMEOUT', { redirectCount, redirectTarget });
    visited.add(target.href);
    const signature = await sessionRequest(state, target.href, { timeout, headers: { Referer: QQ_LOGIN_REFERER } });
    if (cookies(cookieHeader(state, QQ_OAUTH_RETURN)).p_skey) {
      state.signatureChecked = true;
      delete state.signatureCursor; delete state.signatureRedirects;
      return;
    }
    const metadata = { httpStatus: signature.status, redirectCount, redirectTarget };
    if (![301, 302, 303, 307, 308].includes(signature.status) || !signature.headers.location) {
      throw failure('MISSING_P_SKEY', metadata);
    }
    if (redirectCount >= SIGNATURE_MAX_REDIRECTS) throw failure('REDIRECT_LIMIT', metadata);
    let next;
    try { next = signatureTarget(signature.headers.location, target); }
    catch { throw failure('INVALID_REDIRECT', { ...metadata, redirectTarget: 'other' }); }
    if (visited.has(next.href)) throw failure('REDIRECT_LOOP', metadata);
    // Preserve a successful redirect so a temporary next-hop failure does not replay a consumed ticket.
    state.signatureCursor = next.href;
    state.signatureRedirects = redirectCount + 1;
    target = next;
  }
}
async function createQr(channel) {
  const state = { channel, cookie: '', cookieJar: new CookieJar() };
  if (channel === 'wechat') {
    const page = await sessionRequest(state, 'https://open.weixin.qq.com/connect/qrconnect', { params: { appid: WX_APPID,
      redirect_uri: 'https://y.qq.com/portal/wx_redirect.html?login_type=2&surl=https://y.qq.com/',
      response_type: 'code', scope: 'snsapi_login', state: 'qqmusic' } });
    const uuid = String(page.data).match(/\/connect\/qrcode\/([\w=-]+)/)?.[1];
    if (!uuid) throw new Error('微信二维码暂不可用');
    const image = await sessionRequest(state, 'https://open.weixin.qq.com/connect/qrcode/' + uuid, { responseType: 'arraybuffer' });
    return { ...state, uuid, image: 'data:image/jpeg;base64,' + Buffer.from(image.data).toString('base64') };
  }
  const response = await sessionRequest(state, 'https://ssl.ptlogin2.qq.com/ptqrshow', { responseType: 'arraybuffer', headers: { Referer: QQ_LOGIN_REFERER }, params: {
    appid: 716027609, e: 2, l: 'M', s: 3, d: 72, v: 4, daid: 383, pt_3rd_aid: 100497308,
    u1: QQ_OAUTH_RETURN, t: Math.random() } });
  const cookie = cookieHeader(state, 'https://ssl.ptlogin2.qq.com/ptqrlogin');
  if (!cookies(cookie).qrsig) throw new Error('QQ 二维码暂不可用');
  return { ...state, channel: 'qq', cookie, image: 'data:image/png;base64,' + Buffer.from(response.data).toString('base64') };
}
async function exchange(state) {
  return loginStep('music_login', async () => {
  const c = cookies(cookieHeader(state, QQ_OAUTH_RETURN));
  const response = await sessionRequest(state, MUSICU, { method: 'POST', responseType: 'text',
    // Upstream sends JSON text with this content type; this endpoint is not a generic JSON API.
    headers: { Referer: 'https://y.qq.com/', 'Content-Type': 'application/x-www-form-urlencoded' },
    data: JSON.stringify({ comm: { platform: 'yqq', ct: 24, cv: 0,
      ...(state.channel === 'wechat' ? { tmeLoginType: 1 } : { g_tk: hash(c.p_skey || '') }) },
    req: { module: state.channel === 'wechat' ? 'music.login.LoginServer' : 'QQConnectLogin.LoginServer',
      method: state.channel === 'wechat' ? 'Login' : 'QQLogin',
      param: { code: state.code, ...(state.channel === 'wechat' ? { strAppid: WX_APPID } : {}) } } }) });
  const text = String(response.data);
  const cookieFromHeaders = cookieHeader(state, MUSICU);
  const musicCookies = cookies(cookieFromHeaders);
  const hasMusicCookies = Boolean((musicCookies.qqmusic_uin || musicCookies.uin) && (musicCookies.qqmusic_key || musicCookies.qm_keyst));
  let body;
  try { body = JSON.parse(text); } catch {
    if (state.channel === 'qq' && hasMusicCookies) body = {};
    else throw failure('INVALID_JSON', { httpStatus: response.status });
  }
  body ||= {};
  const data = body.req?.data || {};
  // QQ returns its music credentials in Set-Cookie; req.data may be null.
  const code = Number(body.req?.code ?? body.code);
  if ((Number(body.code) !== 0 || code !== 0) && !(state.channel === 'qq' && hasMusicCookies)) {
    if (state.channel === 'qq') delete state.code;
    throw failure('UPSTREAM_REJECTED', { upstreamCode: Number.isSafeInteger(code) ? code : undefined, httpStatus: response.status });
  }
  let cookie = cookieFromHeaders;
  const musicid = text.match(/"strMusicid"\s*:\s*"(\d+)"/)?.[1] || text.match(/"musicid"\s*:\s*(\d+)/)?.[1];
  if (musicid && data.musickey) cookie = merge(cookie, [`uin=${musicid}`, `qqmusic_uin=${musicid}`,
    `qqmusic_key=${data.musickey}`, `qm_keyst=${data.musickey}`, `tmeLoginType=${data.loginType ?? (state.channel === 'wechat' ? 1 : 2)}`]);
  const findEuin = value => {
    if (!value || typeof value !== 'object') return '';
    for (const key of ['encryptUin', 'encrypt_uin', 'euin']) if (typeof value[key] === 'string') return value[key];
    for (const child of Object.values(value)) { const found = findEuin(child); if (found) return found; }
    return '';
  };
  const euin = findEuin(body);
  if (euin) cookie = merge(cookie, ['euin=' + euin]);
  if (data.openid) cookie = merge(cookie, ['wx_openid=' + data.openid]);
  if (data.unionid) cookie = merge(cookie, ['wx_unionid=' + data.unionid]);
  const result = cookies(cookie);
  if (!(result.qqmusic_uin || result.uin) || !(result.qqmusic_key || result.qm_keyst)) {
    if (state.channel === 'qq') delete state.code;
    throw failure('MISSING_MUSIC_CREDENTIALS', { httpStatus: response.status });
  }
  state.authorizedCookie = cookie;
  return { status: 'authorized', cookie };
  });
}
async function pollQr(state) {
  if (state.authorizedCookie) return { status: 'authorized', cookie: state.authorizedCookie };
  if (state.code) return exchange(state);
  if (state.channel === 'wechat') {
    let response;
    try { response = await loginStep('qr_poll', () => sessionRequest(state, 'https://lp.open.weixin.qq.com/connect/l/qrconnect', {
      params: { uuid: state.uuid, _: Date.now() }, timeout: 35000, headers: { Referer: 'https://open.weixin.qq.com/' } })); }
    catch (error) { if (error.reason === 'TIMEOUT') return { status: 'waiting' }; throw error; }
    const text = String(response.data), code = text.match(/wx_errcode\s*=\s*(\d+)/)?.[1];
    if (code === '402' || code === '403') return { status: 'expired' };
    if (code === '404') return { status: 'scanned' };
    if (code !== '405') return { status: 'waiting' };
    state.code = text.match(/wx_code\s*=\s*'([^']+)'/)?.[1];
    if (!state.code) throw new Error('微信授权暂未确认');
    return exchange(state);
  }
  if (!state.checkSig) {
    const status = await loginStep('qr_poll', async () => {
    const qrsig = cookies(cookieHeader(state, 'https://ssl.ptlogin2.qq.com/ptqrlogin')).qrsig;
    const response = await sessionRequest(state, 'https://ssl.ptlogin2.qq.com/ptqrlogin', { params: {
      u1: QQ_OAUTH_RETURN, ptqrtoken: hash(qrsig, 0),
      ptredirect: 0, h: 1, t: 1, g: 1, from_ui: 1, ptlang: 2052, action: '0-0-' + Date.now(),
      js_ver: 23111510, js_type: 1, pt_uistyle: 40, aid: 716027609, daid: 383, pt_3rd_aid: 100497308,
    }, headers: { Cookie: 'qrsig=' + qrsig, Referer: QQ_LOGIN_REFERER } });
    const text = String(response.data), status = text.match(/ptuiCB\('?(\d+)/)?.[1];
    if (status === '65') return 'expired';
    if (status === '67') return 'scanned';
    if (status === '66') return 'waiting';
    if (status !== '0') throw failure('INVALID_QR_STATUS', { upstreamCode: status === undefined ? undefined : Number(status) });
    const checkSig = text.match(/'(https?:\/\/[^']+)'/)?.[1];
    const target = signatureTarget(checkSig, undefined, true);
    state.checkSig = target.toString();
    return 'confirmed';
    });
    if (status !== 'confirmed') return { status };
  }
  await loginStep('check_sig', () => confirmSignature(state));
  await loginStep('oauth_authorize', async () => {
  const pSkey = cookies(cookieHeader(state, QQ_OAUTH_RETURN)).p_skey;
  const fields = { response_type: 'code', client_id: '100497308',
    redirect_uri: 'https://y.qq.com/portal/wx_redirect.html?login_type=1&surl=https://y.qq.com/',
    scope: 'get_user_info,get_app_friends', state: 'state', switch: '', from_ptlogin: '1', src: '1',
    update_auth: '1', openapi: '1010_1030', g_tk: String(hash(pSkey)), auth_time: new Date().toString(), ui: randomUUID().toUpperCase() };
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  const response = await sessionRequest(state, 'https://graph.qq.com/oauth2.0/authorize', { method: 'POST', data: form });
  if (response.status < 300 || response.status >= 400 || !response.headers.location) throw failure('MISSING_OAUTH_REDIRECT', { httpStatus: response.status });
  let target;
  try { target = new URL(response.headers.location); } catch { throw failure('INVALID_REDIRECT'); }
  if (target.protocol !== 'https:' || target.hostname !== 'y.qq.com' || target.pathname !== '/portal/wx_redirect.html') throw failure('INVALID_REDIRECT');
  state.code = target.searchParams.get('code');
  if (!state.code) throw failure('MISSING_OAUTH_CODE', { httpStatus: response.status });
  });
  return exchange(state);
}
module.exports = { createQr, pollQr };
