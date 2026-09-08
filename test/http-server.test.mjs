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
