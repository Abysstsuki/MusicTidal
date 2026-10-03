// Web login status is the account verification used by upstream QR-login examples.
module.exports = (query, request) => request('POST',
  'https://music.163.com/api/w/nuser/account/get', {},
  { crypto: 'weapi', cookie: query.cookie, realIP: query.realIP, ua: 'pc' })
