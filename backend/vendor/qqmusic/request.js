'use strict';
// Adapted from sansenjian/qq-music-api (MIT); see UPSTREAM.md.
const axios = require('axios');
const MUSICU = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const cookies = text => Object.fromEntries(String(text || '').split(';').flatMap(part => {
  const i = part.indexOf('='); return i > 0 ? [[part.slice(0, i).trim(), part.slice(i + 1).trim()]] : [];
}));
function merge(previous, headers = []) {
  return Object.entries({ ...cookies(previous), ...cookies(headers.map(h => h.split(';')[0]).join(';')) })
    .map(([k, v]) => `${k}=${v}`).join('; ');
}
function hash(text, initial = 5381) {
  let value = initial; for (const char of text || '') value += (value << 5) + char.charCodeAt(0);
  return value & 0x7fffffff;
}
async function request(url, options = {}) {
  try {
    return await axios({ url, timeout: 15000, maxRedirects: 0, maxContentLength: 8 * 1024 * 1024,
      validateStatus: status => status >= 200 && status < 400,
      ...options, headers: { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0', ...options.headers } });
  } catch (error) {
    // Axios errors retain credentials in config; never propagate them to app logs.
    const problem = new Error('QQ 音乐请求暂时不可用');
    problem.code = ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code) ? 'TIMEOUT' : 'NETWORK';
    const status = Number(error.response?.status);
    if (Number.isInteger(status) && status >= 100 && status <= 599) problem.httpStatus = status;
    throw problem;
  }
}
async function rpc(cookie, module, method, param, options = {}) {
  const c = cookies(cookie), key = c.qqmusic_key || c.qm_keyst || '';
  const response = await request(MUSICU, { method: 'POST', signal: options.signal,
    headers: { Cookie: cookie, Referer: 'https://y.qq.com/', 'Content-Type': 'application/json' },
    data: { comm: { ct: 24, cv: 0, platform: 'yqq', uin: c.qqmusic_uin || c.uin || '0',
      authst: key, tmeLoginType: Number(c.tmeLoginType || 2), g_tk: hash(key) }, req: { module, method, param } } });
  const body = response.data;
  const code = Number(body?.code || body?.req?.code || 0);
  if (!body?.req || code !== 0) {
    const error = new Error('QQ 音乐接口暂时不可用'); error.code = code || -1; throw error;
  }
  return body.req.data;
}
module.exports = { request, rpc, cookies, merge, hash, MUSICU };
