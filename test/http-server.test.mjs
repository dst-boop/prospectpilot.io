import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createHttpHandler,shutdown} from '../http-server.mjs';
async function withServer(handler,options,run){
 const server=createServer(createHttpHandler(handler,{logger:{error(){}},...options}));server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await run(`http://127.0.0.1:${server.address().port}`,server);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('response streams before its producer finishes and preserves cookies',async()=>{
 let release;const gate=new Promise(r=>release=r);
 await withServer(async()=>new Response(new ReadableStream({async start(c){c.enqueue(new TextEncoder().encode('first'));await gate;c.enqueue(new TextEncoder().encode('last'));c.close();}}),{headers:(()=>{const h=new Headers();h.append('set-cookie','a=1; Path=/');h.append('set-cookie','b=2; Path=/');return h;})()}),{},async url=>{
  const response=await fetch(url);assert.equal(response.headers.getSetCookie().length,2);const reader=response.body.getReader();assert.equal(new TextDecoder().decode((await reader.read()).value),'first');release();assert.equal(new TextDecoder().decode((await reader.read()).value),'last');
 });
});
test('oversized content length and chunked bodies get 413 without invoking app',async()=>{
 let calls=0;await withServer(async()=>{calls++;return new Response('ok');},{maxBodyBytes:4},async url=>{
  assert.equal((await fetch(url,{method:'POST',body:'12345'})).status,413);
  const status=await new Promise((resolve,reject)=>{const req=httpRequest(url,{method:'POST',headers:{'transfer-encoding':'chunked'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.write('123');req.end('456');});assert.equal(status,413);assert.equal(calls,0);
 });
});
test('HEAD suppresses the response body and malformed paths get 400',async()=>{
 await withServer(async()=>new Response('body'),{},async url=>{
  assert.equal(await (await fetch(url,{method:'HEAD'})).text(),'');
  const status=await new Promise((resolve,reject)=>{const req=httpRequest(url,{path:'//elsewhere.example/'},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(status,400);
 });
});
test('application errors do not disclose details or stop subsequent requests',async()=>{
 let calls=0;await withServer(async()=>{if(!calls++)throw Error('secret password');return new Response('ok');},{},async url=>{const r=await fetch(url);assert.equal(r.status,500);assert.ok(!(await r.text()).includes('secret'));assert.equal(await(await fetch(url)).text(),'ok');});
});
test('bounded admission returns 503 while first request is active',async()=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 await withServer(async()=>{entered();await gate;return new Response('ok');},{maxInflight:1},async url=>{
  const first=fetch(url);await started;try{assert.equal((await fetch(url)).status,503);}finally{release();}assert.equal((await first).status,200);
 });
});
test('shutdown closes the pool after draining requests',async()=>{
 await withServer(async()=>new Response('ok'),{},async(url,server)=>{await(await fetch(url)).text();let ended=false;await shutdown(server,{end:async()=>{ended=true;}},{graceMs:1000});assert.equal(ended,true);});
});
test('client disconnect cancels the response stream',async()=>{
 let cancelled;const cancellation=new Promise(resolve=>cancelled=resolve);
 await withServer(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('first'));},cancel(){cancelled();}})),{},async url=>{
  const controller=new AbortController();const r=await fetch(url,{signal:controller.signal});await r.body.getReader().read();controller.abort();
  let timer;try{await Promise.race([cancellation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Stream was not cancelled')),1500);})]);}finally{clearTimeout(timer);}
 });
});
test('shutdown has a deadline for stuck connections',async()=>{
 let forced=false;
 const server={close(){},closeIdleConnections(){},closeAllConnections(){forced=true;}};
 await shutdown(server,{end:async()=>{}},{graceMs:10,logger:{warn(){},error(){}}});assert.equal(forced,true);
});

// node:http preserves explicit Host, unlike fetch's forbidden-header handling.
async function rawFetch(url,options={}){
 return new Promise((resolve,reject)=>{
  const req=httpRequest(url,{setHost:false,...options},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(options.method==='HEAD'?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});
  req.on('error',reject);req.end();
 });
}
test('candidate transport ignores forged forwarding and blocks every ordinary route before dispatch',async()=>{
 const releaseCheckOrigin='https://candidate---service-abc-uc.a.run.app';let calls=0;
 await withServer(async request=>{calls++;return Response.json({url:request.url});},{releaseCheckOrigin},async base=>{
  const headers={host:new URL(releaseCheckOrigin).host,'x-forwarded-host':'prospectpilot.io',origin:'https://prospectpilot.io'};
  for(const [path,method] of [['/api/prospect/me','GET'],['/api/prospect/contacts','POST'],['/login','GET'],['/api/release/readiness','POST'],['/health','POST']]){
   const r=await rawFetch(base+path,{method,headers});assert.equal(r.status,403);assert.equal(r.headers.get('cache-control'),'no-store');await r.text();
  }
  for(const host of [new URL(releaseCheckOrigin).host+':443',new URL(releaseCheckOrigin).host.toUpperCase()])assert.equal((await rawFetch(base+'/api/prospect/me',{headers:{...headers,host}})).status,403);
  for(const host of [new URL(releaseCheckOrigin).host+':badport','user@'+new URL(releaseCheckOrigin).host,new URL(releaseCheckOrigin).host+'/path',new URL(releaseCheckOrigin).host+'?x=1',new URL(releaseCheckOrigin).host+'#hash',''])assert.equal((await rawFetch(base+'/api/prospect/me',{headers:{...headers,host}})).status,400);
  assert.equal(calls,0);
  const r=await rawFetch(base+'/api/release/readiness',{headers});assert.equal(r.status,200);assert.equal((await r.json()).url,releaseCheckOrigin+'/api/release/readiness');
  assert.equal((await rawFetch(base+'/health',{headers,method:'HEAD'})).status,200);
 });
});
test('candidate transport retains real session authentication and canonical proxy behavior',async()=>{
 const {createHandler}=await import('../handler.mjs');
 const releaseCheckOrigin='https://candidate---service-abc-uc.a.run.app';
 const claims={uid:'owner',email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}};
 let verified=0,checks=0;
 const app=createHandler({origins:['https://prospectpilot.io'],ownerEmail:claims.email,releaseId:'synthetic-release',releaseCheckOrigin,releaseReadiness:async()=>{checks++;return true;},auth:{verifySessionCookie:async(value,revoked)=>{verified++;assert.equal(revoked,true);if(value!=='synthetic')throw Error('revoked');return claims;}},prospect:{route:async()=>({ok:true})}});
 await withServer(app,{releaseCheckOrigin},async base=>{
  const headers={host:new URL(releaseCheckOrigin).host,'x-forwarded-host':'prospectpilot.io'};
  assert.equal((await rawFetch(base+'/api/release/readiness',{headers})).status,401);
  assert.equal((await rawFetch(base+'/api/release/readiness',{headers:{...headers,cookie:'__session=revoked'}})).status,401);
  const r=await rawFetch(base+'/api/release/readiness',{headers:{...headers,cookie:'__session=synthetic'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ready:true,release_id:'synthetic-release',schema_version:'034'});
  assert.equal(verified,2);assert.equal(checks,1);
  // Existing Firebase Hosting proxy forwarding remains supported on non-candidate hosts.
  const normal={host:'service-default-uc.a.run.app','x-forwarded-host':'prospectpilot.io',cookie:'__session=synthetic'};
  assert.equal((await rawFetch(base+'/api/prospect/me',{headers:normal})).status,200);
  assert.equal((await rawFetch(base+'/api/prospect/contacts',{method:'POST',headers:{...normal,origin:'https://prospectpilot.io'}})).status,200);
  assert.equal((await rawFetch(base+'/api/prospect/me',{headers:{host:'prospectpilot.io',cookie:'__session=synthetic'}})).status,200);
 });
});
