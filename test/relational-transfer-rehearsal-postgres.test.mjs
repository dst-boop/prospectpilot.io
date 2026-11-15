import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createReassignmentExecutionService,fingerprintReassignmentSnapshot} from '../advisor-reassignment-execution.mjs';
import {prepareRelationalRehearsal,relationalRehearsalAdapter,scope} from './fixtures/relational-transfer-rehearsal.mjs';
// Opt-in disposable synthetic schema only, never DATABASE_URL.
test('native relational transfer blocks competing writer and reconciles concurrent same-key request',{skip:!process.env.POSTGRES_TEST_URL,timeout:60000},async()=>{
 const schema='pp_relational_rehearsal_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1});let pool,setup,first,second,unblock,arrive;
 const gate=new Promise(r=>{unblock=r;}),reached=new Promise(r=>{arrive=r;});
 try{
 await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:4,options:`-c search_path=${schema},public`});
 setup=await pool.connect();await prepareRelationalRehearsal({query:(s,v)=>setup.query(s,v),exec:async s=>{const r=await setup.query(s);return Array.isArray(r)?r:[r];}});
 const preview=relationalRehearsalAdapter();await setup.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');const snapshot=await preview.loadAndLockSnapshot(setup,scope,{phase:'before'});await setup.query('ROLLBACK');setup.release();setup=null;
 const request={...scope,idempotencyKey:'native-one',expectedFingerprint:fingerprintReassignmentSnapshot(snapshot,scope)};
 first=createReassignmentExecutionService({pool,adapter:relationalRehearsalAdapter({beforeCas:async()=>{arrive();await gate;}})})(request);
 await Promise.race([reached,first.then(()=>{throw Error('CAS gate skipped');})]);
 const writer=await pool.connect();try{await writer.query('BEGIN');await writer.query("SET LOCAL lock_timeout='100ms'");await assert.rejects(writer.query("UPDATE prospect_contacts SET payload='{}' WHERE id='contact'"),{code:'55P03'});await writer.query('ROLLBACK');}finally{writer.release();}
 second=createReassignmentExecutionService({pool,adapter:relationalRehearsalAdapter()})(request);unblock();
 const results=await Promise.allSettled([first,second]);assert.equal(results[0].status,'fulfilled');if(results[1].status==='rejected')assert.equal(results[1].reason.status,409);else assert.equal(results[1].value.replayed,true);
 const replay=await createReassignmentExecutionService({pool,adapter:relationalRehearsalAdapter()})(request);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,results[0].value.receipt);
 assert.equal((await pool.query('SELECT count(*)::int n FROM firm_transfer_receipts')).rows[0].n,1);
 }finally{unblock();await Promise.allSettled([first,second].filter(Boolean));if(setup){await setup.query('ROLLBACK').catch(()=>{});setup.release();}if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
