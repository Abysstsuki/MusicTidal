// Keep Set-Cookie private: only the binding service consumes this response.
module.exports = (query, request) => {
  return request('POST',
    'https://interfacepc.music.163.com/api/login/qrcode/client/login', { key: query.key, type: 3, e_r: false },
    { crypto: 'eapi', url: '/api/login/qrcode/client/login', cookie: query.cookie, realIP: query.realIP,
      ua: 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117' })
}
