const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');
const { QqMusicBindingService } = require('../src/services/qqmusic/binding.service');
const { encryptCredential, decryptCredential } = require('../src/utils/credentialCrypto');
process.env.NETEASE_COOKIE_ENCRYPTION_KEY='c'.repeat(64);
function fixture(t) {
  const records=new Map([[1,{id:1,qqmusicCookieEncrypted:null,qqmusicProfile:null,qqmusicBoundAt:null,qqmusicInvalidAt:null,neteaseCookieEncrypted:'untouched'}]]);
  let polls=0,profiles=0,failProfile=false,failSave=false,resolvePoll;
  const repo={findUnique:async({where})=>records.get(where.id),update:async({where,data})=>{if(failSave){failSave=false;throw new Error('private SQL');}Object.assign(records.get(where.id),data);},
    updateMany:async({where,data})=>{const record=records.get(where.id);if(!Object.entries(where).every(([k,v])=>record[k]===v))return{count:0};Object.assign(record,data);return{count:1};}};
  const transport={createQr:async channel=>({channel,cookie:'qrsig=private',image:'data:image/png;base64,fixture'}),
    pollQr:async()=>{++polls;if(resolvePoll)return new Promise(resolve=>{resolvePoll=resolve;});return{status:'authorized',cookie:'qqmusic_uin=9007199254740993123; qqmusic_key=private; tmeLoginType=1'};},
    client:()=>({profile:async()=>{++profiles;if(failProfile){failProfile=false;throw new Error('private cookie');}return{creator:{nick:'Fixture',headpic:''}};},dispose(){}})};
  const service=new QqMusicBindingService(repo,transport);t.after(()=>service.dispose());
  return {service,records,repo,transport,get polls(){return polls;},get profiles(){return profiles;},set failProfile(value){failProfile=value;},set failSave(value){failSave=value;},
    defer(){resolvePoll=true;},resolve(value){resolvePoll(value);}};
}
test('QQ and WeChat bind one account, encrypt complete credentials and expose only public profile',async t=>{
  const f=fixture(t);let changes=0;f.service.on('changed',()=>++changes);
  const qr=await f.service.createQr(1,'wechat');assert.deepEqual(Object.keys(qr).sort(),['expiresAt','image','sessionId']);
  const [a,b]=await Promise.all([f.service.checkQr(1,qr.sessionId),f.service.checkQr(1,qr.sessionId)]);
  assert.deepEqual(a,b);assert.equal(f.polls,1);assert.equal(changes,1);assert.equal(a.binding.profile.uid,'9007199254740993123');
  const record=f.records.get(1);assert.ok(!record.qqmusicCookieEncrypted.includes('private'));assert.ok(decryptCredential(record.qqmusicCookieEncrypted).includes('qqmusic_key=private'));
  assert.ok(!JSON.stringify(a).includes('qqmusic_key'));assert.equal(record.neteaseCookieEncrypted,'untouched');
  assert.deepEqual(await f.service.checkQr(1,qr.sessionId),a);
  const second=await f.service.createQr(1,'qq');await f.service.checkQr(1,second.sessionId);assert.equal(changes,2);
  await f.service.unbind(1);assert.equal((await f.service.status(1)).status,'unbound');assert.equal(record.neteaseCookieEncrypted,'untouched');
});
test('confirmed QQ credentials survive profile and database errors without repolling',async t=>{
  const f=fixture(t),qr=await f.service.createQr(1);f.failProfile=true;
  await assert.rejects(f.service.checkQr(1,qr.sessionId),e=>e.code==='QQMUSIC_QR_ACCOUNT_PENDING'&&!e.message.includes('private'));
  f.failSave=true;await assert.rejects(f.service.checkQr(1,qr.sessionId),e=>e.code==='QQMUSIC_BINDING_SAVE_FAILED');
  assert.equal((await f.service.checkQr(1,qr.sessionId)).status,'authorized');assert.equal(f.polls,1);
});
test('cancel, logout, QR replacement and expiration cannot save late QQ credentials',async t=>{
  const f=fixture(t),a=await f.service.createQr(1);f.defer();const pending=f.service.checkQr(1,a.sessionId);
  await new Promise(resolve=>setImmediate(resolve));await f.service.cancelQr(1,a.sessionId);
  f.resolve({status:'authorized',cookie:'qqmusic_uin=1; qqmusic_key=private'});assert.equal((await pending).status,'expired');
  assert.equal(f.records.get(1).qqmusicCookieEncrypted,null);
  const b=await f.service.createQr(1),c=await f.service.createQr(1,'wechat');assert.equal((await f.service.checkQr(1,b.sessionId)).status,'expired');
  await f.service.cancelAll(1);assert.equal((await f.service.checkQr(1,c.sessionId)).status,'expired');
  const d=await f.service.createQr(1);f.service.sessions.get(1).expiresAt=Date.now()-1;assert.equal((await f.service.checkQr(1,d.sessionId)).status,'expired');
});
test('QR errors expose a useful stage message and retain only allowlisted diagnostics',async t=>{
  const logs=[];t.mock.method(console,'warn',(...values)=>logs.push(values));
  const transport={createQr:async()=>({channel:'qq',cookie:'qrsig=private',image:'data:image/png;base64,fixture'}),
    pollQr:async()=>{throw Object.assign(new Error('private cookies and response'),{stage:'oauth_authorize',reason:'MISSING_OAUTH_REDIRECT',httpStatus:200,cookie:'private',config:{secret:'private'}});},client(){throw new Error('must not load profile');}};
  const service=new QqMusicBindingService({},transport);t.after(()=>service.dispose());
  const qr=await service.createQr(1);
  await assert.rejects(service.checkQr(1,qr.sessionId),e=>e.code==='QQMUSIC_QR_POLL_FAILED'&&e.message.includes('授权跳转')&&!e.message.includes('private'));
  assert.deepEqual(logs[0],['QQ Music QR binding failed:',{stage:'oauth_authorize',reason:'MISSING_OAUTH_REDIRECT',httpStatus:200}]);
  assert.ok(!JSON.stringify(logs).includes('private'));
});

test('stale expiry cannot invalidate replacement credentials; current expiry remains recoverable',async t=>{
  const f=fixture(t),record=f.records.get(1),old=encryptCredential('old'),current=encryptCredential('new');
  record.qqmusicCookieEncrypted=current;record.qqmusicProfile={uid:'7',nickname:'Fixture',avatarUrl:''};
  await f.service.markInvalid(1,old);assert.equal((await f.service.status(1)).status,'bound');
  await f.service.markInvalid(1,current);assert.equal((await f.service.status(1)).status,'expired');
  assert.equal((await f.service.credential(1)).cookie,'');assert.equal(record.qqmusicCookieEncrypted,current);
});

const lifetime=259200000,lead=30*60000;
const drain=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
function renewalFixture(t, remaining=lifetime) {
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
  const f=fixture(t),record=f.records.get(1);
  const cookie=(key,created=Date.now())=>`uin=7; qqmusic_key=${key}; qm_keyst=${key}; tmeLoginType=2; psrf_qqrefresh_token=private-refresh; psrf_qqaccess_token=private-access; psrf_qqopenid=private-openid; psrf_access_token_expiresAt=1800900000; psrf_musickey_createtime=${Math.floor(created/1000)}`;
  record.qqmusicCookieEncrypted=encryptCredential(cookie('old',Date.now()-lifetime+remaining));
  record.qqmusicProfile={uid:'7',nickname:'Fixture',avatarUrl:''};record.qqmusicBoundAt=new Date(Date.now()-1000);
  f.repo.findMany=async({where})=>[...f.records.values()].filter(value=>value.id>where.id.gt&&value.qqmusicCookieEncrypted&&!value.qqmusicInvalidAt).map(value=>({id:value.id}));
  const calls=[];f.transport.refreshCredential=async(old,signal)=>{calls.push({old,signal});return{cookie:cookie('renewed-'+calls.length),expiresAt:Date.now()+lifetime};};
  return {...f,cookie,calls,record};
}
test('startup restores legacy QQ bindings and renews exactly 30 minutes before expiry without exposing tickets',async t=>{
  const f=renewalFixture(t),before=f.record.qqmusicCookieEncrypted,boundAt=f.record.qqmusicBoundAt;
  const events=[];f.service.on('renewed',(...args)=>events.push(args));
  await f.service.startAutoRenewal();await f.service.startAutoRenewal();
  t.mock.timers.tick(lifetime-lead-1);await drain();assert.equal(f.calls.length,0);
  t.mock.timers.tick(1);await drain();assert.equal(f.calls.length,1);assert.equal(events.length,1);
  assert.notEqual(f.record.qqmusicCookieEncrypted,before);assert.equal(f.record.qqmusicBoundAt,boundAt);
  assert.ok((await f.service.credential(1)).cookie.includes('qqmusic_key=renewed-1'));
  assert.ok(!JSON.stringify(await f.service.status(1)).includes('private-'));
  assert.equal(events[0][1],before);assert.equal(f.record.neteaseCookieEncrypted,'untouched');
  // Persisted provider expiry, not the original boundAt, restores the next timer after restart.
  f.service.dispose();const restarted=new QqMusicBindingService(f.repo,f.transport);t.after(()=>restarted.dispose());
  await restarted.startAutoRenewal();t.mock.timers.tick(lifetime-lead-1);await drain();assert.equal(f.calls.length,1);
  t.mock.timers.tick(1);await drain();assert.equal(f.calls.length,2);
});
test('temporary renewal failures retain valid bindings and retry with safe diagnostics',async t=>{
  const f=renewalFixture(t,lead),normal=f.transport.refreshCredential,logs=[];
  t.mock.method(console,'warn',(...args)=>logs.push(args));let attempts=0;
  f.transport.refreshCredential=async(...args)=>{if(++attempts===1)throw Object.assign(new Error('private-cookie'),{code:'NETWORK',config:{cookie:'private-cookie'}});return normal(...args);};
  const encrypted=f.record.qqmusicCookieEncrypted;await f.service.startAutoRenewal();t.mock.timers.tick(0);await drain();
  assert.equal(attempts,1);assert.equal((await f.service.status(1)).status,'bound');assert.equal(f.record.qqmusicCookieEncrypted,encrypted);
  t.mock.timers.tick(59999);await drain();assert.equal(attempts,1);
  t.mock.timers.tick(1);await drain();assert.equal(attempts,2);assert.notEqual(f.record.qqmusicCookieEncrypted,encrypted);
  assert.ok(!JSON.stringify(logs).includes('private-cookie'));
});
test('rejected refresh tickets keep the original audio key until its actual expiry',async t=>{
  const f=renewalFixture(t,lead);t.mock.method(console,'warn',()=>{});
  f.transport.refreshCredential=async()=>{throw Object.assign(new Error('private'),{reason:'UPSTREAM_REJECTED',upstreamCode:1000});};
  await f.service.startAutoRenewal();t.mock.timers.tick(0);await drain();assert.equal((await f.service.status(1)).status,'bound');
  t.mock.timers.tick(lead-1);await drain();assert.equal((await f.service.status(1)).status,'bound');
  t.mock.timers.tick(1);await drain();assert.equal((await f.service.status(1)).status,'expired');
});
test('unbind and account replacement discard late renewal responses',async t=>{
  const f=renewalFixture(t,lead);let resolve;
  f.transport.refreshCredential=(_cookie,signal)=>{f.calls.push({signal});return new Promise(done=>{resolve=done;});};
  await f.service.startAutoRenewal();t.mock.timers.tick(0);await drain();
  await f.service.unbind(1);assert.equal(f.calls[0].signal.aborted,true);
  resolve({cookie:f.cookie('late'),expiresAt:Date.now()+lifetime});await drain();assert.equal(f.record.qqmusicCookieEncrypted,null);
  f.record.qqmusicCookieEncrypted=encryptCredential(f.cookie('old',Date.now()-lifetime+lead));
  f.record.qqmusicInvalidAt=null;await f.service.credential(1);t.mock.timers.tick(0);await drain();
  const qr=await f.service.createQr(1);await f.service.checkQr(1,qr.sessionId);const replacement=f.record.qqmusicCookieEncrypted;
  resolve({cookie:f.cookie('late-again'),expiresAt:Date.now()+lifetime});await drain();assert.equal(f.record.qqmusicCookieEncrypted,replacement);
});
test('a database write retry preserves newly issued tickets without refreshing twice',async t=>{
  const f=renewalFixture(t,lead),update=f.repo.updateMany;let fail=true;t.mock.method(console,'warn',()=>{});
  f.repo.updateMany=async args=>{if(fail){fail=false;throw new Error('private database url');}return update(args);};
  await f.service.startAutoRenewal();t.mock.timers.tick(0);await drain();assert.equal(f.calls.length,1);
  t.mock.timers.tick(60000);await drain();assert.equal(f.calls.length,1);
  assert.ok((await f.service.credential(1)).cookie.includes('qqmusic_key=renewed-1'));
});
test('old-key expiry waits for an in-flight renewal and cannot revoke its replacement',async t=>{
  const f=renewalFixture(t,lead);let resolve;
  f.transport.refreshCredential=()=>new Promise(done=>{resolve=done;});
  const encrypted=f.record.qqmusicCookieEncrypted;await f.service.startAutoRenewal();t.mock.timers.tick(0);await drain();
  const invalidating=f.service.markInvalid(1,encrypted);await drain();assert.equal(f.record.qqmusicInvalidAt,null);
  resolve({cookie:f.cookie('renewed'),expiresAt:Date.now()+lifetime});await invalidating;await drain();
  assert.equal((await f.service.status(1)).status,'bound');assert.ok((await f.service.credential(1)).cookie.includes('qqmusic_key=renewed'));
});
