import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../handler.mjs';

const origin='https://prospectpilot.io';
const claims={uid:'owner',email:'owner@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}};
function fixture({route=async()=>({ok:true}),session=claims,enabled=true}={}){
 const seen=[];
 const handler=createHandler({
  auth:{verifySessionCookie:async cookie=>{if(cookie!=='valid')throw Error('Revoked');return session;}},
  ownerEmail:claims.email,origins:[origin],releaseId:'release-test',
  lab:{route:async()=>({lab:true})},labPage:'Research Lab',
  ...(enabled?{prospect:{route:async(request,user)=>{seen.push({method:request.method,user});return route(request,user);}},prospectPage:'Contact workspace',prospectScript:'contact-script',prospectJobsScript:'job-script',prospectStyle:'contact-style'}:{}),
  worker:{fetch:async()=>new Response('legacy')}
 });
 return {handler,seen};
}
const request=(path,{method='GET',cookie='valid',site=origin,headers={}}={})=>new Request(origin+path,{method,headers:{...(cookie?{cookie:'__session='+cookie}:{}),...(site?{origin:site}:{}),...headers}});

test('contact workspace pages and all assets require a valid verified session',async()=>{
 const {handler}=fixture();
 for(const [path,body] of [['/','Contact workspace'],['/prospect','Contact workspace'],['/prospect-client.js','contact-script'],['/prospect-jobs-client.js','job-script'],['/prospect.css','contact-style']]){
  assert.equal((await handler(request(path,{cookie:''}))).status,303);
  assert.equal((await handler(request(path,{cookie:'revoked'}))).status,303);
  const response=await handler(request(path));assert.equal(response.status,200);assert.equal(await response.text(),body);assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
 assert.equal(await (await handler(request('/lab'))).text(),'Research Lab');
 for(const session of [{...claims,email_verified:false},{...claims,firebase:{sign_in_provider:'anonymous'}}])assert.equal((await fixture({session}).handler(request('/api/prospect/contacts'))).status,401);
});

test('contact mutations require same origin and derive ownership only from the signed session',async()=>{
 const {handler,seen}=fixture();
 for(const method of ['POST','PATCH','DELETE']){
  for(const site of ['', 'https://attacker.example'])assert.equal((await handler(request('/api/prospect/contacts/id',{method,site}))).status,403);
  assert.equal((await handler(request('/api/prospect/contacts/id',{method,cookie:''}))).status,401);
  assert.equal(seen.length,0);
 }
 for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await handler(request('/api/prospect/contacts/id',{method,headers:{'oai-authenticated-user-id':'attacker'}}))).status,200);
 assert.equal(seen.length,4);assert.ok(seen.every(call=>call.user.uid==='owner'));
});

test('contact responses preserve CSV while internal failures do not expose sensitive messages',async()=>{
 const csv=fixture({route:async()=>new Response('First Name\r\nJamie',{headers:{'Content-Type':'text/csv','X-Excluded-Suppressed':'1'}})});
 const exported=await csv.handler(request('/api/prospect/export',{method:'POST'}));assert.match(exported.headers.get('Content-Type'),/text\/csv/);assert.equal(exported.headers.get('X-Excluded-Suppressed'),'1');assert.equal(exported.headers.get('Cache-Control'),'private, no-store');
 const failed=fixture({route:async()=>{throw Error('secret-provider-key');}});const response=await failed.handler(request('/api/prospect/jobs'));assert.equal(response.status,500);assert.ok(!(await response.text()).includes('secret-provider-key'));
});

test('release identity distinguishes a registered contact workspace from the older lab-only app',async()=>{
 for(const enabled of [true,false]){
  const response=await fixture({enabled}).handler(request('/version',{cookie:''}));const version=await response.json();
  assert.equal(version.contact_workspace_version,enabled?'professional-contacts-1':null);assert.equal(version.release_id,'release-test');assert.equal(version.quality_version,'retirement-evidence-2');assert.equal(response.headers.get('cache-control'),'no-store');
 }
});

test('new public users reach their own workspace and account endpoint',async()=>{
 for(const provider of ['google.com','password']){const session={...claims,uid:'new-user',email:'new@example.net',firebase:{sign_in_provider:provider}};const {handler,seen}=fixture({session});assert.equal((await handler(request('/prospect'))).status,200);const me=await (await handler(request('/api/prospect/me'))).json();assert.equal(me.uid,'new-user');assert.equal(me.email,'new@example.net');assert.equal((await handler(request('/api/prospect/contacts'))).status,200);assert.equal(seen[0].user.uid,'new-user');}
});
