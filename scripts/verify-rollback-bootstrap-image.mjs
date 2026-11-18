// Exact-image, disposable native PostgreSQL only. Runs actual rollback-server.
// No authenticated Firebase request, provider work, normal worker or rollout.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {migrate} from '../migrate.mjs';
if(process.argv.length!==3||process.argv[2]!=='--synthetic-image')throw Error('Explicit --synthetic-image required');
if(Object.entries(process.env).some(([k,v])=>/^PG/i.test(k)&&v))throw Error('Inherited PG settings forbidden');
let url;try{url=new URL(process.env.STAGING_DATABASE_URL||'');}catch{throw Error('Explicit disposable synthetic database URL required');}
if(url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.username!=='postgres'||url.password!=='synthetic-ci-only'||url.pathname!=='/prospectpilot_test'||url.search||url.hash)throw Error('Only fixed disposable synthetic loopback PostgreSQL permitted');
const pgPort=Number(url.port||5432);
if(!Number.isInteger(pgPort)||pgPort<1||pgPort>65535)throw Error('Invalid disposable PostgreSQL port');
const config={host:'127.0.0.1',port:pgPort,user:'postgres',password:'synthetic-ci-only',database:'prospectpilot_test',ssl:false,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000};
const suffix=randomBytes(12).toString('hex'),role='pp_boot_'+suffix,schema='pp_boot_'+suffix,releaseId='synthetic-bootstrap034-'+suffix,password=randomBytes(32).toString('hex');
const root=fileURLToPath(new URL('..',import.meta.url));
const admin=new pg.Client(config);
let connected=false,roleCreated=false,schemaCreated=false,child,pool,home,exitResult=null,exitPromise;
let stdout='',stderr='',outputOverflow=false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const bounded=async(p,ms,label)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}};
const stopChild=async()=>{if(!child||exitResult)return;child.kill('SIGTERM');try{await bounded(exitPromise,5000,'Child shutdown timed out');}catch{child.kill('SIGKILL');await bounded(exitPromise,5000,'Child kill timed out');}};
const snapshot=async()=>{const out={};for(const {tablename}of(await pool.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows){assert.match(tablename,/^[a-z_]+$/);out[tablename]=(await pool.query('SELECT to_jsonb(t) AS value FROM "'+tablename+'" t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.value);}return out;};
try{
 await admin.connect();connected=true;
 // Generated identifiers/hex password only. No existing roles or schemas touched.
 assert.match(role,/^pp_boot_[a-f0-9]{24}$/);assert.match(password,/^[a-f0-9]{64}$/);
 await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);roleCreated=true;
 await admin.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`);schemaCreated=true;
 await admin.query(`ALTER ROLE "${role}" IN DATABASE prospectpilot_test SET search_path TO "${schema}"`);
 const runtimeConfig={...config,user:role,password};
 await migrate(new pg.Pool({...runtimeConfig,max:1}));
 pool=new pg.Pool({...runtimeConfig,max:1});
 assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema,schema);
 await pool.query("INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES('bootstrap-fixture','synthetic-owner','{\"first_name\":\"Synthetic\",\"last_name\":\"Fixture\"}','[]')");
 const before=await snapshot();
 // Reserve an available loopback port; a bind race causes failure, never reuse.
 const socket=createServer();await bounded(new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve);}),5000,'Port reservation timed out');
 const port=socket.address().port;await bounded(new Promise((resolve,reject)=>socket.close(e=>e?reject(e):resolve())),5000,'Port reservation close timed out');
 home=await mkdtemp(join(tmpdir(),'pp-bootstrap-home-'));
 const launch=()=>{
 stdout='';stderr='';outputOverflow=false;exitResult=null;
 child=spawn(process.execPath,['--import',fileURLToPath(new URL('./rollback-bootstrap-network-guard.mjs',import.meta.url)),'rollback-server.mjs'],{cwd:root,stdio:['ignore','pipe','pipe'],env:{
  PATH:process.env.PATH||'/usr/bin:/bin',HOME:home,CLOUDSDK_CONFIG:home,GOOGLE_APPLICATION_CREDENTIALS:join(home,'no-credentials.json'),
  NODE_ENV:'production',ROLLBACK_SYNTHETIC_BOOTSTRAP:'1',GOOGLE_CLOUD_PROJECT:'synthetic-bootstrap-no-provider',OWNER_EMAIL:'synthetic-admin@example.test',
  PGHOST:'127.0.0.1',PGPORT:String(pgPort),PGDATABASE:'prospectpilot_test',PGUSER:role,PGPASSWORD:password,PGSSLMODE:'disable',
  PORT:String(port),APP_ORIGINS:'https://127.0.0.1:'+port,PROSPECTPILOT_READ_ONLY:'false',PROSPECTPILOT_RELEASE_ID:releaseId,PGPOOL_MAX:'1',MAX_INFLIGHT:'2'
 }});
 exitPromise=new Promise(resolve=>{child.once('error',()=>{exitResult={code:null,signal:'spawn-error'};resolve(exitResult);});child.once('exit',(code,signal)=>{exitResult={code,signal};});child.once('close',(code,signal)=>resolve(exitResult||{code,signal}));});
 for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{if(key==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();if(stdout.length+stderr.length>65536){outputOverflow=true;child.kill('SIGKILL');}});
 };
 const base='http://127.0.0.1:'+port;
 await pool.query("INSERT INTO prospectpilot_migrations(id) VALUES('035')");
 const incompatible=await snapshot();launch();
 const refused=await bounded(exitPromise,15000,'Incompatible schema startup did not exit');
 assert.equal(refused.code,1);assert.equal(refused.signal,null);assert.equal(outputOverflow,false);
 assert.match(stdout,/SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED/);
 assert.match(stderr,/Rollback schema verification refused startup/);
 assert.match(stderr,/ledger must be exactly001 through034/);
 assert.match(stdout,/\"synthetic_bootstrap_network_guard\":true,\"denied_operations\":0/);
 await assert.rejects(fetch(base+'/health',{signal:AbortSignal.timeout(1000)}),'Incompatible schema must not serve HTTP');
 assert.deepEqual(await snapshot(),incompatible,'Refused bootstrap must not mutate application data');
 await pool.query("DELETE FROM prospectpilot_migrations WHERE id='035'");
 assert.deepEqual(await snapshot(),before);launch();
 let healthy=false;const deadline=Date.now()+20000;
 do{if(exitResult)throw Error('Actual rollback server exited before healthy');try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});await r.arrayBuffer();healthy=r.status===200;}catch{}if(healthy)break;await delay(100);}while(Date.now()<deadline);
 assert.equal(healthy,true,'Actual rollback entrypoint must serve health');
 const version=await(await fetch(base+'/version',{signal:AbortSignal.timeout(2000)})).json();assert.equal(version.release_id,releaseId);assert.equal(version.read_only,false);
 const denied=await fetch(base+'/api/lab/worklist',{signal:AbortSignal.timeout(2000)});await denied.arrayBuffer();assert.equal(denied.status,401,'No-cookie API refused before Firebase');
 assert.deepEqual(await snapshot(),before,'Bootstrap/unauthenticated probes must not modify application data');
 const backends=(await admin.query("SELECT pid,backend_start::text AS backend_start FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND application_name='prospectpilot-rollback-guard'",[role,'prospectpilot_test'])).rows;
 assert.equal(backends.length,1,'Exactly one guard belonging to the generated role');
 const locked=(await admin.query('SELECT pg_try_advisory_lock(505002) AS locked')).rows[0].locked;
 if(locked)await admin.query('SELECT pg_advisory_unlock(505002)');
 assert.equal(locked,false,'Live rollback guard must block exclusive migration lock');
 const guard=backends[0];
 // Recheck ownership/start time at termination to avoid an unrelated/reused PID.
 const killed=(await admin.query("SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2 AND usename=$3 AND datname=$4 AND application_name='prospectpilot-rollback-guard'",[guard.pid,guard.backend_start,role,'prospectpilot_test'])).rows;
 assert.equal(killed.length,1);assert.equal(killed[0].terminated,true);
 const ended=await bounded(exitPromise,10000,'Actual rollback process did not exit after guard loss');
 assert.equal(ended.code,1);assert.equal(ended.signal,null);assert.equal(outputOverflow,false);
 assert.match(stderr,/Rollback schema guard connection lost; exiting/);
 assert.match(stdout,/SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED/);
 const guardReports=stdout.split('\n').filter(s=>s.startsWith('{')).map(s=>{try{return JSON.parse(s);}catch{return {};}}).filter(s=>s.synthetic_bootstrap_network_guard);
 assert.equal(guardReports.length,1);assert.equal(guardReports[0].denied_operations,0,'No attempted credential/provider/network egress');
 await assert.rejects(fetch(base+'/health',{signal:AbortSignal.timeout(1500)}),'HTTP must stop after guard loss');
 assert.deepEqual(await snapshot(),before,'Guard loss must not change application data');
 console.log(JSON.stringify({verified:true,schema:'034',actual_rollback_server_bootstrap:true,incompatible035_refused:true,health:true,unauthenticated_api_denied:true,exclusive_migration_lock_blocked:true,guard_loss_exit:1,http_stopped:true,application_data_unchanged:true,outbound_attempts:0,scope:'disposable role/schema; no real Firebase, authenticated routes, normal worker, providers or production rollout'}));
}finally{
 // Only the child we spawned and sessions using our randomly generated role.
 const cleanupErrors=[];
 const clean=async fn=>{try{await fn();}catch{cleanupErrors.push('Synthetic cleanup step failed');}};
 await clean(stopChild);await clean(()=>bounded(pool?.end()||Promise.resolve(),7000,'Pool shutdown timed out'));
 if(connected){
  if(roleCreated)await clean(()=>admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND datname=$2 AND pid<>pg_backend_pid()',[role,'prospectpilot_test']));
  if(schemaCreated)await clean(()=>admin.query(`DROP SCHEMA "${schema}" CASCADE`));
  if(roleCreated){await clean(()=>admin.query(`ALTER ROLE "${role}" IN DATABASE prospectpilot_test RESET ALL`));await clean(()=>admin.query(`DROP ROLE "${role}"`));}
  await clean(()=>bounded(admin.end(),7000,'Admin shutdown timed out'));
 }
 if(home)await clean(()=>rm(home,{recursive:true,force:true}));
 if(cleanupErrors.length)throw Error('Synthetic bootstrap cleanup incomplete; inspect disposable CI fixture');
}
