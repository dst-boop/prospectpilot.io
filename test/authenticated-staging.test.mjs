import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {installSyntheticNetworkGuard} from './helpers/staging-network.mjs';
import {migrate} from '../migrate.mjs';
import {stagingConfig,restrictedStagingAuth} from '../scripts/staging-config.mjs';
import {createAuthenticatedStaging,fictionalCSV,stagingRouteAllowed} from '../scripts/staging-app.mjs';
const now=Date.now(),project='prospectpilot-stg-261118';
const env={STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'approved-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+7*86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-app-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_app',PGUSER:'prospectpilot_stg_app',PGPASSWORD:'test-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'fictional-public-key',appId:'fictional-app'})};
const claims={uid:'approved-owner',aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
test('staging refuses production and inherited configuration, invalid lifetime and mismatched client auth',()=>{
 assert.equal(stagingConfig(env).project,project);
 for(const change of [{STAGING_PROJECT_ID:'lead-qualifier-505002'},{GOOGLE_CLOUD_PROJECT:'lead-qualifier-505002'},{PGHOST:'/cloudsql/lead-qualifier-505002:us-central1:production'},{PGDATABASE:'production'},{PGUSER:'postgres'},{STAGING_ORIGIN:'https://prospectpilot.io'},{STAGING_ORIGIN:env.STAGING_ORIGIN+'/path'},{STAGING_EXPIRES_AT:new Date(now-1).toISOString()},{STAGING_EXPIRES_AT:new Date(now+31*86400000).toISOString()},{STAGING_OWNER_UID:''},{FIREBASE_AUTH_EMULATOR_HOST:'localhost:9099'},{PGSERVICE:'production'},{FORGET_TOMBSTONE_KEY:'production-key-must-not-be-reused'},{FORGET_TOMBSTONE_PREVIOUS_KEYS:'["production-key"]'},{GCE_METADATA_HOST:'untrusted.test'},{HTTPS_PROXY:'https://untrusted.test'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{GOOGLE_APPLICATION_CREDENTIALS:'/tmp/production.json'},{PDL_API_KEY:'not-real'},{STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:'lead-qualifier-505002'})}])assert.throws(()=>stagingConfig({...env,...change}));
});
test('real verifier wrapper checks revocation, owner UID and project on login AND every cookie',async()=>{
 const flags=[];let value=claims;const auth={verifyIdToken:async(_,revoked)=>{flags.push(revoked);return value;},verifySessionCookie:async(_,revoked)=>{flags.push(revoked);return value;},createSessionCookie:async()=> 'session'};
 const config=stagingConfig(env),g=restrictedStagingAuth(auth,config);
 assert.equal((await g.verifyIdToken('token')).uid,claims.uid);assert.equal((await g.verifySessionCookie('cookie')).uid,claims.uid);
 for(const change of [{uid:'other-owner'},{aud:'lead-qualifier-505002'},{iss:'https://securetoken.google.com/lead-qualifier-505002'},{email_verified:false},{firebase:{sign_in_provider:'password'}}]){value={...claims,...change};await assert.rejects(g.verifyIdToken('token'));await assert.rejects(g.verifySessionCookie('cookie'));await assert.rejects(g.createSessionCookie('token',{}));}
 value=claims;await assert.rejects(restrictedStagingAuth(auth,config,()=>config.expires).verifySessionCookie('cookie'));assert.ok(flags.every(Boolean));
});
test('default-deny blocks provider, jobs, legacy, share, native, billing, invitation and unknown routes',()=>{
 for(const path of ['/api/prospect/providers','/api/prospect/jobs','/api/prospect/autopilot','/api/prospect/lists/x/shares','/api/prospect/contacts/x/profile-image','/api/lab/runs','/api/lab/import','/api/v3/discovery','/api/research','/api/enrichment','/api/stripe/webhook','/api/team-hub/execute','/settings/linkedin','/api/new-outbound-route'])for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(stagingRouteAllowed(path,method),false,path);
});
test('actual application imports only fictional CSV, handoff reaches worklist, auth and expiry fail closed',async()=>{
 const db=new PGlite();let network;const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
 try{
 await migrate(pool);network=installSyntheticNetworkGuard();
 let clock=now;const config=stagingConfig(env),seen=[];
 const auth={verifyIdToken:async(t,r)=>{seen.push(r);return t==='owner'?claims:{...claims,uid:'other'};},verifySessionCookie:async(t,r)=>{seen.push(r);return t==='owner'?claims:{...claims,uid:'other'};},createSessionCookie:async()=> 'owner'};
 const app=createAuthenticatedStaging({pool,auth,config,loginScript:'// synthetic test only',clock:()=>clock});
 const req=(path,{method='GET',body,cookie='owner',origin=config.origin}={})=>app(new Request(config.origin+path,{method,headers:{origin,...cookie?{cookie:'__session='+cookie}:{},'content-type':'application/json'},...body?{body:JSON.stringify(body)}:{}}));
 assert.equal((await req('/auth/session',{method:'POST',body:{idToken:'other'},cookie:null})).status,401);
 assert.equal((await req('/auth/session',{method:'POST',body:{idToken:'owner'},cookie:null})).status,200);
 assert.equal((await req('/api/prospect/contacts',{cookie:'other'})).status,401);
 assert.equal((await req('/api/prospect/import',{method:'POST',body:{csv:fictionalCSV},origin:'https://evil.test'})).status,403);
 assert.equal((await req('/api/prospect/import',{method:'POST',body:{csv:'real,data'}})).status,422);
 assert.equal((await req('/api/prospect/lists/x/shares',{method:'POST',body:{email:'other@example.test'}})).status,403);
 for(const path of ['/staging-ui.js','/staging-ui.css','/staging-logout.js']){const asset=await req(path);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),path.endsWith('.js')?/javascript/:/css/);assert.equal((await req(path,{cookie:null})).status,401);assert.equal((await req(path,{cookie:'other'})).status,401);assert.equal((await req(path,{method:'POST'})).status,403);}
 assert.equal((await req('/logout',{cookie:null})).status,401);assert.equal((await req('/logout',{cookie:'other'})).status,401);const logoutPage=await req('/logout');assert.equal(logoutPage.status,200);assert.doesNotMatch(await logoutPage.text(),/<form/);assert.match(logoutPage.headers.get('content-security-policy'),/form-action 'none'/);
 for(const origin of [null,'null','https://evil.test']){const headers={cookie:'__session=owner'};if(origin!==null)headers.origin=origin;const response=await app(new Request(config.origin+'/logout',{method:'POST',headers}));assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null);}
 const signedOut=await req('/logout',{method:'POST'});assert.equal(signedOut.status,303);assert.match(signedOut.headers.get('set-cookie'),/__session=; Max-Age=0/);assert.equal((await req('/api/prospect/me',{cookie:null})).status,401);
 const fixture=await req('/staging-fixture.csv');assert.equal(await fixture.text(),fictionalCSV);
 assert.equal((await req('/staging-fixture.csv',{cookie:null})).status,401);
 const preview=await req('/api/prospect/import/preview',{method:'POST',body:{csv:fictionalCSV}});assert.equal(preview.status,200);
 assert.equal((await (await req('/api/prospect/contacts')).json()).total,0);
 const imported=await req('/api/prospect/import',{method:'POST',body:{csv:fictionalCSV,source:'Fictional staging fixture'}});assert.equal(imported.status,200);assert.equal((await imported.json()).added,2);
 const contacts=await (await req('/api/prospect/contacts')).json();assert.equal(contacts.total,2);
 const detail=await (await req('/api/prospect/contacts/'+contacts.contacts[0].id)).json();
 const prepare=await req('/api/prospect/contacts/'+contacts.contacts[0].id+'/prepare',{method:'POST',body:{revision:detail.contact.edit_revision}});assert.equal(prepare.status,200);
 const handoff=await req('/api/lab/contact-import',{method:'POST',body:{ids:[contacts.contacts[0].id]}});assert.equal(handoff.status,200,await handoff.clone().text());
 const work=await req('/api/lab/worklist');assert.equal(work.status,200);assert.match(await work.text(),/Fiction|Sample/);
 const page=await req('/audience');assert.match(await page.text(),/FICTIONAL STAGING/);assert.match(page.headers.get('content-security-policy'),/connect-src 'none'/);
 assert.match(await (await req('/login')).text(),/approved owner only/);assert.ok(seen.every(Boolean));
 clock=config.expires;assert.equal((await req('/staging-ui.js')).status,410);assert.equal((await req('/api/prospect/contacts')).status,410);assert.equal((await req('/auth/session',{method:'POST',body:{idToken:'owner'}})).status,410);
  assert.deepEqual(network.attempts,[],'no outbound HTTP, TCP, DNS or UDP attempt');
 }finally{network?.restore();await db.close();}
});
test('staging assembly never loads provider adapters, fake auth, production bundle or dispatch implementation',()=>{
 const app=readFileSync(new URL('../scripts/staging-app.mjs',import.meta.url),'utf8');assert.match(app,/createProspectWorkspace\(\{pool,checkDomain:deny\}\)/);assert.doesNotMatch(app,/from ['"].*(prospect-providers|lab-sources|native-research|server\.mjs|demo\.mjs)/);
 const client=readFileSync(new URL('../scripts/staging-login-client.mjs',import.meta.url),'utf8');assert.doesNotMatch(client,/firebase-config\.json|createUserWithEmailAndPassword|sendPasswordResetEmail/);
 const entry=readFileSync(new URL('../scripts/staging-server.mjs',import.meta.url),'utf8');assert.match(entry,/firebase-admin\/auth/);assert.doesNotMatch(entry,/generated\/login\.js/);
});
test('separate login bundle builds without production config or writable generated files',async()=>{
 const {buildStagingLogin}=await import('../scripts/build-staging-login.mjs');
 const result=await buildStagingLogin(stagingConfig(env));assert.equal(result.project,project);
 assert.ok(result.script.includes(project));assert.ok(result.script.includes('fictional-public-key'));
 assert.ok(!result.script.includes('lead-qualifier-505002'));assert.match(result.script,/\/auth\/session/);
});
test('runtime marker and HTTP host guards fail closed before application access',async()=>{
 const {assertStagingDatabase,createStagingHttpHandler}=await import('../scripts/staging-runtime-guards.mjs');const config=stagingConfig(env);
 const row={project_id:config.project,owner_uid:config.uid,expires_at:new Date(config.expires)};
 await assertStagingDatabase({query:async()=>({rows:[row]})},config);
 for(const rows of [[],[{...row,project_id:'production'}],[{...row,owner_uid:'other'}],[{...row,expires_at:new Date(config.expires+1)}]])await assert.rejects(assertStagingDatabase({query:async()=>({rows})},config));
 let reached=false;const guard=createStagingHttpHandler(()=>{reached=true;},config);
 for(const headers of [{host:'production.test'},{host:new URL(config.origin).host,'x-forwarded-host':'evil.test'}]){let status;guard({headers},{writeHead(n){status=n;},end(){}});assert.equal(status,403);assert.equal(reached,false);}
});
test('session issuer is accepted only from verified owner; revoked SDK errors propagate',async()=>{
 const config=stagingConfig(env);let revoked=false;
 const auth={verifySessionCookie:async()=>{if(revoked)throw Error('auth/session-cookie-revoked');return {...claims,iss:'https://session.firebase.google.com/'+project};}};
 const gated=restrictedStagingAuth(auth,config);assert.equal((await gated.verifySessionCookie('owner')).uid,config.uid);revoked=true;await assert.rejects(gated.verifySessionCookie('owner'),/revoked/);
});
