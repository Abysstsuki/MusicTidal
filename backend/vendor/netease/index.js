// Static imports keep the embedded subset self-contained and visible to bundlers.
const request = require('./util/request')
const modules = {
  cloudsearch: require('./module/cloudsearch'),
  song_url_v1: require('./module/song_url_v1'),
  lyric: require('./module/lyric'),
  user_account: require('./module/user_account'),
  recommend_songs: require('./module/recommend_songs'),
  personal_fm: require('./module/personal_fm'),
  user_playlist: require('./module/user_playlist'),
  likelist: require('./module/likelist'),
  playmode_intelligence_list: require('./module/playmode_intelligence_list'),
  register_anonimous: require('./module/register_anonimous'),
}

function cookieToJson(cookie = '') {
  const result = Object.create(null)
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!name) continue
    try {
      result[name] = decodeURIComponent(value)
    } catch {
      result[name] = value
    }
  }
  return result
}

const api = { cookieToJson }
for (const [name, module] of Object.entries(modules)) {
  api[name] = (params = {}) => module(
    { ...params, cookie: cookieToJson(params.cookie) },
    (method, url, data, options) => request(method, url, data, {
      ...options,
      timeout: params.timeout,
      anonymousToken: params.anonymousToken,
    }),
  )
}
module.exports = api
