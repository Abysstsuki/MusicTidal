const { test }=require('node:test');const assert=require('node:assert/strict');
const axiosPath=require.resolve('axios');require('axios');
let handler;require.cache[axiosPath].exports=async config=>handler(config);
const api=require('../vendor/qqmusic');const {rpc,request}=require('../vendor/qqmusic/request');
test('native QQ QR exchange retains server-only cookies and supports graph check_sig host',async()=>{
  const calls=[];handler=async config=>{calls.push(config);const url=new URL(config.url);
    if(url.pathname==='/ptqrshow')return{data:Buffer.from('png'),headers:{'set-cookie':['qrsig=fixture; Path=/']}};
    if(url.pathname==='/ptqrlogin')return{data:"ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?uin=7&ptsigx=fixture','0','登录成功','Fixture')",headers:{'set-cookie':['pt_session=fixture; Path=/']}};
    if(url.pathname==='/check_sig')return{data:'',headers:{'set-cookie':['p_skey=private; Domain=.graph.qq.com; Path=/']}};
    if(url.pathname==='/oauth2.0/authorize')return{status:302,data:'',headers:{location:'https://y.qq.com/portal/wx_redirect.html?code=private'}};
    return{status:200,data:'{"code":0,"req":{"code":0,"data":{"encryptUin":"encrypted-identity"}}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=secret; Path=/']}};
  };
  const state=await api.createQr('qq');assert.ok(state.image.startsWith('data:image/png;base64,'));
  const result=await api.pollQr(state);assert.equal(result.status,'authorized');assert.ok(result.cookie.includes('qqmusic_key=secret'));assert.ok(result.cookie.includes('euin=encrypted-identity'));
  assert.ok(!result.cookie.includes('p_skey='),'QQ OAuth tickets are not music-domain cookies');
  assert.ok(!result.cookie.includes('Path='));assert.equal(calls[1].params.ptqrtoken,require('../vendor/qqmusic/request').hash('fixture',0));
  assert.ok(calls.every(c=>c.maxRedirects===0));assert.ok(calls.every(c=>c.headers.Referer));
  const authorize=calls.find(c=>c.url.endsWith('/oauth2.0/authorize'));
  assert.ok(authorize.data instanceof FormData); assert.equal(authorize.data.get('client_id'),'100497308');
  assert.equal(authorize.data.get('g_tk'),String(require('../vendor/qqmusic/request').hash('private')));
  assert.equal(authorize.headers['Content-Type'],undefined,'Axios must generate the multipart boundary');
  const login=calls.at(-1); assert.equal(login.headers['Content-Type'],'application/x-www-form-urlencoded');
  assert.equal(JSON.parse(login.data).req.module,'QQConnectLogin.LoginServer');
});
test('Tencent cross-domain deletion cookies cannot erase the valid graph OAuth tickets',async()=>{
  const calls=[];handler=async config=>{
    calls.push(config);const url=new URL(config.url);
    if(url.pathname==='/ptqrlogin')return{status:200,data:"ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?uin=7&ptsigx=private-sig&service=ptqrlogin&ptredirect=100&aid=716027609&pt_3rd_aid=100497308','0','登录成功','Fixture')",headers:{'set-cookie':['uin=o7; Domain=.qq.com; Path=/','skey=private-login; Domain=.qq.com; Path=/']}};
    if(url.pathname==='/check_sig'){
      assert.equal(url.hostname,'ssl.ptlogin2.graph.qq.com');
      assert.equal(url.searchParams.get('uin'),'7');assert.equal(url.searchParams.get('ptsigx'),'private-sig');
      assert.equal(url.searchParams.get('ptredirect'),'100');assert.equal(url.searchParams.get('pt_3rd_aid'),'100497308');
      assert.equal(url.searchParams.get('aid'),'716027609');assert.equal(url.searchParams.get('service'),'ptqrlogin');
      assert.equal(config.headers.Referer,'https://xui.ptlogin2.qq.com/');
      return{status:302,data:'',headers:{location:'https://graph.qq.com/oauth2.0/login_jump','set-cookie':[
        'p_uin=o7; Domain=.graph.qq.com; Path=/; Secure',
        'pt4_token=private-token; Domain=.graph.qq.com; Path=/; Secure',
        'p_skey=private-oauth; Domain=.graph.qq.com; Path=/; Secure',
        'p_uin=; Domain=.qq.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'p_skey=; Domain=.qq.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'pt4_token=; Domain=.qq.com; Path=/; Max-Age=0'
      ]}};
    }
    if(url.pathname==='/oauth2.0/login_jump')return{status:200,data:'',headers:{}};
    if(url.pathname==='/oauth2.0/authorize'){
      assert.ok(config.headers.Cookie.includes('p_skey=private-oauth'));assert.ok(config.headers.Cookie.includes('p_uin=o7'));
      assert.ok(config.headers.Cookie.includes('pt4_token=private-token'));assert.ok(!config.headers.Cookie.includes('qrsig='));
      assert.equal(config.data.get('g_tk'),String(require('../vendor/qqmusic/request').hash('private-oauth')));
      return{status:302,data:'',headers:{location:'https://y.qq.com/portal/wx_redirect.html?code=private-code'}};
    }
    assert.ok(!config.headers.Cookie.includes('p_skey='),'graph cookies must not be sent to the music domain');
    return{status:200,data:'{"code":0,"req":{"code":0,"data":null}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=private-key; Path=/']}};
  };
  const state={channel:'qq',cookie:'',cookieJar:new(require('tough-cookie').CookieJar)()};
  state.cookieJar.setCookieSync('qrsig=private-qr; Path=/; Secure','https://ssl.ptlogin2.qq.com/');
  assert.equal((await api.pollQr(state)).status,'authorized');
  assert.equal(calls.filter(c=>new URL(c.url).pathname==='/check_sig').length,1);
  assert.ok(calls.every(c=>new URL(c.url).pathname!=='/oauth2.0/login_jump'));
});
test('native QR sessions isolate their cookie jars throughout concurrent account authorization',async()=>{
  let sequence=0;
  handler=async config=>{
    const url=new URL(config.url);
    if(url.pathname==='/ptqrshow')return{data:Buffer.from('png'),headers:{'set-cookie':[`qrsig=account-${++sequence}; Path=/; Secure`]}};
    if(url.pathname==='/ptqrlogin'){
      const account=api.cookies(config.headers.Cookie).qrsig;
      return{data:`ptuiCB('0','0','https://ssl.ptlogin2.graph.qq.com/check_sig?account=${account}','0','登录成功','Fixture')`,headers:{}};
    }
    if(url.pathname==='/check_sig')return{status:302,data:'',headers:{'set-cookie':[`p_skey=${url.searchParams.get('account')}; Domain=.graph.qq.com; Path=/; Secure`]}};
    if(url.pathname==='/oauth2.0/authorize'){
      const account=api.cookies(config.headers.Cookie).p_skey;
      assert.equal(config.data.get('g_tk'),String(require('../vendor/qqmusic/request').hash(account)));
      return{status:302,data:'',headers:{location:`https://y.qq.com/portal/wx_redirect.html?code=${account}`}};
    }
    const account=JSON.parse(config.data).req.param.code;
    return{status:200,data:'{"code":0,"req":{"code":0,"data":null}}',headers:{'set-cookie':[`qqmusic_uin=${account==='account-1'?7:8}; Domain=.y.qq.com; Path=/`,`qqmusic_key=${account}; Domain=.y.qq.com; Path=/`]}};
  };
  const first=await api.createQr('qq'),second=await api.createQr('qq');assert.notEqual(first.cookieJar,second.cookieJar);
  const [a,b]=await Promise.all([api.pollQr(first),api.pollQr(second)]);
  assert.equal(api.cookies(a.cookie).qqmusic_key,'account-1');assert.equal(api.cookies(b.cookie).qqmusic_key,'account-2');
});
test('WeChat QR exchange preserves unsafe integer music IDs from raw response text',async()=>{
  handler=async config=>{const url=new URL(config.url);
    if(url.pathname==='/connect/qrconnect')return{data:'<img src="/connect/qrcode/uuid-fixture">',headers:{}};
    if(url.pathname.startsWith('/connect/qrcode/'))return{data:Buffer.from('jpg'),headers:{}};
    if(url.pathname==='/connect/l/qrconnect')return{data:"window.wx_errcode=405;window.wx_code='private-code'",headers:{}};
    assert.equal(config.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.equal(JSON.parse(config.data).comm.tmeLoginType,1);
    return{data:'{"code":0,"req":{"code":0,"data":{"musicid":9007199254740993123,"musickey":"private-key","loginType":1,"openid":"private-openid"}}}',headers:{}};
  };
  const result=await api.pollQr(await api.createQr('wechat'));
  assert.ok(result.cookie.includes('uin=9007199254740993123'));assert.ok(result.cookie.includes('wx_openid=private-openid'));assert.ok(result.cookie.includes('tmeLoginType=1'));
});

test('QQ music login accepts complete Set-Cookie credentials when req.data is null',async()=>{
  handler=async()=>({status:200,data:'{"code":0,"req":{"code":0,"data":null}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=private; Path=/']}});
  const state={channel:'qq',cookie:'p_skey=private',code:'private-code'};
  const result=await api.pollQr(state);
  assert.equal(result.status,'authorized'); assert.ok(result.cookie.includes('qqmusic_key=private'));
  assert.deepEqual(await api.pollQr(state),result,'confirmed credentials are retained without exchanging the code twice');
});

test('QR diagnostics identify authorize rejection without exposing response or cookies',async()=>{
  handler=async()=>({status:200,data:'private upstream response',headers:{}});
  await assert.rejects(api.pollQr({channel:'qq',cookie:'p_skey=private',checkSig:'https://ssl.ptlogin2.qq.com/check_sig',signatureChecked:true}),
    e=>e.stage==='oauth_authorize'&&e.reason==='MISSING_OAUTH_REDIRECT'&&e.httpStatus===200&&!JSON.stringify(e).includes('private'));
});

test('invalid check_sig redirects never enter the session or get requested on retries',async()=>{
  const calls=[]; handler=async c=>{calls.push(c.url);return{status:200,data:"ptuiCB('0','0','https://unexpected.invalid/check_sig?ticket=private','0','登录成功','Fixture')",headers:{}};};
  const state={channel:'qq',cookie:'qrsig=private'};
  for(let attempt=0;attempt<2;attempt++) await assert.rejects(api.pollQr(state),e=>e.stage==='qr_poll'&&e.reason==='INVALID_REDIRECT');
  assert.equal(state.checkSig,undefined);assert.ok(calls.every(url=>new URL(url).hostname==='ssl.ptlogin2.qq.com'));
});

test('check_sig follows trusted 302 hops and merges their cookies before OAuth',async()=>{
  const calls=[];
  handler=async c=>{
    calls.push(c); const url=new URL(c.url);
    if(url.hostname==='ssl.ptlogin2.qq.com')return{status:302,data:'',headers:{location:'https://ssl.ptlogin2.graph.qq.com/check_sig?ticket=private','set-cookie':['pt4_token=handoff; Domain=.qq.com; Path=/; Secure']}};
    if(url.pathname==='/check_sig')return{status:302,data:'',headers:{location:'https://graph.qq.com/oauth2.0/login_jump','set-cookie':['p_uin=7; Domain=.graph.qq.com; Path=/']}};
    if(url.pathname==='/oauth2.0/login_jump')return{status:200,data:'',headers:{'set-cookie':['p_skey=confirmed; Domain=.graph.qq.com; Path=/; HttpOnly']}};
    if(url.pathname==='/oauth2.0/authorize')return{status:302,data:'',headers:{location:'https://y.qq.com/portal/wx_redirect.html?code=private-code'}};
    return{status:200,data:'{"code":0,"req":{"code":0,"data":null}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=private; Path=/']}};
  };
  const state={channel:'qq',cookie:'uin=7; skey=login-cookie',checkSig:'https://ssl.ptlogin2.qq.com/check_sig?ticket=private'};
  assert.equal((await api.pollQr(state)).status,'authorized');
  assert.ok(calls[1].headers.Cookie.includes('pt4_token=handoff'));
  assert.ok(calls[2].headers.Cookie.includes('p_uin=7'));
  assert.equal(calls[3].data.get('g_tk'),String(require('../vendor/qqmusic/request').hash('confirmed')));
  assert.ok(!state.cookie.includes('HttpOnly'));assert.equal(state.signatureCursor,undefined);
  assert.ok(calls.every(c=>c.maxRedirects===0&&new URL(c.url).protocol==='https:'));
});

test('a direct 302 with p_skey completes confirmation without following its Location',async()=>{
  const calls=[];handler=async c=>{
    calls.push(c.url);
    if(new URL(c.url).pathname==='/check_sig')return{status:302,data:'',headers:{location:'https://unexpected.invalid/','set-cookie':['p_skey=confirmed; Domain=.graph.qq.com; Path=/']}};
    if(c.url.endsWith('/oauth2.0/authorize'))return{status:302,data:'',headers:{location:'https://y.qq.com/portal/wx_redirect.html?code=private'}};
    return{status:200,data:'{"code":0,"req":{"code":0}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=private; Path=/']}};
  };
  assert.equal((await api.pollQr({channel:'qq',cookie:'uin=7',checkSig:'https://ssl.ptlogin2.graph.qq.com/check_sig'})).status,'authorized');
  assert.ok(calls.every(url=>new URL(url).hostname!=='unexpected.invalid'));
});

test('next-hop network retry retains cookies and does not replay a consumed check_sig ticket',async()=>{
  let original=0,next=0;
  handler=async c=>{
    const url=new URL(c.url);
    if(url.hostname==='ssl.ptlogin2.qq.com'){original++;return{status:302,data:'',headers:{location:'https://ssl.ptlogin2.graph.qq.com/check_sig?ticket=private','set-cookie':['pt4_token=handoff; Domain=.qq.com; Path=/']}};}
    if(url.pathname==='/check_sig'){
      next++;assert.ok(c.headers.Cookie.includes('pt4_token=handoff'));
      if(next===1)throw new Error('private network response');
      return{status:302,data:'',headers:{'set-cookie':['p_skey=confirmed; Domain=.graph.qq.com; Path=/']}};
    }
    if(url.pathname==='/oauth2.0/authorize')return{status:302,data:'',headers:{location:'https://y.qq.com/portal/wx_redirect.html?code=private'}};
    return{status:200,data:'{"code":0,"req":{"code":0}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=private; Path=/']}};
  };
  const state={channel:'qq',cookie:'uin=7',checkSig:'https://ssl.ptlogin2.qq.com/check_sig?ticket=private'};
  await assert.rejects(api.pollQr(state),e=>e.stage==='check_sig'&&e.reason==='NETWORK'&&!JSON.stringify(e).includes('private'));
  assert.equal((await api.pollQr(state)).status,'authorized');assert.equal(original,1);assert.equal(next,2);
});

test('check_sig rejects unsafe redirects and loops before sending any follow-up credentials',async()=>{
  for(const location of ['https://unexpected.invalid/check_sig','https://graph.qq.com/oauth2.0/authorize','https://user:private@graph.qq.com/oauth2.0/login_jump','https://ssl.ptlogin2.qq.com/check_sig']){
    let calls=0;handler=async()=>{calls++;return{status:302,data:'',headers:{location}};};
    await assert.rejects(api.pollQr({channel:'qq',cookie:'skey=private',checkSig:'https://ssl.ptlogin2.qq.com/check_sig'}),
      e=>e.stage==='check_sig'&&['INVALID_REDIRECT','REDIRECT_LOOP'].includes(e.reason)&&!JSON.stringify(e).includes('private'));
    assert.equal(calls,1);
  }
});

test('check_sig has a bounded redirect chain and preserves terminal missing-ticket diagnostics',async()=>{
  let calls=0;handler=async()=>({status:302,data:'',headers:{location:'/check_sig?hop='+ ++calls}});
  await assert.rejects(api.pollQr({channel:'qq',cookie:'skey=private',checkSig:'https://ssl.ptlogin2.qq.com/check_sig'}),
    e=>e.reason==='REDIRECT_LIMIT'&&e.redirectCount===5&&e.httpStatus===302);
  assert.equal(calls,6);
  handler=async c=>new URL(c.url).pathname==='/check_sig'
    ?{status:302,data:'',headers:{location:'https://graph.qq.com/oauth2.0/login_jump'}}:{status:200,data:'',headers:{}};
  await assert.rejects(api.pollQr({channel:'qq',cookie:'skey=private',checkSig:'https://ssl.ptlogin2.qq.com/check_sig'}),
    e=>e.reason==='MISSING_P_SKEY'&&e.redirectCount===1&&e.redirectTarget==='qq_oauth'&&e.httpStatus===200);
});

test('a rejected QQ exchange obtains a fresh OAuth code on retry while retaining login tickets',async()=>{
  const state={channel:'qq',cookie:'p_skey=private',code:'used-code',checkSig:'https://ssl.ptlogin2.qq.com/check_sig',signatureChecked:true};
  let exchanges=0,authorizations=0;
  handler=async c=>{
    if(c.url.endsWith('/oauth2.0/authorize')){authorizations++;return{status:302,data:'',headers:{location:'https://y.qq.com/portal/wx_redirect.html?code=fresh-code'}};}
    exchanges++;return exchanges===1?{status:200,data:'{"code":0,"req":{"code":1001}}',headers:{}}:
      {status:200,data:'{"code":0,"req":{"code":0,"data":null}}',headers:{'set-cookie':['qqmusic_uin=7; Path=/','qqmusic_key=private; Path=/']}};
  };
  await assert.rejects(api.pollQr(state),e=>e.stage==='music_login'&&e.upstreamCode===1001);
  assert.equal(state.code,undefined); assert.equal((await api.pollQr(state)).status,'authorized');
  assert.equal(authorizations,1);assert.equal(exchanges,2);
});
test('RPC credentials are explicit and upstream errors never retain Axios config or raw bodies',async()=>{
  const calls=[];handler=async c=>{calls.push(c);return{data:{code:0,req:{code:0,data:{ok:true}}},headers:{}};};
  await rpc('qqmusic_uin=7; qqmusic_key=account-a','module','method',{});await rpc('qqmusic_uin=8; qqmusic_key=account-b','module','method',{});
  assert.equal(calls[0].data.comm.authst,'account-a');assert.equal(calls[1].data.comm.authst,'account-b');assert.equal(calls[0].data.comm.uin,'7');
  handler=async()=>{throw Object.assign(new Error('Cookie=private'),{config:{secret:'private'}});};
  await assert.rejects(request('https://u.y.qq.com/cgi-bin/musicu.fcg'),error=>!error.config&&!error.message.includes('private'));
});
