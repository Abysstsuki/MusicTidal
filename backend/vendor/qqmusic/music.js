'use strict';
const { rpc, request, cookies, hash } = require('./request');
const search = (cookie, keyword, offset, limit, type = 0, signal) => rpc(cookie,
  'music.search.SearchCgiService', 'DoSearchForQQMusicDesktop',
  { query: keyword, search_type: type, page_num: Math.floor(offset / limit) + 1, num_per_page: limit }, { signal });
const details = (cookie, ids, signal) => rpc(cookie, 'music.trackInfo.UniformRuleCtrl', 'CgiGetTrackInfo',
  { ids, types: ids.map(() => 0), modify_stamp: ids.map(() => 0), ctx: 0, client: 1 }, { signal });
async function urls(cookie, track, trial = false, signal) {
  const mid = track.mid || track.songmid, media = track.file?.media_mid || track.mediaMid;
  if (!mid) throw new Error('QQ 歌曲缺少 MID');
  const files = trial ? [['RS02', '.mp3']] : [['M800', '.mp3'], ['M500', '.mp3'], ['C400', '.m4a']];
  const c = cookies(cookie);
  return rpc(cookie, 'vkey.GetVkeyServer', 'CgiGetVkey', {
    filename: files.map(([prefix, ext]) => prefix + (media || mid + mid) + ext),
    guid: String(require('crypto').randomInt(100000000, 999999999)), songmid: files.map(() => mid),
    songtype: files.map(() => 0), uin: c.qqmusic_uin || c.uin || '0', loginflag: 1, platform: '20',
  }, { signal });
}
async function lyric(cookie, id, mid, signal) {
  const response = await request('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
    params: { songid: id, songmid: mid, format: 'json', outCharset: 'utf-8', nobase64: 0 }, signal,
    headers: { Cookie: cookie, Referer: 'https://y.qq.com/portal/player.html' } });
  const data = response.data;
  if (Number(data?.code) !== 0) { const error = new Error('QQ 歌词暂不可用'); error.code = Number(data?.code); throw error; }
  const decode = value => value ? Buffer.from(value, 'base64').toString('utf8') : '';
  return { lyric: decode(data.lyric), tlyric: decode(data.trans), romalrc: decode(data.roma) };
}
async function profile(cookie, signal) {
  const c = cookies(cookie), uid = c.qqmusic_uin || c.uin;
  const response = await request('https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg', {
    params: { uin: uid, userid: uid, loginUin: uid, hostUin: 0, format: 'json', ct: 24, cv: 4747474, reqfrom: 1,
      reqtype: 0, cid: 205360838, platform: 'yqq.json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, needNewCode: 0,
      g_tk: hash(c.qqmusic_key || c.qm_keyst || ''), g_tk_new_20200303: hash(c.qqmusic_key || c.qm_keyst || '') }, signal,
    headers: { Cookie: cookie, Referer: 'https://y.qq.com/' } });
  if (Number(response.data?.code) !== 0) {
    const error = new Error('QQ 账号信息暂不可用'); error.code = Number(response.data?.code); throw error;
  }
  return response.data.data;
}
async function collected(cookie, offset, limit, signal) {
  const c = cookies(cookie), uid = c.qqmusic_uin || c.uin;
  const response = await request('https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', {
    signal, params: { ct: 20, cid: 205360956, userid: uid, reqtype: 3, sin: offset, ein: offset + limit,
      format: 'json', g_tk: hash(c.qqmusic_key || c.qm_keyst || '') }, headers: { Cookie: cookie } });
  if (Number(response.data?.code) !== 0) { const error = new Error('收藏歌单暂不可用'); error.code = Number(response.data?.code); throw error; }
  return response.data.data || response.data;
}
const playlist = (cookie, id, offset, limit, signal) => rpc(cookie, 'music.srfDissInfo.DissInfo', 'CgiGetDiss', {
  disstid: id === 201 ? 0 : id, dirid: id === 201 ? 201 : 0,
  song_begin: offset, song_num: limit, tag: true, userinfo: true, orderlist: true,
  ...(id === 201 ? { enc_host_uin: cookies(cookie).euin || '' } : {}),
}, { signal });
// Independently implemented protocol from the recommendation documentation, not copied Python code.
const roam = (cookie, previous = [], signal) => rpc(cookie, 'music.radioProxy.MbTrackRadioSvr', 'get_radio_track',
  { id: 99, num: 5, from: 0, scene: 0, song_ids: previous }, { signal });
module.exports = { search, details, urls, lyric, profile, collected, playlist, roam };
