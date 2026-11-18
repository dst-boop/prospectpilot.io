import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createStagingHttpHandler} from '../scripts/staging-runtime-guards.mjs';
import {stagingProspectScript} from '../scripts/staging-ui.mjs';
test('oversized declared and chunked staging imports reject before application dispatch',async()=>{
 let calls=0;const host='prospectpilot-stg-test-123.us-central1.run.app';
 const server=createServer(createStagingHttpHandler(async()=>{calls++;return Response.json({saved:true});},{origin:'https://'+host}));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  for(const path of ['/api/prospect/import/preview','/api/prospect/import'])for(const declared of [true,false]){
   const response=await new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{host,origin:'https://'+host,'content-type':'application/json',...(declared?{'content-length':'100001'}:{'transfer-encoding':'chunked'})}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text,cookie:res.headers['set-cookie']}));});
    req.on('error',reject);req.end(Buffer.alloc(100001,32));
   });
   assert.equal(response.status,413);assert.match(response.text,/100 KB \(100,000 bytes including encoding\)/);assert.doesNotMatch(response.text,/5 MB/);assert.equal(response.cookie,undefined);assert.equal(calls,0);
  }
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('staging import client explains plain-text HTTP413 without changing production client',async()=>{
 const original=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
 const stage=stagingProspectScript(original),api=stage.slice(stage.indexOf('async function api('),stage.indexOf('const filters='));
 const context=vm.createContext({lists:[],$:()=>({value:''}),fetch:async()=>({status:413,ok:false,json:async()=>{throw Error('plain text');}})});
 vm.runInContext(api,context);
 for(const path of ['import','import/preview'])await assert.rejects(context.api(path,{csv:'synthetic'}),/request limit is 100 KB.*No contacts were saved/);
 assert.doesNotMatch(original,/Only the supplied unchanged fictional-staging.csv is accepted/);
});
