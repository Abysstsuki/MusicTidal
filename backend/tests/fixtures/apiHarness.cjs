// Local fixtures only: never connects to PostgreSQL or a real Netease account.
if (process.env.NODE_ENV === 'production') throw new Error('Fixtures cannot run in production');
require('ts-node/register');
const bcrypt = require('bcrypt');
const http = require('node:http');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'isolated-room-fixture-signing-key';
process.env.NETEASE_COOKIE_ENCRYPTION_KEY = 'b'.repeat(64);
const password = bcrypt.hashSync('DemoMusic123', 10);
const users = new Map([1, 2, 3].map(id => [id, {
  id, username: ['Demo', 'NightRadio', 'Friends'][id - 1], email: id === 1 ? 'demo@musictidal.test' : 'fixture' + id + '@musictidal.test', password,
  neteaseCookieEncrypted: null, neteaseProfile: null, neteaseBoundAt: null, neteaseInvalidAt: null,
  qqmusicCookieEncrypted: null, qqmusicProfile: null, qqmusicBoundAt: null, qqmusicInvalidAt: null,
}]));
function select(user, fields) { return !user ? null : fields ? Object.fromEntries(Object.keys(fields).filter(key => fields[key]).map(key => [key, user[key]])) : { ...user }; }
const repository = {
  findUnique: async ({ where, select: fields }) => select(where.id ? users.get(where.id) : [...users.values()].find(user => user.email === where.email || user.username === where.username), fields),
  create: async ({ data, select: fields }) => { const record = { id: users.size + 1, ...data }; users.set(record.id, record); return select(record, fields); },
  update: async ({ where, data }) => { const record = { ...users.get(where.id), ...data }; users.set(where.id, record); return record; },
  updateMany: async ({ where, data }) => { const record = users.get(where.id); if (!record || !Object.entries(where).every(([key,value]) => record[key] === value)) return { count: 0 }; Object.assign(record, data); return { count: 1 }; },
};
const prismaPath = require.resolve('../../src/utils/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: { user: repository, $queryRaw: async () => [{ value: 1 }] } } };
const { roomManager } = require('../../src/services/roomManager');
const { neteaseBindings } = require('../../src/services/netease/binding.service');
const { qqmusicBindings } = require('../../src/services/qqmusic/binding.service');
const { qqmusicPlaylistCatalog } = require('../../src/services/qqmusic/playlist.service');
const { encryptCredential } = require('../../src/utils/credentialCrypto');
const { playlistCatalog } = require('../../src/services/netease/playlist.service');
const { setupWebSocketServer } = require('../../src/services/websocketServer');
const app = require('../../src/app').default;
let origin = '';
const songs = [10, 11, 12, 13, 14, 15].map(id => ({ id, name: '演示歌曲 ' + id, ar: [{ name: 'MusicTidal' }], al: { picUrl: '' }, dt: 300000 }));
const playlist = id => ({ id, name: id === 700 ? '演示红心歌单' : '演示夜间歌单', creator: { userId: 7, nickname: '演示网易云账号' },
  coverImgUrl: '', specialType: id === 700 ? 5 : 0, trackCount: id === 700 ? 65 : 38 });
const playlistIds = id => Array.from({ length: id === 700 ? 65 : 38 }, (_, index) => (id === 700 ? 10 : 100) + index);
const client = { get: async (endpoint, config) => {
  const params = config?.params || {};
  if (endpoint === '/login/status') return { data: { data: { code: 200, profile: { userId: 7, nickname: '演示网易云账号', avatarUrl: '' } } } };
  if (endpoint === '/playlist/user') return { data: { code: 200, playlist: [playlist(700), playlist(701)], more: false } };
  if (endpoint === '/playlist/search') return { data: { code: 200, result: { playlists: [playlist(700), playlist(701)].slice(Number(params.offset || 0), Number(params.offset || 0) + Number(params.limit || 30)), playlistCount: 2 } } };
  if (endpoint === '/playlist/detail') return { data: { code: 200, playlist: { ...playlist(Number(params.id)), trackIds: playlistIds(Number(params.id)).map(id => ({ id })) } } };
  if (endpoint === '/song/detail') return { data: { code: 200, songs: String(params.ids).split(',').map(Number).map(id => ({ id, name: '演示歌曲 ' + id, ar: [{ name: 'MusicTidal' }], al: { picUrl: '' }, dt: 300000 })) } };
  const body = endpoint === '/cloudsearch' ? { result: { songs, songCount: songs.length } } : endpoint === '/lyric' ? { lrc: { lyric: '[00:00.00]一起听见下一首歌\n[00:15.00]分享此刻的心情' } } :
    endpoint === '/user/account' ? { profile: { userId: 7, nickname: '演示网易云账号', avatarUrl: '' } } : endpoint === '/user/playlist' ? { playlist: [{ id: 700, specialType: 5, creator: { userId: 7 } }] } :
    endpoint === '/likelist' ? { ids: [10, 11] } : endpoint === '/playmode/intelligence/list' ? { data: songs.map(songInfo => ({ songInfo })) } :
    { data: [{ id: Number(config?.params?.id || 10), url: origin + '/fixture/audio', time: 300000 }] };
  return { data: { code: 200, ...body } };
} };
const qqClient = {
  dispose() {},
  details: async ids => ids.map(id => ({ id, mid: 'mid' + id, title: 'QQ Track ' + id, singer: [{ name: 'QQ Artist' }], interval: 300, pay: { pay_play: 1, pay_month: 1 } })),
  profile: async () => ({ creator: { nick: 'QQ 演示账号', headpic: '' } }),
  search: async () => ({ songs: songs.map(s => ({ provider: 'qqmusic', id: s.id, mid: 'mid' + s.id, name: s.name, artist: 'QQ Artist', prcUrl: '', duration: s.dt, access: 'vip' })), total: songs.length }),
  play: async song => ({ url: origin + '/fixture/audio', time: song.id === 11 ? 30000 : 300000, trial: song.id === 11, lyricOffset: song.id === 11 ? 60000 : 0, audioOffset: 0, format: 'wav' }),
  lyric: async () => ({ lyric: '[01:00.00]QQ 试听歌词', tlyric: '' }),
  roam: async () => [12,13,14].map(id => ({ provider: 'qqmusic', id, mid: 'mid' + id, name: 'QQ Roam ' + id, artist: 'QQ Artist', prcUrl: '', duration: 300000, access: 'free' })),
  get: async (endpoint, config) => {
    const result = await client.get(endpoint, config), data = result.data;
    if (data.playlist) {
      if (Array.isArray(data.playlist)) data.playlist = data.playlist.map(p => ({ ...p, provider: 'qqmusic' }));
      else data.playlist.provider = 'qqmusic';
    }
    if (data.result?.playlists) data.result.playlists = data.result.playlists.map(p => ({ ...p, provider: 'qqmusic' }));
    if (data.songs) data.songs = data.songs.map(s => ({ provider: 'qqmusic', normalized: true, id: s.id, mid: 'mid' + s.id, name: s.name, artist: 'QQ Artist', prcUrl: '', duration: s.dt, access: 'vip' }));
    return result;
  },
};
roomManager.qq.clientFactory = () => qqClient;
qqmusicPlaylistCatalog.clientFactory = () => qqClient;
qqmusicBindings.transport = { createQr: async channel => ({ channel, image: 'data:image/png;base64,fixture' }),
  pollQr: async () => ({ status: 'authorized', cookie: 'qqmusic_uin=9007199254740993123; qqmusic_key=fixture' }), client: () => qqClient };
// The catalog still reads real fixture user bindings; only its cloud client is replaced.
playlistCatalog.clientFactory = () => client;
// Room behavior and HTTP/WS gateways are real; only external data is replaced.
const originalCreate = roomManager.create.bind(roomManager);
roomManager.create = async (...args) => { const room = await originalCreate(...args); room.client = client; return room; };
let polls = 0;
neteaseBindings.transport = {
  call: async endpoint => endpoint === '/login/qr/key' ? { body: { code: 200, unikey: 'fixture-key' }, cookie: [] } : { body: { code: ++polls < 2 ? 801 : polls < 3 ? 802 : 803 }, cookie: ['MUSIC_U=fixture; Path=/'] },
  client: () => client,
};
neteaseBindings.on('changed', id => { setImmediate(() => { const active = roomManager.active(id); if (active) roomManager.get(active.id).client = client; }); });
const audio = Buffer.alloc(44 + 8000 * 2 * 300);
audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
app.get('/fixture/audio', (req, res) => {
  res.set({ 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }).type('audio/wav');
  const ranges = req.range(audio.length);
  if (ranges === -1) { res.status(416).set('Content-Range', 'bytes */' + audio.length).end(); return; }
  if (Array.isArray(ranges) && ranges.type === 'bytes') {
    const { start, end } = ranges[0];
    res.status(206).set('Content-Range', 'bytes ' + start + '-' + end + '/' + audio.length).send(audio.subarray(start, end + 1));
  } else res.send(audio);
});

async function start({ port = 0, seed = false } = {}) {
  const server = http.createServer(app); const wss = setupWebSocketServer(server);
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  if (seed) {
    const a = await roomManager.create(users.get(2), '深夜电台');
    const b = await roomManager.create(users.get(3), '朋友的私人房间', '4321');
    roomManager.connect(a.id, 2, { send() {}, close() {} }); roomManager.connect(b.id, 3, { send() {}, close() {} });
    a.queue.enqueue({ id: 10, name: '演示歌曲 10', artist: 'MusicTidal', prcUrl: '', duration: 300000 });
  }
  return { origin, roomManager, qqClient,
    bind: async (id, provider = 'netease') => {
      Object.assign(users.get(id), { [provider + 'CookieEncrypted']: encryptCredential(provider === 'netease' ? 'MUSIC_U=fixture' : 'qqmusic_uin=7; qqmusic_key=fixture'),
        [provider + 'Profile']: { uid: '7', nickname: provider + ' fixture', avatarUrl: '' }, [provider + 'BoundAt']: new Date(), [provider + 'InvalidAt']: null });
      await roomManager.refreshAuthorization(id, provider); const active = roomManager.active(id); if (active) roomManager.get(active.id).client = client;
    },
    token: id => jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '1h' }),
    close: async () => { roomManager.dispose(); neteaseBindings.dispose(); qqmusicBindings.dispose(); for (const ws of wss.clients) ws.terminate(); await Promise.all([new Promise(resolve => wss.close(resolve)), new Promise(resolve => server.close(resolve))]); } };
}
module.exports = { start };
if (require.main === module) start({ port: 3101, seed: true }).then(() => console.log('Isolated room UI fixtures ready on port 3101; PID ' + process.pid));
