import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createLinkedIn,decryptToken} from '../linkedin.mjs';
import {createHandler} from '../handler.mjs';
const origin='https://prospectpilot.io',uid='owner',session='session';
const config={clientId:'client',clientSecret:'secret',redirectUri:origin+'/auth/linkedin/callback',encryptionKey:Buffer.alloc(32,7).toString('base64')};
async function fixture(){
 const db=new PGlite();await db.exec(readFileSync(new URL('../migrations/003-linkedin.sql',import.meta.url),'utf8'));
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 let fail=false,calls=0,override=null;const requests=[];
 const linkedin=createLinkedIn({pool,page:'page',script:'script',origins:[origin],config,fetcher:async (url,init)=>{calls++;requests.push({url,init});if(override)return override(url,init);if(fail)throw Error('secret-sensitive-provider-error');return Response.json(url.endsWith('accessToken')?{access_token:'TOP-SECRET-TOKEN',expires_in:3600}:{sub:'member-id',name:'Jane Smith'});}});
 const request=(path,method='GET',who=uid,sess=session)=>linkedin(new Request(origin+path,{method}),{uid:who},sess);
 const start=async()=>new URL((await (await request('/api/linkedin/connect','POST')).json()).url).searchParams.get('state');
 return {db,pool,request,start,calls:()=>calls,fail:()=>{fail=true;},requests,respond:fn=>{override=fn;}};
}
test('OAuth encrypted storage, status redaction, replay protection and disconnect',async()=>{
 const f=await fixture();try{
 const state=await f.start();
 assert.equal((await f.request('/auth/linkedin/callback?state='+state+'&code=ok')).headers.get('location'),'/settings/linkedin?result=connected');
 const row=(await f.db.query('SELECT * FROM linkedin_connections')).rows[0];
 assert.ok(!row.token_ciphertext.includes('TOP-SECRET'));
 assert.equal(decryptToken(row.token_ciphertext,Buffer.alloc(32,7),uid),'TOP-SECRET-TOKEN');
 assert.throws(()=>decryptToken(row.token_ciphertext,Buffer.alloc(32,7),'someone-else'));
 const status=await (await f.request('/api/linkedin/status')).text();assert.ok(!status.includes('TOKEN'));assert.match(status,/Jane Smith/);
 assert.equal((await (await f.request('/api/linkedin/status','GET','other')).json()).connection,null);
 assert.equal((await f.request('/auth/linkedin/callback?state='+state+'&code=ok')).headers.get('location'),'/settings/linkedin?result=failed');assert.equal(f.calls(),2);
 await f.db.query("UPDATE linkedin_connections SET expires_at=now()-interval '1 second'");
 assert.equal((await (await f.request('/api/linkedin/status')).json()).connection.expired,true);
 const pending=await f.start();await f.request('/api/linkedin/disconnect','POST');
 assert.equal((await f.db.query('SELECT * FROM linkedin_connections')).rows.length,0);
 assert.match((await f.request('/auth/linkedin/callback?state='+pending+'&code=ok')).headers.get('location'),/failed/);
 }finally{await f.db.close();}
});
test('OAuth rejects missing, expired, wrong-user and wrong-session states without provider calls',async()=>{
 const f=await fixture();try{
 const state=await f.start();
 for(const [who,sess] of [['other',session],[uid,'different-session']])assert.match((await f.request('/auth/linkedin/callback?state='+state+'&code=ok','GET',who,sess)).headers.get('location'),/failed/);
 await f.db.query("UPDATE linkedin_oauth_states SET expires_at=now()-interval '1 second'");
 assert.match((await f.request('/auth/linkedin/callback?state='+state+'&code=ok')).headers.get('location'),/failed/);
 assert.match((await f.request('/auth/linkedin/callback?code=ok')).headers.get('location'),/failed/);
 assert.equal(f.calls(),0);
 }finally{await f.db.close();}
});
test('cancel and upstream failure preserve existing connection and consume state',async()=>{
 const f=await fixture();try{
 let state=await f.start();await f.request('/auth/linkedin/callback?state='+state+'&code=ok');
 state=await f.start();assert.match((await f.request('/auth/linkedin/callback?state='+state+'&error=denied')).headers.get('location'),/cancelled/);
 state=await f.start();f.fail();assert.match((await f.request('/auth/linkedin/callback?state='+state+'&code=ok')).headers.get('location'),/failed/);
 assert.equal((await f.db.query('SELECT * FROM linkedin_connections')).rows.length,1);assert.equal((await f.db.query('SELECT * FROM linkedin_oauth_states')).rows.length,0);
 }finally{await f.db.close();}
});
test('LinkedIn routes require approved sessions and same-origin writes; missing setup is explicit',async()=>{
 let hits=0;
 const handler=createHandler({auth:{verifySessionCookie:async()=>({uid,email:'owner@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'}})},ownerEmail:'owner@example.com',origins:[origin],linkedin:async()=>{hits++;return Response.json({ok:true})}});
 assert.equal((await handler(new Request(origin+'/api/linkedin/status'))).status,401);
 assert.equal((await handler(new Request(origin+'/api/linkedin/disconnect',{method:'POST',headers:{cookie:'__session=x',origin:'https://evil.example'}}))).status,403);
 assert.equal(hits,0);
 assert.equal((await handler(new Request(origin+'/api/linkedin/status',{headers:{cookie:'__session=x'}}))).status,200);
 const noConfig=createLinkedIn({pool:{query:async()=>({rows:[]})},page:'',script:'',origins:[origin]});
 assert.equal((await (await noConfig(new Request(origin+'/api/linkedin/status'),{uid},session)).json()).configured,false);
 assert.equal((await noConfig(new Request(origin+'/api/linkedin/connect',{method:'POST'}),{uid},session)).status,503);
 assert.throws(()=>createLinkedIn({origins:[origin],config:{...config,redirectUri:'https://evil.example/auth/linkedin/callback'}}));
});


test('authorization requests only own-profile scopes and newest state supersedes old grants',async()=>{
 const f=await fixture();try{
  const response=await f.request('/api/linkedin/connect','POST'),url=new URL((await response.json()).url),state=url.searchParams.get('state');
  assert.equal(url.origin,'https://www.linkedin.com');assert.equal(url.pathname,'/oauth/v2/authorization');
  assert.equal(url.searchParams.get('scope'),'openid profile');assert.equal(url.searchParams.get('redirect_uri'),config.redirectUri);
  assert.match(response.headers.get('cache-control'),/no-store/);
  const next=await f.start();assert.notEqual(next,state);
  assert.match((await f.request('/auth/linkedin/callback?state='+state+'&code=ok')).headers.get('location'),/failed/);assert.equal(f.calls(),0);
  assert.match((await f.request('/auth/linkedin/callback?state='+next+'&code=ok')).headers.get('location'),/connected/);
  assert.ok(f.requests.every(r=>r.init.redirect==='error'&&r.init.signal instanceof AbortSignal));
  assert.deepEqual(f.requests.map(r=>r.url),['https://www.linkedin.com/oauth/v2/accessToken','https://api.linkedin.com/v2/userinfo']);
 }finally{await f.db.close();}
});

test('malformed, oversized and failed provider responses preserve an existing token without leaking errors',async()=>{
 const f=await fixture();try{
  let state=await f.start();await f.request('/auth/linkedin/callback?state='+state+'&code=ok');
  const saved=(await f.db.query('SELECT token_ciphertext FROM linkedin_connections')).rows[0].token_ciphertext;
  const invalid=[()=>new Response('SECRET_ERROR',{status:429}),()=>new Response('not JSON'),()=>new Response('x'.repeat(65537)),()=>Response.json({access_token:'',expires_in:3600}),()=>Response.json({access_token:'token',expires_in:-1}),()=>Response.json({access_token:'token',expires_in:1.5}),()=>Response.json({access_token:'x'.repeat(16385),expires_in:3600}),()=>{throw new DOMException('timeout','TimeoutError');}];
  for(const reply of invalid){f.respond(reply);state=await f.start();const result=await f.request('/auth/linkedin/callback?state='+state+'&code=ok');assert.equal(result.headers.get('location'),'/settings/linkedin?result=failed');assert.equal(await result.text(),'');assert.equal((await f.db.query('SELECT token_ciphertext FROM linkedin_connections')).rows[0].token_ciphertext,saved);assert.equal((await f.db.query('SELECT * FROM linkedin_oauth_states')).rows.length,0);}
  f.respond(url=>Response.json(url.endsWith('accessToken')?{access_token:'new',expires_in:3600}:{name:'Missing identifier'}));state=await f.start();assert.match((await f.request('/auth/linkedin/callback?state='+state+'&code=ok')).headers.get('location'),/failed/);
  assert.equal((await f.db.query('SELECT token_ciphertext FROM linkedin_connections')).rows[0].token_ciphertext,saved);
 }finally{await f.db.close();}
});

test('unsafe callback configuration is rejected before authorization',()=>{
 for(const redirectUri of ['http://prospectpilot.io/auth/linkedin/callback',origin+'/wrong',origin+'/auth/linkedin/callback?extra=1',origin+'/auth/linkedin/callback#hash','https://user:pass@prospectpilot.io/auth/linkedin/callback'])assert.throws(()=>createLinkedIn({origins:[origin],config:{...config,redirectUri}}));
 assert.throws(()=>createLinkedIn({origins:[origin],config:{...config,encryptionKey:Buffer.alloc(16).toString('base64')}}));
});
