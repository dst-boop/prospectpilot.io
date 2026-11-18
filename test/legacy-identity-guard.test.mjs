import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isLegacyIdentityMutation,fetchLegacySafely} from '../legacy-identity-guard.mjs';
import {createHandler} from '../handler.mjs';
const request=(path,method='POST')=>new Request('https://example.com'+path,{method,headers:{origin:'https://example.com',cookie:'__session=synthetic','content-type':'application/json'},...!['GET','HEAD'].includes(method)?{body:'{}'}:{}});
const blocked=['/api/v3/discovery/campaigns','/api/v3/discovery/campaigns/id/run','/api/v3/discovery/leads/id','/api/v3/discovery/leads/bulk','/api/v3/discovery/imports/csv','/api/v3/discovery/imports/linkedin','/api/enrichment/preview','/api/enrichment/commit','/api/research/job','/api/research/auto','/api/research/preview','/api/research/save','/api/wealthfeed/submit','/api/wealthfeed/check','/api/beta/calls'];
test('every unsupported legacy identity mutation is blocked before DB/provider/worker work, including method and path variants',async()=>{
 let calls=0;const worker={fetch:async()=>{calls++;throw Error('must not execute')}};
 for(const path of blocked)for(const method of ['POST','PATCH','PUT','DELETE']){
  for(const variant of [path,path+'/',path+'?extra=1',path.replace(/\/api\/(.)/,(_,c)=>'/api/%'+c.charCodeAt(0).toString(16))]){
   const req=request(variant,method);assert.equal(isLegacyIdentityMutation(req),true,variant);
   const r=await fetchLegacySafely(worker,req,{});assert.equal(r.status,409);assert.equal(r.headers.get('cache-control'),'no-store');assert.match((await r.json()).detail,/\/prospect.*\/lab/);
  }
 }
 assert.equal(calls,0);
});
test('read-only legacy paths and explicit settings/export exceptions remain available',async()=>{
 let calls=0;const worker={fetch:async()=>{calls++;return Response.json({read:true})}};
 const allowed=[...blocked.map(path=>[path,'GET']),['/api/beta/preferences','PUT'],['/api/wealthfeed/connect','POST'],['/api/wealthfeed/disconnect','POST'],['/api/enrichment/export','POST'],['/api/v3/discovery/export/zoominfo','POST'],['/api/v3/discovery/export/salesforce','POST'],['/api/v3/discovery/campaigns/id/export-companies','POST'],['/api/v3/discovery/source-discovery','POST']];
 for(const [path,method] of allowed)assert.equal((await fetchLegacySafely(worker,request(path,method),{})).status,200,path);
 assert.equal(calls,allowed.length);
});
test('authenticated handler applies the same guard; current workspace routes remain delegated normally',async()=>{
 let legacy=0,current=0;
 const h=createHandler({origins:['https://example.com'],ownerEmail:'owner@example.com',auth:{verifySessionCookie:async()=>({uid:'owner',email:'owner@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}})},worker:{fetch:async()=>{legacy++;return Response.json({ok:true})}},prospect:{route:async()=>{current++;return {ok:true}}}});
 assert.equal((await h(request('/api/v3/discovery/imports/csv'))).status,409);assert.equal(legacy,0);
 assert.equal((await h(request('/api/v3/discovery/leads','GET'))).status,200);assert.equal(legacy,1);
 assert.equal((await h(request('/api/prospect/import'))).status,200);assert.equal(current,1);
});
test('both production legacy entry points use the shared guard, including queued research workers',()=>{
 for(const path of ['handler.mjs','research-worker.mjs']){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.match(source,/fetchLegacySafely\(worker,/);assert.doesNotMatch(source,/await worker\.fetch\(/);
 }
});
