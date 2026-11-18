// Initial quiesced activation/abort only, NOT rollback after live034 writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {migrate} from '../migrate.mjs';
import {startRollbackRuntime} from '../rollback-bootstrap.mjs';
import {createStagingDatabase,validateStagingDatabaseUrl} from './helpers/staging-database.mjs';
import {installSyntheticNetworkGuard} from './helpers/staging-network.mjs';
import {baselineCommit,historicalModules,tableSnapshot,schemaSnapshot} from './helpers/full-upgrade.mjs';
import {validateInitial034Environment} from '../scripts/initial034-safety.mjs';
import {seed029,verifyKeys,owner,initialSchemaSnapshot} from './helpers/initial034-fixture.mjs';
const target='358e0c9d8d737fb6c1082fae829c17f96cafb7dc';
const root=fileURLToPath(new URL('..',import.meta.url));
function assertTarget(){
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024});
 assert.equal(git(['rev-parse',target+'^{commit}']).trim(),target);
 const runtimeTarget=git(['rev-parse','HEAD^{commit}']).trim();
 assert.match(runtimeTarget,/^[a-f0-9]{40}$/);
 const files=git(['ls-tree','-r','--name-only',runtimeTarget]).trim().split('\n').filter(f=>/^[a-zA-Z0-9-]+\.mjs$/.test(f)||f==='generated/schema.sql'||/^migrations\/.*\.sql$/.test(f));
 for(const file of files)assert.equal(readFileSync(new URL('../'+file,import.meta.url),'utf8'),git(['show',runtimeTarget+':'+file]),'Exact checked-out successor source: '+file);
 const fixtureSource=readFileSync(new URL('./helpers/initial034-fixture.mjs',import.meta.url),'utf8').replaceAll('export async function','async function');
 const original=git(['show',target+':test/full-upgrade.rehearsal.mjs']);
 for(const name of ['seed029','verifyKeys']){
  const start=original.indexOf('async function '+name),end=original.indexOf('\n}\n',start)+3;
  assert.ok(start>=0&&end>start&&fixtureSource.includes(original.slice(start,end)),'Copied fixture function remains pinned: '+name);
 }
 const schemaSource=git(['show',target+':rollback-schema.mjs']);
 assert.ok(fixtureSource.includes(schemaSource.slice(schemaSource.indexOf('const queries={'),schemaSource.indexOf('export async function inspectRollbackSchema'))),'Catalog query copy remains pinned');

}
// Fixed docker exec command family, no shell, host mounts, files or inherited
// Docker endpoint/context override. Archive exists only in bounded process memory.
function docker(container,args,input){
 assert.match(container,/^[a-f0-9]{64}$/);
 assert.ok(['pg_dump','pg_restore','psql'].includes(args[0]));
 assert.ok(!Object.entries(process.env).some(([key,value])=>/^DOCKER_/i.test(key)&&value),'No inherited Docker overrides');
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',['--host','unix:///var/run/docker.sock','exec','-i','-e','PGPASSWORD=synthetic-ci-only','-e','PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=5000',container,'timeout','--signal=TERM','--kill-after=5s','45s',...args],{env:{PATH:process.env.PATH||'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});
  let output=[],length=0,errorLength=0,failed=false;
  const fail=()=>{failed=true;child.kill('SIGKILL');};
  const timer=setTimeout(fail,60000);
  child.stdout.on('data',b=>{length+=b.length;if(length>32*1024*1024)failed=true;else output.push(b);});
  child.stderr.on('data',b=>{errorLength+=b.length;if(errorLength>65536)failed=true;});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Synthetic backup tool could not start'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0||failed)reject(Error('Synthetic '+args[0]+' failed or exceeded bound'));else resolve(Buffer.concat(output));});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
const dbArgs=['--host=127.0.0.1','--port=5432','--username=postgres','--dbname=prospectpilot_test'];
for(const backend of ['pglite','postgres'])test(`initial034 ${backend}: pinned029 transactional activation and quiesced pre-service abort`,{
 timeout:240000,skip:backend==='postgres'&&!process.env.STAGING_DATABASE_URL&&!process.env.POSTGRES_TEST_URL&&process.env.INITIAL034_NATIVE_REQUIRED!=='1'?'Explicit disposable PostgreSQL16 and service container required':false
},async t=>{
 assert.notEqual(process.env.NODE_ENV,'production');assertTarget();
 const config=validateStagingDatabaseUrl();
 const network=installSyntheticNetworkGuard();if(config)network.allowPort(config.port);
 let db,historical,writer,admin,roleCreated=false,guard,guardClient,primaryError;
 const role='pp_initial_'+randomBytes(12).toString('hex'),password=randomBytes(24).toString('hex');
 try{
  db=await createStagingDatabase({backend});
  await db.query("SET statement_timeout='15000'");
  historical=await historicalModules(baselineCommit);
  const fixture=await seed029(db,historical);
  await verifyKeys(db,fixture);
  assert.deepEqual((await db.query('SELECT id FROM prospectpilot_migrations ORDER BY id')).rows.map(r=>r.id),Array.from({length:29},(_,i)=>String(i+1).padStart(3,'0')));
  let archive;
  if(backend==='postgres'){
   validateInitial034Environment(process.env);
   assert.equal(Math.floor(Number((await db.query('SHOW server_version_num')).rows[0].server_version_num)/10000),16,'Native restore rehearsal requires PostgreSQL16');
   admin=new pg.Client({...config,statement_timeout:15000,query_timeout:17000});await admin.connect();
   await admin.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);roleCreated=true;
   await db.query(`GRANT USAGE ON SCHEMA "${db.schema}" TO "${role}"`);
   await db.query(`GRANT SELECT,UPDATE ON prospect_contacts TO "${role}"`);
   writer=new pg.Client({...config,user:role,password,options:'-c search_path='+db.schema,statement_timeout:5000,query_timeout:7000});writer.on('error',()=>{});await writer.connect();
   const identity=(await writer.query('SELECT pg_backend_pid() AS pid,backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()')).rows[0];
   assert.equal((await writer.query('UPDATE prospect_contacts SET payload=payload WHERE id=$1 RETURNING id',[fixture.id])).rowCount,1,'Synthetic writer initially has write access');
   await admin.query(`ALTER ROLE "${role}" NOLOGIN`);
   await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA "${db.schema}" FROM "${role}"`);
   await db.query(`REVOKE ALL ON SCHEMA "${db.schema}" FROM "${role}"`);
   await assert.rejects(writer.query(`UPDATE "${db.schema}".prospect_contacts SET payload=payload`),{code:'42501'});
   const terminated=await admin.query('SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND backend_start=$2::timestamptz AND usename=$3 AND datname=$4',[identity.pid,identity.backend_start,role,'prospectpilot_test']);
   assert.equal(terminated.rows[0]?.terminated,true);
   await writer.end();writer=null;
   const denied=new pg.Client({...config,user:role,password});try{await assert.rejects(denied.connect(),{code:'28000'});}finally{await denied.end().catch(()=>{});}
   assert.equal((await admin.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1',[role])).rows[0].n,0);
   // Verify container refers to our exact random schema, not merely a similarly
   // named service/database. No backup or restore outside that schema is requested.
   const cluster=(await db.query("SELECT system_identifier::text || ':' || current_database() AS identity FROM pg_control_system()")).rows[0].identity;
   const containerCluster=await docker(process.env.SYNTHETIC_POSTGRES_CONTAINER,['psql',...dbArgs,'--no-psqlrc','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--command',"SELECT system_identifier::text || ':' || current_database() FROM pg_control_system()"]);
   assert.equal(containerCluster.toString().trim(),cluster,'Container is exact fixture cluster/database');
   const matching=await docker(process.env.SYNTHETIC_POSTGRES_CONTAINER,['psql',...dbArgs,'--no-psqlrc','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--command',`SELECT count(*) FROM "${db.schema}".prospectpilot_migrations`]);
   assert.equal(matching.toString().trim(),'29');
   archive=await docker(process.env.SYNTHETIC_POSTGRES_CONTAINER,['pg_dump',...dbArgs,'--format=custom','--schema='+db.schema]);
   assert.equal(archive.subarray(0,5).toString(),'PGDMP');
  }
  const before=await tableSnapshot(db),structure=await schemaSnapshot(db),catalog=await initialSchemaSnapshot(db);
  for(const failureAt of ['030','031','032','033','034']){
   const injected={connect:async()=>({query:async(sql,args)=>{const result=await db.query(sql,args);if(sql.startsWith('INSERT INTO prospectpilot_migrations')&&args?.[0]===failureAt)await db.query('SELECT * FROM deliberately_missing_initial034_relation');return result;},release(){}}),end:async()=>{}};
   await assert.rejects(migrate(injected),/deliberately_missing_initial034_relation/);
   assert.deepEqual(await tableSnapshot(db),before);assert.deepEqual(await schemaSnapshot(db),structure);assert.deepEqual(await initialSchemaSnapshot(db),catalog);
  }
  await migrate(db.pool);await migrate(db.pool);
  const migrated=await tableSnapshot(db);
  const retained=await tableSnapshot(db,Object.keys(before));retained.prospectpilot_migrations=retained.prospectpilot_migrations.filter(r=>r.id<='029');assert.deepEqual(retained,before);
  assert.equal(migrated.prospectpilot_migrations.length,34);await verifyKeys(db,fixture);
  // Guard admission only. No application callback/HTTP/worker is started, so no
  //034 traffic has been accepted. Actual entrypoint rehearsal is a separate gate.
  let admitted=0;
  if(backend==='postgres'){
   guardClient=new pg.Client({...config,options:'-c search_path='+db.schema,statement_timeout:15000,query_timeout:17000});
   guard=await startRollbackRuntime({client:guardClient,start:async()=>{admitted++;}});
  }else{
   let acquired=false;
   guard=await startRollbackRuntime({client:{connect:async()=>{},query:async(sql,args)=>{const r=await db.query(sql,args);if(sql.includes('pg_try_advisory_lock_shared'))acquired=true;return r;},end:async()=>{if(acquired)await db.query('SELECT pg_advisory_unlock_shared(505002)');}},start:async()=>{admitted++;}});
  }
  assert.equal(admitted,1);await guard.close();guard=null;
  assert.deepEqual(await tableSnapshot(db),migrated);
  const migratedCatalog=await initialSchemaSnapshot(db);
  const assertPreServiceAbort=async()=>{assert.deepEqual(await initialSchemaSnapshot(db),migratedCatalog,'Refuse backup restore if post-migration catalog changed');assert.deepEqual(await tableSnapshot(db),migrated,'Refuse backup restore if any post-migration row changed');};
  // Demonstrate refusal on a synthetic postbackup write, rolled back immediately.
  // This is a bounded fixture comparison, not a production writer detector.
  await db.query('BEGIN');try{
   await db.query("UPDATE prospect_contacts SET payload=payload || '{\"postbackup_fixture\":true}'::jsonb WHERE id=$1",[fixture.id]);
   await assert.rejects(assertPreServiceAbort(),/Refuse backup restore/);
  }finally{await db.query('ROLLBACK');}
  await assertPreServiceAbort();
  if(backend==='postgres'){
   await db.query(`DROP SCHEMA "${db.schema}" CASCADE`);
   // The archive was produced above with pg_dump --schema for this exact
   // random fixture only. A restore --schema filter excludes its SCHEMA TOC
   // entry and cannot recreate the dropped namespace. Restore the whole scoped
   // archive so namespace ownership and ACL entries are retained as well.
   await docker(process.env.SYNTHETIC_POSTGRES_CONTAINER,['pg_restore',...dbArgs,'--exit-on-error','--single-transaction'],archive);
   assert.deepEqual(await tableSnapshot(db),before);assert.deepEqual(await schemaSnapshot(db),structure);assert.deepEqual(await initialSchemaSnapshot(db),catalog);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM prospectpilot_migrations')).rows[0].n,29);
   assert.equal((await admin.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',[role])).rows[0].rolcanlogin,false,'Restore does not reopen synthetic writer');
   assert.equal((await db.query("SELECT has_schema_privilege($1,$2,'USAGE') AS allowed",[role,db.schema])).rows[0].allowed,false);
   // Historical application is invoked again ONLY after exact029 restoration.
   const oldApp=historical.createProspectWorkspace({pool:db.pool});
   assert.ok((await oldApp.search(owner)).contacts.some(c=>c.id===fixture.id));
   assert.deepEqual(await tableSnapshot(db),before,'Old application read leaves restored saved data unchanged');
   await verifyKeys(db,fixture);
   t.diagnostic('Native pg_dump/pg_restore: exact029 snapshot restored after quiesced034 guard admission; no034 app traffic accepted. Not general live034 rollback.');
  }else t.diagnostic('PGlite proves only fixture/migration/guard/refusal semantics; no native writer fencing or external backup/restore claimed.');
  assert.equal(network.attempts.length,0);
 }catch(error){primaryError=error;throw error;}finally{
  const cleanupFailures=[];
  const cleanup=async(label,action)=>{try{await action();}catch{cleanupFailures.push(label);}};
  await cleanup('guard',()=>guard?.close());
  await cleanup('writer',()=>writer?.end());
  await cleanup('fixture sessions',async()=>{if(admin&&roleCreated)await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND datname=$2',[role,'prospectpilot_test']);});
  await cleanup('fixture database',()=>db?.close());
  await cleanup('fixture role',async()=>{if(admin&&roleCreated)await admin.query(`DROP ROLE "${role}"`);});
  await cleanup('admin connection',()=>admin?.end());
  await cleanup('network guard',()=>network.restore());
  await cleanup('historical modules',()=>historical?.close());
  if(cleanupFailures.length){
   const message='Synthetic cleanup failed: '+cleanupFailures.join(', ');
   if(primaryError)t.diagnostic(message);else throw Error(message);
  }
 }
});
