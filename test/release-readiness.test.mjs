import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHandler} from '../handler.mjs';
import {createReleaseReadiness,candidateOrigin} from '../release-readiness.mjs';
import {readReleaseSession,verifyCandidateReadiness,main} from '../scripts/verify-candidate-readiness.mjs';
const origin='https://candidate---service-abc-uc.a.run.app';
const validOrigin=origin;
const claims={uid:'owner',email:'OWNER@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}};
function handler({identity=claims,verifyError=false,ready=async()=>true,...extra}={}){return createHandler({origins:['https://prospectpilot.io'],ownerEmail:'owner@example.test',releaseId:'release-123',releaseCheckOrigin:validOrigin,releaseReadiness:ready,auth:{verifySessionCookie:async(cookie,revoked)=>{assert.equal(revoked,true);assert.equal(cookie,'synthetic');if(verifyError)throw Error('secret');return identity;}},...extra});}
const request=(base=validOrigin,path='/api/release/readiness',cookie=true)=>new Request(base+path,{headers:cookie?{cookie:'__session=synthetic'}:{}});
test('owner authenticated readiness permits only exact route on injected candidate origin',async()=>{
 const h=handler(),r=await h(request());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{ready:true,release_id:'release-123',schema_version:'034'});
 for(const path of ['/version','/login','/api/prospect/me'])assert.equal((await h(request(validOrigin,path))).status,403);
 assert.equal((await h(request('https://other.run.app'))).status,403);
 assert.equal((await h(request(validOrigin,'/health',false))).status,200);
});
test('missing, revoked, invalid, unverified, non-owner sessions fail closed without DB work',async()=>{
 for(const options of [{verifyError:true},{identity:{...claims,uid:''}},{identity:{...claims,email_verified:false}},{identity:{...claims,firebase:{sign_in_provider:'anonymous'}}},{identity:{...claims,email:'other@example.test'}},{ownerEmail:''}]){
 let calls=0;const r=await handler({...options,ready:async()=>{calls++;return true;}})(request());assert.ok([401,403].includes(r.status));assert.equal(calls,0);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/secret|other@example/);
 }
 assert.equal((await handler()(request(validOrigin,'/api/release/readiness',false))).status,401);
});
test('database failure has generic no-store output and no configuration',async()=>{
 for(const ready of [async()=>false,async()=>{throw Error('PGPASSWORD=secret PGDATABASE=private');}]){const r=await handler({ready})(request());assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{detail:'Release readiness unavailable.'});}
});
test('read-only actual database, all migration IDs through 034, and capture table required',async()=>{
 const good={database:'expected',capture_table:true,historical_tables:true,migration_count:34};
 for(const row of [good,{...good,database:'wrong'},{...good,capture_table:false},{...good,historical_tables:false},{...good,migration_count:32}]){
 const ready=createReleaseReadiness({database:'expected',releaseId:'r',pool:{query:async q=>{assert.match(q.text,/^SELECT/);assert.equal(q.values[0].length,34);assert.equal(q.values[0][0],'001');assert.equal(q.values[0][33],'034');assert.equal(q.query_timeout,10000);return {rows:[row]};}}});assert.equal(await ready(),row===good);
 }
 await assert.rejects(createReleaseReadiness({database:'expected',releaseId:'r',pool:{query:async()=>{throw Error('unavailable');}}}));
});
test('strict candidate origins exclude credential, path, port, suffix and plaintext destinations',()=>{
 for(const value of ['http://a.run.app','https://a.run.app/','https://a.run.app/path','https://a.run.app:443','https://user@a.run.app','https://a.run.app.evil.test','https://a.run.app?x=1'])assert.equal(candidateOrigin(value),null);
 assert.equal(candidateOrigin(validOrigin),validOrigin);
});
test('verifier sends session only to validated host, never redirects and checks exact response',async()=>{
 const good={ready:true,release_id:'release-123',schema_version:'034'};
 const options={readSession:async()=> 'synthetic',fetchImpl:async(url,opts)=>{assert.equal(url,validOrigin+'/api/release/readiness');assert.equal(opts.redirect,'manual');assert.equal(opts.headers.Cookie,'__session=synthetic');assert.ok(opts.signal);return Response.json(good);}};
 assert.equal(await verifyCandidateReadiness(validOrigin,'release-123',options),true);
 for(const response of [new Response(null,{status:302,headers:{location:'https://evil.test'}}),Response.json({...good,release_id:'wrong'}),Response.json({...good,schema_version:'031'}),Response.json({...good,secret:'value'}),Response.json({...good,ready:false}),new Response('ok'),Response.json(null),new Response('{',{headers:{'content-type':'application/json'}}),new Response('x'.repeat(5000),{headers:{'content-type':'application/json'}})])await assert.rejects(verifyCandidateReadiness(validOrigin,'release-123',{...options,fetchImpl:async()=>response}),/Candidate readiness verification failed/);
 let fetched=false;await assert.rejects(verifyCandidateReadiness('https://evil.test','r',{...options,fetchImpl:async()=>{fetched=true;}}));assert.equal(fetched,false);
 const output=[];assert.equal(await main([validOrigin,'r'],{...options,fetchImpl:async()=>{throw Error('credential-secret');},log:x=>output.push(x),error:x=>output.push(x)}),1);assert.deepEqual(output,['Candidate readiness verification failed.']);
});
test('session file preflight rejects unsafe content, repository files and permissive POSIX files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pp-readiness-')),file=join(dir,'session');
 try{
 await writeFile(file,'synthetic.token',{mode:0o600});assert.equal(await readReleaseSession(file),'synthetic.token');
 const output=[];assert.equal(await main(['--preflight'],{sessionFile:file,log:x=>output.push(x)}),0);
 for(const value of ['x\n','__session=x','x; other=y','x\r','x\u0000','']){await writeFile(file,value);await assert.rejects(readReleaseSession(file));}
 await assert.rejects(readReleaseSession(new URL('../package.json',import.meta.url)));
 await assert.rejects(readReleaseSession(dir));await assert.rejects(readReleaseSession(''));
 if(process.platform!=='win32'){await writeFile(file,'synthetic');await symlink(file,join(dir,'link'));await assert.rejects(readReleaseSession(join(dir,'link')));await symlink(dir,join(dir,'parent-link'));await assert.rejects(readReleaseSession(join(dir,'parent-link','session')));const {chmod,link}=await import('node:fs/promises');await link(file,join(dir,'hardlink'));await assert.rejects(readReleaseSession(file));await rm(join(dir,'hardlink')); await chmod(file,0o644);await assert.rejects(readReleaseSession(file));}
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('PGlite readiness query validates ledger, capture relation and database identity',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const pg=new PGlite();
 try{
  const pool={query:({text,values})=>pg.query(text,values)};
  const database=(await pg.query('SELECT current_database() AS name')).rows[0].name;
  const ready=createReleaseReadiness({pool,database,releaseId:'synthetic-release'});
  // No migrations table fails closed before setup.
  await assert.rejects(ready());
  await pg.exec('CREATE TABLE public.prospectpilot_migrations (id text PRIMARY KEY); CREATE TABLE public.prospect_networking_captures (id text PRIMARY KEY)');
  await pg.query("INSERT INTO public.prospectpilot_migrations SELECT lpad(n::text,3,'0') FROM generate_series(1,34) n");
  assert.equal(await ready(),false);
  await pg.exec('CREATE TABLE public.prospect_identity_evidence (id text); CREATE TABLE public.prospect_historical_identifiers (id text); CREATE TABLE public.prospect_historical_reviews (id text)');
  assert.equal(await ready(),true);
  assert.equal(await createReleaseReadiness({pool,database:database+'-wrong',releaseId:'synthetic-release'})(),false);
  await pg.query("DELETE FROM public.prospectpilot_migrations WHERE id='034'");assert.equal(await ready(),false);
  await pg.query("INSERT INTO public.prospectpilot_migrations VALUES ('034')");
  await pg.query("DELETE FROM public.prospectpilot_migrations WHERE id='007'");assert.equal(await ready(),false);
  await pg.query("INSERT INTO public.prospectpilot_migrations VALUES ('007')");assert.equal(await ready(),true);
  await pg.exec('DROP TABLE public.prospect_networking_captures');assert.equal(await ready(),false);
 }finally{await pg.close();}
});
