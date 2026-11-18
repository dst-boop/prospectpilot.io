// Synthetic exact-image + native PostgreSQL rehearsal. NOT real Google sign-in proof.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {largeFictionalCSV,largeFixtureRows} from './staging-fixtures.mjs';
import pg from 'pg';
// Explicit reviewed-route candidate grants; not a general migration or production tool.
export const writableTables=Object.freeze(['prospect_contacts','prospect_imports','prospect_lists','prospect_list_members','prospect_saved_searches','prospect_identity_evidence','prospect_historical_reviews','prospect_historical_identifiers','lead_acquisitions','prospect_external_usage','discovery_users','discovery_leads','discovery_audit','lab_settings','lab_runs','lab_run_leads','lab_observations','lab_qualification','lab_identity_reviews','advisor_activities','advisor_contact_links','advisor_profiles','advisor_rest_periods']);
export const readableTables=Object.freeze(['employer_plan_catalog_summary','employer_plan_catalog','prospect_forgotten','prospect_list_shares','prospect_memberships','prospect_networking_captures','research_jobs','lab_tasks','lab_costs','lab_companies','lead_call_records','prospect_jobs','prospect_charges','prospect_tasks','prospectpilot_migrations','staging_pilot_identity']);
const valid=value=>/^prospectpilot_stg_[a-z0-9_]+$/.test(value||'');
export function stagingDatabaseGrants(database,role){
 if(!valid(database)||!valid(role))throw Error('Explicit staging database and role required');
 return `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE "${database}" TO "${role}"; GRANT USAGE ON SCHEMA public TO "${role}";`;
}
export function stagingTableGrants(role){
 if(!valid(role))throw Error('Explicit staging role required');
 return writableTables.map(t=>`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.${t} TO "${role}";`).join('\n')+'\n'+readableTables.map(t=>`GRANT SELECT ON TABLE public.${t} TO "${role}";`).join('\n');
}
export function stagingGrants(database,role){return stagingDatabaseGrants(database,role)+'\n'+stagingTableGrants(role);}

import {migrate} from '../migrate.mjs';
import {stagingConfig} from './staging-config.mjs';
import {assertStagingDatabase,createStagingHttpHandler} from './staging-runtime-guards.mjs';
import {createAuthenticatedStaging,fictionalCSV} from './staging-app.mjs';
if(process.argv.length!==3||process.argv[2]!=='--synthetic-image')throw Error('Explicit --synthetic-image required');
if(Object.entries(process.env).some(([k,v])=>/^PG/.test(k)&&v))throw Error('Inherited PG settings forbidden');
const url=new URL(process.env.STAGING_DATABASE_URL||'');
if(url.protocol!=='postgres:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username!=='postgres'||url.password!=='synthetic-ci-only'||url.pathname!=='/prospectpilot_test'||url.search||url.hash)throw Error('Only disposable loopback synthetic CI PostgreSQL is permitted');
const db={host:url.hostname,port:Number(url.port||5432),user:'postgres',password:'synthetic-ci-only',database:'prospectpilot_test',ssl:false,connectionTimeoutMillis:5000};
const now=Date.now(),project='prospectpilot-stg-261118';
const env={STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-app-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_app',PGUSER:'prospectpilot_stg_app',PGPASSWORD:'synthetic-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic-public-key',appId:'synthetic-app'})};
const config=stagingConfig(env),suffix=randomBytes(6).toString('hex'),schema='public',database='prospectpilot_stg_'+suffix,initializer='prospectpilot_stg_init_'+suffix,runtime='prospectpilot_stg_app_'+suffix;
const password=randomBytes(24).toString('hex');
const admin=new pg.Client(db);await admin.connect();let pool,owner,server,proofError,external=0;
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{external++;throw Error('No external fetch permitted');};
try{
 await admin.query(`CREATE ROLE ${initializer} LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
 await admin.query(`CREATE ROLE ${runtime} LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
 await admin.query(`CREATE DATABASE ${database} OWNER ${initializer}`);
 await migrate(new pg.Pool({...db,database,user:initializer,password}));
 owner=new pg.Pool({...db,database,user:initializer,password});pool=owner;
 await pool.query('CREATE TABLE staging_pilot_identity(singleton boolean PRIMARY KEY CHECK(singleton),project_id text,owner_uid text,expires_at timestamptz)');
 await assert.rejects(assertStagingDatabase(pool,config));
 await pool.query('INSERT INTO staging_pilot_identity VALUES(true,$1,$2,$3)',[project,config.uid,new Date(config.expires)]);
 await assertStagingDatabase(pool,config);
 for(const change of [{project:'production'},{uid:'other'},{expires:config.expires+1}])await assert.rejects(assertStagingDatabase(pool,{...config,...change}));
 await owner.query(stagingGrants(database,runtime));
 pool=new pg.Pool({...db,database,user:runtime,password,max:2});
 assert.equal((await pool.query('SELECT current_user')).rows[0].current_user,runtime);
 const attrs=(await pool.query('SELECT rolsuper,rolcreaterole,rolcreatedb,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.ok(Object.values(attrs).every(v=>v===false));
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);

 for(const sql of ['CREATE TABLE forbidden(x int)','ALTER TABLE prospect_contacts ADD COLUMN forbidden int','DROP TABLE prospect_contacts','TRUNCATE prospect_contacts','DELETE FROM employer_plan_catalog_summary','DELETE FROM employer_plan_catalog','UPDATE employer_plan_catalog SET payload=payload','UPDATE staging_pilot_identity SET owner_uid=owner_uid',"INSERT INTO staging_pilot_identity VALUES(false,'forbidden','forbidden',now())","INSERT INTO prospectpilot_migrations(id) VALUES('forbidden')",'DELETE FROM prospectpilot_migrations'])await assert.rejects(pool.query(sql),e=>e.code==='42501');
 await assertStagingDatabase(pool,config);
 const claims={uid:config.uid,aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
 const verify=async(token,revoked)=>{assert.equal(revoked,true);return {...claims,uid:token==='owner'?config.uid:'denied'};};
 const app=createAuthenticatedStaging({pool,config,loginScript:'// synthetic timing proof only',auth:{verifyIdToken:verify,verifySessionCookie:verify,createSessionCookie:async()=> 'owner'}});
 server=createServer(createStagingHttpHandler(app,config));server.listen(0,'127.0.0.1');await once(server,'listening');
 const timings={};
 const req=(path,body,cookie='owner')=>new Promise((resolve,reject)=>{
  const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
  let deadline;const finish=(fn,value)=>{clearTimeout(deadline);fn(value);};
  const q=request({hostname:'127.0.0.1',port:server.address().port,path,method:bytes?'POST':'GET',headers:{host:new URL(config.origin).host,origin:config.origin,cookie:'__session='+cookie,...bytes?{'content-type':'application/json','content-length':bytes.length}:{}}},r=>{let text='';r.on('data',chunk=>text+=chunk);r.on('end',()=>finish(resolve,{status:r.statusCode,text}));});
  deadline=setTimeout(()=>q.destroy(Error('Synthetic request exceeded 30 seconds absolute time')),30000);q.on('error',error=>finish(reject,error));q.end(bytes);
 });
 const timed=async(name,path,body)=>{const start=performance.now();const response=await req(path,body);timings[name]=Math.round(performance.now()-start);assert.ok(timings[name]<30000,name+' exceeded 30-second target');return response;};
 assert.equal((await req('/staging-fixture-large.csv',undefined,'other')).status,401);
 const downloaded=await timed('download','/staging-fixture-large.csv');assert.equal(downloaded.status,200);assert.equal(downloaded.text,largeFictionalCSV);assert.equal(Buffer.byteLength(downloaded.text),319416);assert.equal(largeFixtureRows,1000);
 const payload={csv:downloaded.text,format:'generic',source:'Synthetic restricted-role timing'};
 const counts=async()=> (await pool.query('SELECT (SELECT count(*)::int FROM prospect_contacts) AS contacts,(SELECT count(*)::int FROM prospect_imports) AS imports,(SELECT count(*)::int FROM lead_acquisitions) AS acquisitions')).rows[0];
 const empty=await counts();assert.deepEqual(empty,{contacts:0,imports:0,acquisitions:0});
 for(const [body,status] of [[{...payload,csv:payload.csv+'\nExtra,Person'},422],[{...payload,csv:42},422],[{...payload,csv:'x'.repeat(500001)},413]]){assert.equal((await req('/api/prospect/import',body)).status,status);assert.deepEqual(await counts(),empty);}
 assert.equal((await req('/api/prospect/import',payload,'other')).status,401);assert.deepEqual(await counts(),empty);
 const preview=await timed('preview','/api/prospect/import/preview',payload);assert.equal(preview.status,200,preview.text);assert.deepEqual(await counts(),empty);
 const imported=await timed('import','/api/prospect/import',payload);assert.equal(imported.status,200,imported.text);assert.equal(JSON.parse(imported.text).added,1000);
 const saved=await counts();assert.deepEqual(saved,{contacts:1000,imports:1,acquisitions:1000});
 const repeated=await timed('replay','/api/prospect/import',payload);assert.equal(repeated.status,200,repeated.text);assert.equal(JSON.parse(repeated.text).replayed,true);assert.deepEqual(await counts(),saved);
 assert.equal(external,0);
 console.log(JSON.stringify({verified:true,fixture_bytes:319416,fixture_rows:1000,request_bytes:Buffer.byteLength(JSON.stringify(payload)),timings_ms:timings,per_request_target_ms:30000,auth:'injected synthetic adapter, not real Google/IAP',database:'native PostgreSQL, actual restricted LOGIN; initializer owns test DB',scope:'exact image staging transport and downloaded fixture; not live Cloud SQL latency or minimum grants'}));
 }catch(error){proofError=error;throw error;}
 finally{
  globalThis.fetch=originalFetch;const cleanupErrors=[];
  const clean=async(action)=>{try{await action();}catch(error){cleanupErrors.push(error);}};
  if(server)await clean(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await clean(()=>pool?.end());if(owner!==pool)await clean(()=>owner?.end());
  await clean(()=>admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
  await clean(()=>admin.query(`DROP ROLE IF EXISTS ${runtime}`));
  await clean(()=>admin.query(`DROP ROLE IF EXISTS ${initializer}`));await clean(()=>admin.end());
  if(cleanupErrors.length){console.error(JSON.stringify({cleanup_failed:true,count:cleanupErrors.length}));if(!proofError)throw new AggregateError(cleanupErrors,'Synthetic proof cleanup failed');}
 }
