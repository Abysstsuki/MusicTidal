// Adapted from api-enhanced's type=3 QR login, using the embedded request facade.
module.exports = (query, request) => request('POST',
  'https://interfacepc.music.163.com/api/login/qrcode/unikey', { type: 3, e_r: false },
  { crypto: 'eapi', url: '/api/login/qrcode/unikey', cookie: query.cookie,
    realIP: query.realIP,
    ua: 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.29.205117' })
