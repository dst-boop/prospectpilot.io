import test from 'node:test';import assert from 'node:assert/strict';
import {startRollbackRuntime,validateRollbackEnvironment} from '../rollback-bootstrap.mjs';
const fixture=(locked=true)=>{const events=[];return {events,client:{connect:async()=>events.push('connect'),query:async sql=>{events.push(sql);return {rows:[{locked}]};},end:async()=>events.push('close')}};};
test('rollback startup holds migration guard through verified application startup',async()=>{const {events,client}=fixture();const guard=await startRollbackRuntime({client,verify:async()=>events.push('verify'),start:async()=>events.push('start')});assert.deepEqual(events,['connect','SELECT pg_try_advisory_lock_shared(505002) AS locked','verify','start']);await guard.close();assert.equal(events.at(-1),'close');});
test('busy migration lock prevents inspection and application startup',async()=>{const {events,client}=fixture(false);await assert.rejects(startRollbackRuntime({client,verify:async()=>events.push('verify'),start:async()=>events.push('start')}),/startup refused/);assert.deepEqual(events,['connect','SELECT pg_try_advisory_lock_shared(505002) AS locked','close']);});
for(const stage of ['verify','start'])test('rollback '+stage+' failure closes guard without progressing',async()=>{const {events,client}=fixture();await assert.rejects(startRollbackRuntime({client,verify:async()=>{events.push('verify');if(stage==='verify')throw Error('synthetic failure');},start:async()=>{events.push('start');throw Error('synthetic failure');}}),/synthetic failure/);assert.equal(events.at(-1),'close');if(stage==='verify')assert.ok(!events.includes('start'));});

test('native PostgreSQL guard blocks cooperating migration lock until full runtime closes',{timeout:60000,skip:!process.env.POSTGRES_TEST_URL&&!process.env.STAGING_DATABASE_URL},async()=>{
 const {default:pg}=await import('pg');const {createStagingDatabase,validateStagingDatabaseUrl}=await import('./helpers/staging-database.mjs');const {migrate}=await import('../migrate.mjs');
 const db=await createStagingDatabase({backend:'postgres'});let guard,probe,held;
 const acquire=async client=>{const deadline=Date.now()+15000;do{if((await client.query('SELECT pg_try_advisory_lock(505002) AS locked')).rows[0].locked)return;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);throw Error('Timed out waiting for synthetic migration lock');};
 try{await migrate(db.pool);const config={...validateStagingDatabaseUrl(),options:'-c search_path='+db.schema,statement_timeout:5000,query_timeout:6000};probe=new pg.Client(config);await probe.connect();let started=false;
  held=new pg.Client(config);await held.connect();await acquire(held);
  guard=await startRollbackRuntime({client:{connect:async()=>{},query:(...args)=>held.query(...args),end:async()=>{await held.end();held=null;}},start:async()=>{started=true;}});assert.equal(started,true);
  await held.query('SELECT pg_advisory_unlock(505002)');
  assert.equal((await probe.query('SELECT pg_try_advisory_lock(505002) AS locked')).rows[0].locked,false);
  await guard.close();guard=null;
  // Another schema's parallel migration may acquire this database-wide key.
  await acquire(probe);await probe.query('SELECT pg_advisory_unlock(505002)');
 }finally{await guard?.close();await held?.end();await probe?.end();await db.close();}
});

test('rollback rejects connection overrides and unapproved degradation before opening resources',()=>{
 const env=Object.fromEntries(['GOOGLE_CLOUD_PROJECT','OWNER_EMAIL','PGHOST','PGDATABASE','PGUSER','PGPASSWORD'].map(k=>[k,'synthetic']));
 for(const role of ['web','worker']){assert.doesNotThrow(()=>validateRollbackEnvironment(env,role));assert.throws(()=>validateRollbackEnvironment({...env,PGOPTIONS:'-c search_path=wrong'},role),/PGOPTIONS/);for(const value of ['true','invalid'])assert.throws(()=>validateRollbackEnvironment({...env,PROSPECTPILOT_READ_ONLY:value},role),/read-only/);}
});

test('actual rollback entrypoints refuse mismatched options before server or worker startup',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const file of ['rollback-server.mjs','rollback-worker.mjs']){const result=spawnSync(process.execPath,[file],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,PGOPTIONS:'-c search_path=wrong'},encoding:'utf8',timeout:10000});assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/refuse PGOPTIONS/);assert.equal(result.stdout,'');}
});
