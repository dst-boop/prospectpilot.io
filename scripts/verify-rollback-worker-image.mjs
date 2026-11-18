// Exact-image disposable fixture: actual rollback-worker entrypoint and queue loop.
// Only legacy research blocked409 is runnable; no provider/Firebase/production work.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {migrate} from '../migrate.mjs';
if(process.env.NODE_ENV==='production')throw Error('Synthetic worker harness refuses production mode');
if(process.argv.length!==3||process.argv[2]!=='--synthetic-image')throw Error('Explicit --synthetic-image required');
if(Object.entries(process.env).some(([k,v])=>/^PG/i.test(k)&&v))throw Error('Inherited PG settings forbidden');
let url;try{url=new URL(process.env.STAGING_DATABASE_URL||'');}catch{throw Error('Explicit disposable synthetic database URL required');}
if(url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.username!=='postgres'||url.password!=='synthetic-ci-only'||url.pathname!=='/prospectpilot_test'||url.search||url.hash)throw Error('Only fixed disposable synthetic loopback PostgreSQL permitted');
const pgPort=Number(url.port||5432);
if(!Number.isInteger(pgPort)||pgPort<1||pgPort>65535)throw Error('Invalid disposable PostgreSQL port');
const config={host:'127.0.0.1',port:pgPort,user:'postgres',password:'synthetic-ci-only',database:'prospectpilot_test',ssl:false,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000};
const suffix=randomBytes(12).toString('hex'),role='pp_work_'+suffix,schema='pp_work_'+suffix,releaseId='synthetic-worker034-'+suffix,password=randomBytes(32).toString('hex');
const root=fileURLToPath(new URL('..',import.meta.url));
const admin=new pg.Client(config);
let connected=false,roleCreated=false,schemaCreated=false,child,pool,home,exitResult=null,exitPromise;
let stdout='',stderr='',outputOverflow=false,barrier=false,childTimer,primaryError;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=async(p,ms,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}};
const stopChild=async()=>{if(!child||exitResult)return;child.kill('SIGTERM');try{await bounded(exitPromise,8000,'Child shutdown timed out');}catch{child.kill('SIGKILL');await bounded(exitPromise,5000,'Child kill timed out');}};
const snapshot=async()=>{const out={};for(const {tablename}of(await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows){assert.match(tablename,/^[a-z_]+$/);out[tablename]=(await pool.query('SELECT to_jsonb(t) AS value FROM "'+tablename+'" t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.value);}return out;};
try{
 await admin.connect();connected=true;
 // Generated identifiers/hex password only. No existing roles or schemas touched.
 assert.match(role,/^pp_work_[a-f0-9]{24}$/);assert.match(password,/^[a-f0-9]{64}$/);
 await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);roleCreated=true;
 await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`);schemaCreated=true;
 await admin.query(`ALTER ROLE "${role}" IN DATABASE prospectpilot_test SET search_path TO "${schema}"`);
 const runtimeConfig={...config,user:role,password,application_name:'synthetic-worker-harness'};
 await migrate(new pg.Pool({...runtimeConfig,max:1}));
 pool=new pg.Pool({...runtimeConfig,max:1});
 assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema,schema);
 await pool.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES('worker-advice','synthetic','synthetic-owner','owner@example.test','{}')");
 await pool.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('worker-advice','synthetic-owner','planning_decision','{\"value\":{\"topic\":\"retirement_income\",\"origin\":\"inbound_request\"}}')");
 await pool.query("INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,note) VALUES('worker-activity','worker-advice','synthetic-owner','worker-activity','meeting','Synthetic retained history')");
 await pool.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('worker-job','synthetic-owner','enrich','worker-job','synthetic',100)");
 for(const [id,status] of [['worker-pending','pending'],['worker-leased','running']])await pool.query("INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,payload,status,next_attempt_at,lease_token,lease_until) VALUES($1,'worker-job','synthetic-owner','enrich','synthetic','{}',$2,now()+interval '1 day',$3,now()+interval '1 day')",[id,status,status==='running'?'synthetic-unexpired-lease':null]);
 await pool.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('worker-leased','synthetic-owner','synthetic',100)");
 for(const table of ['research_jobs','lab_settings','lab_runs','lab_tasks','prospect_autopilot_runs'])assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n,0);
 const before=await snapshot();
 home=await mkdtemp(join(tmpdir(),'pp-bootstrap-home-'));
 const launch=()=>{
 stdout='';stderr='';outputOverflow=false;exitResult=null;
 child=spawn(process.execPath,['--import',fileURLToPath(new URL('./rollback-bootstrap-network-guard.mjs',import.meta.url)),'rollback-worker.mjs'],{cwd:root,stdio:['ignore','pipe','pipe'],env:{
  PATH:process.env.PATH||'/usr/bin:/bin',HOME:home,CLOUDSDK_CONFIG:home,GOOGLE_APPLICATION_CREDENTIALS:join(home,'no-credentials.json'),
  NODE_ENV:'production',ROLLBACK_SYNTHETIC_BOOTSTRAP:'1',GOOGLE_CLOUD_PROJECT:'synthetic-bootstrap-no-provider',OWNER_EMAIL:'synthetic-admin@example.test',
  PGHOST:'127.0.0.1',PGPORT:String(pgPort),PGDATABASE:'prospectpilot_test',PGUSER:role,PGPASSWORD:password,PGSSLMODE:'disable',
  PROSPECTPILOT_READ_ONLY:'false',PROSPECTPILOT_RELEASE_ID:releaseId,PGPOOL_MAX:'1',MAX_INFLIGHT:'2'
 }});
 childTimer=setTimeout(()=>child.kill('SIGKILL'),45000);
 child.once('close',()=>clearTimeout(childTimer));
 exitPromise=new Promise(resolve=>{child.once('error',()=>{exitResult={code:null,signal:'spawn-error'};resolve(exitResult);});child.once('exit',(code,signal)=>{exitResult={code,signal};});child.once('close',(code,signal)=>resolve(exitResult||{code,signal}));});
 for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{if(key==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();if(stdout.length+stderr.length>65536){outputOverflow=true;child.kill('SIGKILL');}});
 };

 const assertNetwork=()=>{
  assert.equal(outputOverflow,false);
  assert.equal(stdout.split('\n').filter(line=>line==='SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED').length,1);
  const reports=stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>{try{return JSON.parse(line);}catch{return {};}}).filter(x=>x.synthetic_bootstrap_network_guard);
  assert.equal(reports.length,1);assert.equal(reports[0].denied_operations,0);
 };
 const acquireBarrier=async()=>{
  barrier=(await admin.query('SELECT pg_try_advisory_lock(505011) AS locked')).rows[0].locked;assert.equal(barrier,true,'Synthetic autopilot barrier must be available');
 };
 const releaseBarrier=async()=>{if(barrier){await admin.query('SELECT pg_advisory_unlock(505011)');barrier=false;}};
 const awaitLoop=async()=>{
  const deadline=Date.now()+15000;let seen=[];
  do{
   if(exitResult)throw Error('Actual worker exited before queue-loop proof');
   seen=(await admin.query("SELECT pid,backend_start::text AS backend_start FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND application_name='' AND query='SELECT pg_advisory_xact_lock(505011)' AND wait_event_type='Lock' AND wait_event='advisory'",[role,'prospectpilot_test'])).rows;
   if(seen.length)break;await delay(100);
  }while(Date.now()<deadline);
  assert.equal(seen.length,1,'Actual worker reached final queue tick on this generated role');
 };
 const checkGuard=async()=>{
  const backends=(await admin.query("SELECT pid,backend_start::text AS backend_start FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND application_name='prospectpilot-rollback-guard'",[role,'prospectpilot_test'])).rows;
  assert.equal(backends.length,1);
  const locked=(await admin.query('SELECT pg_try_advisory_lock(505002) AS locked')).rows[0].locked;
  if(locked)await admin.query('SELECT pg_advisory_unlock(505002)');assert.equal(locked,false,'Live worker schema guard blocks migration');
  return backends[0];
 };
 await pool.query("INSERT INTO prospectpilot_migrations(id) VALUES('035')");
 const incompatible=await snapshot();launch();
 const refused=await bounded(exitPromise,15000,'Incompatible worker schema did not exit');
 assert.equal(refused.code,1);assert.equal(refused.signal,null);assertNetwork();
 assert.match(stderr,/Rollback schema verification refused startup/);assert.match(stderr,/ledger must be exactly001 through034/);
 assert.deepEqual(await snapshot(),incompatible);
 await pool.query("DELETE FROM prospectpilot_migrations WHERE id='035'");assert.deepEqual(await snapshot(),before);
 // Barrier is an ordinary cooperating lock in this disposable database. It
 // observes the REAL final tick without modifying worker code or its schema.
 await acquireBarrier();launch();await awaitLoop();await checkGuard();
 assert.deepEqual(await snapshot(),before,'Idle actual worker preserves all saved rows');
 await releaseBarrier();child.kill('SIGTERM');
 const idle=await bounded(exitPromise,10000,'Idle actual worker did not stop gracefully');
 assert.equal(idle.code,0);assert.equal(idle.signal,null);assertNetwork();
 assert.deepEqual(await snapshot(),before);
 // Exactly one runnable queue item, guaranteed by frozen runtime routing to
 // legacy identity409 BEFORE generated worker/provider delegation.
 await pool.query("INSERT INTO research_jobs(id,lead_id,user_id,user_email,identity_signature) VALUES('worker-blocked-legacy','worker-advice','synthetic-owner','owner@example.test','synthetic-identity')");
 await acquireBarrier();launch();await awaitLoop();const liveGuard=await checkGuard();
 const row=(await pool.query("SELECT * FROM research_jobs WHERE id='worker-blocked-legacy'")).rows[0];
 assert.equal(row.status,'failed');assert.equal(row.next_source,1);assert.equal(row.attempts,0);assert.equal(row.lease_token,null);assert.equal(row.lease_until,null);
 assert.equal(row.reports.length,1);const report=row.reports[0];
 assert.deepEqual({...report,last_attempt_ms:0},{source:'website',status:'failed',limitations:['Lead access or identity changed.'],saved_record_count:0,attempt_count:1,last_attempt_ms:0});
 assert.ok(Number.isInteger(report.last_attempt_ms)&&report.last_attempt_ms>=0);
 const terminal=await snapshot();const retained={...terminal,research_jobs:before.research_jobs};assert.deepEqual(retained,before,'Only explicitly seeded legacy job changes; advice, pending/leased tasks and reservations stay intact');
 // Terminate only this child guard, checking role/database/start time against PID reuse.
 const killed=(await admin.query("SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2 AND usename=$3 AND datname=$4 AND application_name='prospectpilot-rollback-guard'",[liveGuard.pid,liveGuard.backend_start,role,'prospectpilot_test'])).rows;
 assert.equal(killed.length,1);assert.equal(killed[0].terminated,true);
 const ended=await bounded(exitPromise,10000,'Actual worker survived schema guard loss');
 assert.equal(ended.code,1);assert.equal(ended.signal,null);assert.match(stderr,/Rollback schema guard connection lost; exiting/);assertNetwork();
 await releaseBarrier();
 const deadline=Date.now()+5000;let remaining;
 do{remaining=(await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND application_name<>'synthetic-worker-harness'",[role,'prospectpilot_test'])).rows[0].n;if(!remaining)break;await delay(100);}while(Date.now()<deadline);
 assert.equal(remaining,0,'Actual child worker sessions all closed');
 assert.deepEqual(await snapshot(),terminal,'Guard loss preserves terminal refusal and every unrelated row');
 console.log('WORKER_BOOTSTRAP_RESULT:'+JSON.stringify({verified:true,fullCompatibility:false,networkDeniedOperations:0,actual_rollback_worker_bootstrap:true,incompatible035_refused:true,idle_loop_reached:true,idle_graceful_exit:0,legacy_queue_loop_reached:true,legacy_identity_guard_terminal_refusal:true,exclusive_migration_lock_blocked:true,guard_loss_exit:1,worker_sessions_closed:true,unrelated_rows_preserved:true,reservations_preserved:true,outbound_attempts:0,scope:'only synthetic legacy409 refusal executed; no paid/provider/lab/autopilot work, Firebase or production rollout'}));
}catch(error){primaryError=error;throw error;}finally{
 // Only the child we spawned and sessions using our randomly generated role.
 const cleanupErrors=[];
 const clean=async fn=>{try{await fn();}catch{cleanupErrors.push('Synthetic cleanup step failed');}};
 await clean(stopChild);clearTimeout(childTimer);
 if(connected&&barrier)await clean(async()=>{await admin.query('SELECT pg_advisory_unlock(505011)');barrier=false;});await clean(()=>bounded(pool?.end()||Promise.resolve(),7000,'Pool shutdown timed out'));
 if(connected){
  if(roleCreated)await clean(()=>admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND pid<>pg_backend_pid()',[role,'prospectpilot_test']));
  if(schemaCreated)await clean(()=>admin.query(`DROP SCHEMA "${schema}" CASCADE`));
  if(roleCreated){await clean(()=>admin.query(`ALTER ROLE "${role}" IN DATABASE prospectpilot_test RESET ALL`));await clean(()=>admin.query(`DROP ROLE "${role}"`));}
  await clean(()=>bounded(admin.end(),7000,'Admin shutdown timed out'));
 }
 if(home)await clean(()=>rm(home,{recursive:true,force:true}));
 if(cleanupErrors.length){if(primaryError)console.error('Synthetic worker cleanup incomplete');else throw Error('Synthetic worker cleanup incomplete');}
}
