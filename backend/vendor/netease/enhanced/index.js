// api-enhanced 2aab9957dfd5231e5b192aecdb177f93ace4c92e, MIT.
// Adapt only the required EAPI/WEAPI endpoints to the existing transport.
const request = require('../util/request')
const modules = {
  enhanced_user_playlist: require('./module/user_playlist'),
  playlist_search: require('./module/cloudsearch'),
  playlist_detail: require('./module/playlist_detail'),
  song_detail: require('./module/song_detail'),
}
module.exports = (cookieToJson) => Object.fromEntries(Object.entries(modules).map(([name, module]) => [name, (params = {}) => module(
  { ...params, cookie: cookieToJson(params.cookie) },
  (uri, data, options) => {
    const crypto = options.crypto || 'eapi'
    const origin = crypto === 'weapi' ? 'https://music.163.com' : 'https://interfacepc.music.163.com'
    return request('POST', origin + uri, { ...data, e_r: false }, {
      ...options, crypto, url: uri, timeout: params.timeout, anonymousToken: params.anonymousToken,
    })
  },
)]))
