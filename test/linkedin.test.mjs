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
 let fail=false,calls=0;
 const linkedin=createLinkedIn({pool,page:'page',script:'script',origins:[origin],config,fetcher:async url=>{calls++;if(fail)throw Error('secret-sensitive-provider-error');return Response.json(url.endsWith('accessToken')?{access_token:'TOP-SECRET-TOKEN',expires_in:3600}:{sub:'member-id',name:'Jane Smith'});}});
 const request=(path,method='GET',who=uid,sess=session)=>linkedin(new Request(origin+path,{method}),{uid:who},sess);
 const start=async()=>new URL((await (await request('/api/linkedin/connect','POST')).json()).url).searchParams.get('state');
 return {db,pool,request,start,calls:()=>calls,fail:()=>{fail=true;}};
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
