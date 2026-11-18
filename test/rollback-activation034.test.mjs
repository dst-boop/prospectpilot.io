import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStagingDatabase} from './helpers/staging-database.mjs';
import {tableSnapshot,schemaSnapshot} from './helpers/full-upgrade.mjs';
import {migrate} from '../migrate.mjs';
import {startRollbackRuntime} from '../rollback-bootstrap.mjs';
const files=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
test('034 activation preserves every033 row, rolls back failed activation and only starts guard after complete schema', {timeout:60000}, async()=>{
 const db=await createStagingDatabase();let guard,exclusive=false;
 try{
  const deadline=Date.now()+15000;
  do{exclusive=(await db.query('SELECT pg_try_advisory_lock(505002) AS locked')).rows[0].locked;if(exclusive)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
  assert.equal(exclusive,true,'Bounded cooperating migration lock');
  assert.equal(files.length,34);
  for(const file of files.slice(0,33))await db.query(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  await db.query('CREATE TABLE prospectpilot_migrations(id text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  await db.query("INSERT INTO prospectpilot_migrations(id) SELECT lpad(n::text,3,'0') FROM generate_series(1,33)n");
  await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES('activation-lead','synthetic','owner','owner@example.test','{}')");
  await db.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('activation-lead','owner','planning_decision','{\"value\":{\"topic\":\"retirement_income\",\"origin\":\"inbound_request\"}}')");
  await db.query("INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES('activation-contact','owner','{\"first_name\":\"Synthetic\",\"direct_phone_dnc\":true}','[]')");
  const before=await tableSnapshot(db),schemaBefore=await schemaSnapshot(db);
  let started=0;
  const client=()=>({connect:async()=>{},query:(sql,args)=>db.query(sql,args),end:async()=>{await db.query('SELECT pg_advisory_unlock_shared(505002)');}});
  await assert.rejects(startRollbackRuntime({client:client(),start:async()=>{started++;}}),/verification refused/);
  assert.equal(started,0);assert.deepEqual(await tableSnapshot(db),before);
  const failedPool={connect:async()=>({query:async(sql,args)=>{const result=await db.query(sql,args);if(sql.startsWith('INSERT INTO prospectpilot_migrations')&&args?.[0]==='034')throw Error('synthetic failure after034');return result;},release(){}}),end:async()=>{}};
  await assert.rejects(migrate(failedPool),/synthetic failure after034/);
  assert.deepEqual(await tableSnapshot(db),before);assert.deepEqual(await schemaSnapshot(db),schemaBefore);
  await migrate(db.pool);await migrate(db.pool);
  const after=await tableSnapshot(db,Object.keys(before));after.prospectpilot_migrations=after.prospectpilot_migrations.filter(r=>r.id!=='034');
  assert.deepEqual(after,before,'All033 data, observations, timestamps and keys preserved');
  for(const table of ['prospect_identity_evidence','prospect_historical_identifiers','prospect_historical_reviews'])assert.equal((await db.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n,0,'No invented historical evidence');
  const complete=await tableSnapshot(db);
  guard=await startRollbackRuntime({client:client(),start:async()=>{started++;}});
  assert.equal(started,1);assert.deepEqual(await tableSnapshot(db),complete,'Successful guard does not write/migrate');
 }finally{await guard?.close();if(exclusive)await db.query('SELECT pg_advisory_unlock(505002)');await db.close();}
});
