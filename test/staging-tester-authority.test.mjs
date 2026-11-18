import {runTesterAuthorityScenarios} from '../scripts/staging-tester-proof-scenarios.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {installSyntheticNetworkGuard} from './helpers/staging-network.mjs';
import {migrate} from '../migrate.mjs';
import {stagingConfig,restrictedStagingAuth} from '../scripts/staging-config.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {stagingTesterRouteAllowed} from '../scripts/staging-tester-policy.mjs';
import {createAuthenticatedStaging,fictionalCSV,stagingRouteAllowed} from '../scripts/staging-app.mjs';
const now=Date.now(),project='prospectpilot-stg-261118';
const env={STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'approved-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+7*86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-app-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_app',PGUSER:'prospectpilot_stg_app',PGPASSWORD:'test-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'fictional-public-key',appId:'fictional-app'})};
const claims={uid:'approved-owner',aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};

const binding={uid:'synthetic-tester',email:'tester@example.test',expires:new Date(now+86400000).toISOString()};
const admitted=()=>stagingConfig({...env,STAGING_TESTER_BINDINGS:JSON.stringify([binding])});
const tester={...claims,uid:binding.uid,email:binding.email};
test('tester bindings default empty, bounded, exact and immutable; owner marker stays unchanged',()=>{
 assert.deepEqual(stagingConfig(env).testers,[]);assert.doesNotThrow(()=>stagingConfig({...env,STAGING_TESTER_BINDINGS:JSON.stringify([{...binding,expires:new Date(now-1).toISOString()}])}),'expired tester cannot prevent owner cold start');const config=admitted();assert.equal(config.uid,claims.uid);assert.ok(Object.isFrozen(config.testers[0]));
 for(const bindings of [{},[binding,binding],[{...binding,uid:claims.uid}],[{...binding,email:'bad email'}],[{...binding,expires:new Date(now-2000).toISOString()}],[{...binding,expires:new Date(now+8*86400000).toISOString()}],[{...binding,role:'owner'}],Array.from({length:6},(_,n)=>({...binding,uid:'test'+n,email:'test'+n+'@example.test'}))])assert.throws(()=>stagingConfig({...env,STAGING_TESTER_BINDINGS:JSON.stringify(bindings)}));
});
test('every tester token/session is verified with revocation and exact identity, expiry and binding',async()=>{
 let value=tester,revoked=false;const checks=[];const auth={verifyIdToken:async(_,r)=>{checks.push(r);if(revoked)throw Error('revoked');return value;},verifySessionCookie:async(_,r)=>{checks.push(r);if(revoked)throw Error('revoked');return value;},createSessionCookie:async()=> 'session'};
 const config=admitted(),gate=restrictedStagingAuth(auth,config);
 const verified=await gate.verifySessionCookie('test');assert.equal(verified.uid,binding.uid);assert.notEqual(verified,tester);assert.ok(Object.isFrozen(verified));value={...tester,role:'admin'};assert.equal((await gate.verifySessionCookie('test')).role,undefined);value=tester;
 for(const change of [{uid:'unknown',role:'owner'},{email:'wrong@example.test'},{email:binding.email.toUpperCase()},{email_verified:false},{aud:'other-project'},{iss:'https://securetoken.google.com/other-project'},{firebase:{sign_in_provider:'password'}}]){
  value={...tester,...change};await assert.rejects(gate.verifyIdToken('test'));await assert.rejects(gate.verifySessionCookie('test'));await assert.rejects(gate.createSessionCookie('test',{}));
 }
 value=tester;await assert.rejects(restrictedStagingAuth(auth,stagingConfig(env)).verifySessionCookie('test'));await assert.rejects(restrictedStagingAuth(auth,config,()=>config.testers[0].expires).verifySessionCookie('test'));
 revoked=true;await assert.rejects(gate.verifySessionCookie('test'));await assert.rejects(gate.createSessionCookie('test',{}));assert.ok(checks.every(Boolean));
});
test('tester policy independently denies unknown and privileged routes',()=>{
 for(const path of ['/unknown','/api/lab/runs/id','/api/prospect/saved-searches','/api/prospect/export','/api/prospect/lists/id/shares','/api/lab/identity-reviews','/api/lab/historical-identity-reviews','/api/team-hub/execute','/api/prospect/providers'])assert.equal(stagingTesterRouteAllowed(path,'GET'),false,path);
 for(const path of ['/api/prospect/export','/api/lab/advisor-profile','/api/lab/identity-reviews/id','/api/lab/historical-identity-reviews/id','/api/prospect/jobs','/api/lab/runs'])assert.equal(stagingTesterRouteAllowed(path,'POST'),false,path);
 for(const method of ['DELETE','PUT','HEAD'])assert.equal(stagingTesterRouteAllowed('/api/prospect/contacts/id',method),false);
});
test('two admitted users retain distinct fixture records and cannot read or mutate each other',async()=>{
 const db=new PGlite();const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};let network;
 try{await migrate(pool);network=installSyntheticNetworkGuard();await runTesterAuthorityScenarios({pool});assert.deepEqual(network.attempts,[]);}
 finally{network?.restore();await db.close();}
});

test('native tester proof preserves exact existing restricted-role grants and requires disposable PG16',()=>{
 const prior=readFileSync(new URL('../scripts/verify-staging-large-import-image.mjs',import.meta.url),'utf8');
 const current=readFileSync(new URL('../scripts/verify-staging-tester-image.mjs',import.meta.url),'utf8');
 const manifest=s=>s.slice(s.indexOf('export const writableTables'),s.indexOf("import {migrate}"));
 assert.equal(manifest(current),manifest(prior));
 const grants=s=>s.slice(s.indexOf(' await admin.query(`CREATE ROLE'),s.indexOf(' const claims=')<0?s.indexOf(' await runTesterAuthorityScenarios'):s.indexOf(' const claims='));
 assert.equal(grants(current),grants(prior));
 assert.match(current,/Only disposable loopback synthetic CI PostgreSQL is permitted/);assert.match(current,/Disposable PostgreSQL 16 required/);assert.match(current,/runTesterAuthorityScenarios\(\{pool,seedPool:owner\}\)/);
});
