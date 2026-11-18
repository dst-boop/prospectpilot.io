import test from 'node:test';
import assert from 'node:assert/strict';
import {startRollbackRuntime} from '../rollback-bootstrap.mjs';
import {createStagingDatabase} from './helpers/staging-database.mjs';
import {historicalModules,baselineCommit,tableSnapshot,schemaSnapshot} from './helpers/full-upgrade.mjs';

test('actual historical029 refuses rollback application startup and retains saved data',{timeout:60000,skip:process.env.ROLLBACK_HISTORY_FREE_IMAGE_BUILD==='1'?'Pinned historical029 fixture runs in full-checkout native CI; image context has no git/history':false},async()=>{
 const db=await createStagingDatabase();let historical,exclusive=false,shared=false,ended=0,started=0;
 try{
  historical=await historicalModules(baselineCommit);
  await historical.migrate(db.pool);
  const expected=Array.from({length:29},(_,i)=>String(i+1).padStart(3,'0'));
  assert.deepEqual((await db.query('SELECT id FROM prospectpilot_migrations ORDER BY id')).rows.map(r=>r.id),expected);
  await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES('rollback029-fixture','synthetic','rollback-owner','owner@example.test',$1)",[JSON.stringify({first_name:'Synthetic',last_name:'Historical',qualification:{status:'unverified'}})]);
  await db.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('rollback029-fixture','rollback-owner','residence',$1)",[JSON.stringify({source:'Synthetic saved evidence',verdict:'confirmed',value:{country:'US',scope:'residence'}})]);
  const before=await tableSnapshot(db),schemaBefore=await schemaSnapshot(db);
  await assert.rejects(db.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('rollback029-fixture','rollback-owner','planning_decision',$1)",[JSON.stringify({source:'Synthetic inadmissible decision',value:{topic:'retirement_income',origin:'inbound_request'}})]),{code:'23514'},'Actual029 CHECK cannot represent planning_decision');
  assert.deepEqual(await tableSnapshot(db),before,'Rejected decision does not alter saved rows');

  // Reserve the cooperating migration lock on this fixture session first. This
  // prevents another parallel test's migration from turning the expected schema
  // refusal into a busy-lock refusal. Session locks are reentrant on PostgreSQL.
  const deadline=Date.now()+15000;
  do{exclusive=(await db.query('SELECT pg_try_advisory_lock(505002) AS locked')).rows[0].locked;if(exclusive)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()<deadline);
  assert.equal(exclusive,true,'Cooperating migration lock available within bounded wait');
  const statements=[];
  // The fixture owns its connection. Model guard end by releasing only its
  // shared lock, so the same isolated schema remains available for snapshots.
  const client={connect:async()=>{},query:async(sql,args)=>{
   statements.push(sql);const result=await db.query(sql,args);
   if(sql==='SELECT pg_try_advisory_lock_shared(505002) AS locked')shared=result.rows[0]?.locked===true;
   return result;
  },end:async()=>{ended++;if(shared){await db.query('SELECT pg_advisory_unlock_shared(505002)');shared=false;}}};
  await assert.rejects(startRollbackRuntime({client,start:async()=>{started++;}}),error=>{
   assert.equal(error.message,'Rollback schema verification refused startup');
   assert.match(error.cause?.message||'',/ledger must be exactly001 through033/);
   return true;
  });
  assert.equal(started,0,'Real application callback is never entered');
  assert.equal(ended,1,'Rejected guard releases its connection ownership once');
  assert.equal(shared,false,'Guard shared lock is released');
  assert.equal(statements[0],'SELECT pg_try_advisory_lock_shared(505002) AS locked');
  assert.ok(statements.includes('SELECT id FROM prospectpilot_migrations ORDER BY id'));
  assert.ok(statements.every(sql=>sql.startsWith('SELECT ')),'Startup inspection never migrates or writes');
  assert.deepEqual(await tableSnapshot(db),before,'Refusal preserves every table, including observations and qualification payload');
  assert.deepEqual(await schemaSnapshot(db),schemaBefore,'Refusal preserves029 schema and constraints');
 }finally{
  if(shared)await db.query('SELECT pg_advisory_unlock_shared(505002)').catch(()=>{});
  if(exclusive)await db.query('SELECT pg_advisory_unlock(505002)').catch(()=>{});
  await historical?.close();await db.close();
 }
});
