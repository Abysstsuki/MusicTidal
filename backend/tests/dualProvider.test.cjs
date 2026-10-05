const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { SongQueueService } = require('../src/services/songQueueService');
const { PlaylistQueue } = require('../src/services/playlistQueue');
const { neteaseSong, qqSong } = require('../src/services/music/song');
const { getSongPlayInfo } = require('../src/services/netease/song.service');
const { QqMusicClient } = require('../src/utils/qqmusicHttp');
const qqApi = require('../vendor/qqmusic');
const settle = () => new Promise(resolve => setImmediate(resolve));
const song = (id, provider = 'netease') => ({ id, provider, name: 'Track ' + id, artist: 'Fixture', prcUrl: '', duration: 180000 });

test('an in-flight QQ request retries with a renewed Cookie without expiring the new authorization',async t=>{
  let rejectOld;const calls=[];t.mock.method(qqApi,'details',async(cookie)=>{
    calls.push(cookie);if(cookie==='old')return new Promise((_resolve,reject)=>{rejectOld=reject;});return{tracks:[{id:1,mid:'official',interval:180}]};
  });
  let expired=0;const client=new QqMusicClient('old',()=>++expired);t.after(()=>client.dispose());
  const pending=client.details([1]);client.updateCredential('renewed',()=>++expired);
  rejectOld(Object.assign(new Error('expired old key'),{code:1000}));
  assert.equal((await pending)[0].id,1);assert.deepEqual(calls,['old','renewed']);assert.equal(expired,0);
});
test('QQ requests wait for a pending refresh before deciding whether the old Key is expired',async t=>{
  let release,expired=0;const renewing=new Promise(resolve=>{release=resolve;}),calls=[];
  t.mock.method(qqApi,'details',async(cookie)=>{calls.push(cookie);if(cookie==='old')throw Object.assign(new Error('expired'),{code:1000});return{tracks:[{id:1,mid:'official'}]};});
  const client=new QqMusicClient('old',async()=>{await renewing;++expired;});t.after(()=>client.dispose());
  const pending=client.details([1]);await settle();assert.deepEqual(calls,['old']);
  client.updateCredential('renewed',()=>{throw new Error('new credential must not expire');});release();
  assert.equal((await pending)[0].id,1);assert.deepEqual(calls,['old','renewed']);assert.equal(expired,1);
});

test('VIP labels distinguish playback fees, purchases, quality-only membership and download fees', () => {
  assert.equal(neteaseSong({ id: 1, fee: 8 }).access, 'quality');
  assert.equal(neteaseSong({ id: 1 }, { fee: 1 }).access, 'vip');
  assert.equal(neteaseSong({ id: 1, fee: 4 }).access, 'paid');
  assert.equal(neteaseSong({ id: 1 }).access, 'unknown');
  assert.equal(qqSong({ id: 1, pay: { pay_play: 1, pay_month: 1, price_track: 200 } }).access, 'vip');
  assert.equal(qqSong({ id: 1, pay: { pay_play: 1, pay_month: 0, price_album: 2000 } }).access, 'paid');
  const free = qqSong({ id: 1, pay: { pay_play: 0, pay_down: 1 } });
  assert.equal(free.access, 'free'); assert.equal(free.rights.download, 1);
});
test('identical IDs remain distinct across providers; blocked manual songs survive and resume', async t => {
  const allowed = new Set(['netease','qqmusic']), events = [];
  const queue = new SongQueueService({ canPlaySong: s => allowed.has(s.provider || 'netease'),
    getPlayInfo: async (_id, s) => ({ url: 'https://fixture.invalid/' + s.provider, time: 180000 }),
    createHeartSession: () => ({ nextSongs: async () => [] }), emit: event => events.push(event) });
  t.after(() => queue.dispose());
  queue.enqueue(song(1)); queue.enqueue(song(1,'qqmusic')); queue.enqueue(song(2)); await settle();
  allowed.delete('qqmusic'); queue.resetAuthorization('qqmusic');
  assert.equal(queue.getPlayback().song.provider,'netease');
  assert.match(queue.getQueue()[0].unavailableReason,/QQ/);
  queue.skipToNext(); await settle(); assert.equal(queue.getPlayback().song.id,2);
  assert.equal(queue.getQueue()[0].provider,'qqmusic');
  allowed.add('qqmusic'); queue.resetAuthorization('qqmusic'); queue.skipToNext(); await settle();
  assert.equal(queue.getPlayback().song.provider,'qqmusic');
  assert.ok(events.some(event => event.type === 'QUEUE_UPDATED'));
});
test('recommendation deduplication and source switching preserve mixed manual songs and current audio', async t => {
  const queue = new SongQueueService({ getPlayInfo: async () => ({ url: 'https://fixture.invalid/audio', time: 180000 }),
    createHeartSession: () => ({ nextSongs: async () => [] }),
    createRecommendationSession: provider => ({ nextSongs: async () => [song(1,provider),song(1,provider),song(2,provider)] }), emit() {} });
  t.after(() => queue.dispose()); queue.enqueue(song(1)); await settle();
  await queue.startHeartMode('qqmusic'); await settle();
  assert.deepEqual(queue.getQueue().map(s=>s.provider+':'+s.id),['qqmusic:1','qqmusic:2']);
  queue.enqueue(song(8,'qqmusic')); const playback = queue.getPlayback();
  await queue.startHeartMode('netease');
  assert.deepEqual(queue.getPlayback(),playback);
  assert.equal(queue.getQueue()[0].source,'manual'); assert.equal(queue.getQueue()[0].provider,'qqmusic');
  assert.ok(queue.getQueue().filter(s=>s.source==='heart').every(s=>s.provider==='netease'));
  queue.resetAuthorization('qqmusic'); assert.equal(queue.getRecommendationState().provider,'netease');
});
test('trial snapshots preserve original lyric time and server timer advances at the clip duration', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const queue = new SongQueueService({ getPlayInfo: async () => ({ url:'https://fixture.invalid/clip.m4a', time:30000,
    trial:true, lyricOffset:60000, audioOffset:0, format:'m4a' }), createHeartSession:()=>({nextSongs:async()=>[]}),emit(){} });
  t.after(()=>queue.dispose()); queue.enqueue(song(1,'qqmusic')); queue.enqueue(song(2)); await settle();
  assert.equal(queue.getPlayback().song.duration,30000); assert.equal(queue.getPlayback().song.originalDuration,180000);
  assert.equal(queue.getPlayback().song.lyricOffset,60000); assert.equal(queue.getPlayback().song.trial,true);
  t.mock.timers.tick(29999); assert.equal(queue.getPlayback().song.id,1);
  t.mock.timers.tick(1); await settle(); assert.equal(queue.getPlayback().song.id,2);
});
test('playlist identity and selective invalidation use platform plus ID',()=>{
  const queue = new PlaylistQueue();
  const index = provider => ({playlist:{id:7,provider,name:'Shared',coverUrl:'',creator:'Fixture',isLiked:false,trackCount:1},trackIds:[1]});
  const a = queue.add(index('netease'),{id:1,username:'Host'}), b=queue.add(index('qqmusic'),{id:1,username:'Host'});
  assert.notEqual(a,b); queue.activate(b); queue.invalidateSource(1,'netease');
  assert.equal(queue.peek().provider,'qqmusic'); queue.invalidateProvider('qqmusic'); assert.equal(queue.peek(),null);
  assert.equal(queue.snapshots().find(p=>p.entryId===b).remaining,1); queue.activate(b); assert.equal(queue.peek().songId,1);
});
test('Netease tries lower-quality complete playback before falling back to a bounded trial',async()=>{
  const levels=[]; const client={get:async(_path,{params})=>{levels.push(params.level);return{data:{data:[{url:'https://fixture.invalid/audio',time:180000,freeTrialInfo:params.level==='standard'?null:{start:60,end:90},type:'mp3'}]}}}};
  assert.equal((await getSongPlayInfo('1',client)).trial,false); assert.deepEqual(levels,['exhigh','standard']);
  const preview=await getSongPlayInfo('1',{get:async()=>({data:{data:[{url:'https://fixture.invalid/preview',time:180000,freeTrialInfo:{start:60,end:90}}]}})});
  assert.equal(preview.time,30000); assert.equal(preview.lyricOffset,60000);
  const failedLowerQuality = await getSongPlayInfo('1',{get:async(_path,{params})=>{
    if(params.level==='standard') throw new Error('temporary network failure');
    return {data:{data:[{url:'https://fixture.invalid/preview',time:180000,freeTrialInfo:{start:60,end:90}}]}};
  }});
  assert.equal(failedLowerQuality.trial,true); assert.equal(failedLowerQuality.time,30000);
});
test('QQ resolves authoritative MID, falls back to platform trial and keeps requests account-specific',async t=>{
  const saved={details:qqApi.details,urls:qqApi.urls}; t.after(()=>Object.assign(qqApi,saved)); const calls=[];
  qqApi.details=async(cookie,ids)=>{calls.push({cookie,ids});return{tracks:[{id:1,mid:'officialMid',interval:180,file:{media_mid:'mediaMid',try_begin:60000,try_end:90000}}]}};
  qqApi.urls=async(cookie,track,trial)=>{calls.push({cookie,mid:track.mid,trial}); return{sip:['http://fixture.invalid/','https://fixture.invalid/'],midurlinfo:trial?[{purl:'RS02mediaMid.mp3',filename:'RS02mediaMid.mp3'}]:[]}};
  const a=new QqMusicClient('qqmusic_key=account-a'),b=new QqMusicClient('qqmusic_key=account-b');t.after(()=>{a.dispose();b.dispose();});
  const info=await a.play({...song(1,'qqmusic'),mid:'forged'}); await b.details([1]);
  assert.equal(info.trial,true); assert.equal(info.time,30000); assert.equal(info.lyricOffset,60000);
  assert.ok(info.url.startsWith('https://'));
  assert.equal(calls[1].mid,'officialMid'); assert.equal(calls.at(-1).cookie,'qqmusic_key=account-b');
});
