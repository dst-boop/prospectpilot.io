import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createReassignmentExecutionService,fingerprintReassignmentSnapshot} from '../advisor-reassignment-execution.mjs';
import {pglitePool} from './fixtures/reassignment-execution-fixture.mjs';
import {prepareRelationalRehearsal,relationalRehearsalAdapter,scope} from './fixtures/relational-transfer-rehearsal.mjs';
async function fixture(options={}){
 const db=new PGlite();await prepareRelationalRehearsal(db);
 const adapter=relationalRehearsalAdapter(options);const pool=pglitePool(db,options);
 const client=await pool.connect();await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
 const snapshot=await adapter.loadAndLockSnapshot(client,scope,{phase:'before'});await client.query('ROLLBACK');client.release();
 const request={...scope,idempotencyKey:'synthetic-one',expectedFingerprint:fingerprintReassignmentSnapshot(snapshot,scope)};
 return {db,request,run:createReassignmentExecutionService({pool,adapter})};
}
const tables=['prospect_contacts','prospect_lists','discovery_leads','firm_contact_assignments','firm_list_assignments','firm_lead_assignments','firm_transfer_rights','synthetic_transfer_scope','synthetic_transfer_manifests'];
const state=async db=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,(await db.query(`SELECT to_jsonb(t) AS row FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row)])));
const owners=async db=>(await db.query("SELECT user_id FROM prospect_contacts WHERE id='contact'")).rows[0].user_id;
test('relational authority + CAS + append-only audit changes only owners and versions; replay identical',async()=>{
 const f=await fixture();try{
 const before=await state(f.db);const result=await f.run(f.request);assert.equal(result.receipt.recordCount,3);assert.equal(await owners(f.db),'target');
 assert.equal((await f.db.query("SELECT user_id FROM prospect_contacts WHERE id='unassigned'")).rows[0].user_id,'source');
 const after=await state(f.db);
 for(const [table,key,owner]of [['prospect_contacts','contact','user_id'],['prospect_lists','list','user_id'],['discovery_leads','lead','owner_user_id']]){const old=before[table].find(r=>r.id===key),now=after[table].find(r=>r.id===key);assert.equal(now[owner],'target');assert.deepEqual({...now,[owner]:old[owner]},old);}
 for(const table of ['firm_contact_assignments','firm_list_assignments','firm_lead_assignments']){assert.equal(after[table][0].advisor_uid,'target');assert.equal(Number(after[table][0].version),Number(before[table][0].version)+1);assert.deepEqual({...after[table][0],advisor_uid:before[table][0].advisor_uid,version:before[table][0].version},before[table][0]);}
 assert.deepEqual(after.synthetic_transfer_manifests,before.synthetic_transfer_manifests);assert.deepEqual(after.firm_transfer_rights,before.firm_transfer_rights);
 const replay=await f.run(f.request);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt);
 await assert.rejects(f.run({...f.request,idempotencyKey:'different'}),{status:409});
 assert.equal((await f.db.query('SELECT count(*)::int n FROM firm_transfer_receipts')).rows[0].n,1);
 }finally{await f.db.close();}
});
for(const [label,options]of[
 ['audit failure',{auditFailure:true}],
 ['payload mutation',{afterCas:c=>c.query("UPDATE prospect_contacts SET payload='{}' WHERE id='contact'")}],
 ['protected history mutation',{afterCas:c=>c.query("UPDATE synthetic_transfer_manifests SET payload='[]' WHERE category='privacy'")}],
 ['missing manifest',{afterCas:c=>c.query("DELETE FROM synthetic_transfer_manifests WHERE category='costs'")}],
 ['stale rights',{beforeCas:c=>c.query("UPDATE firm_transfer_rights SET decision='denied' WHERE record_kind='contact'")}],
 ['stale assignment',{beforeCas:c=>c.query("UPDATE firm_contact_assignments SET rights_reference='changed' WHERE contact_id='contact'")}]
])test('atomic rollback on '+label,async()=>{const f=await fixture(options);try{const before=await state(f.db);await assert.rejects(f.run(f.request));assert.deepEqual(await state(f.db),before);assert.equal(await owners(f.db),'source');assert.equal((await f.db.query('SELECT count(*)::int n FROM firm_transfer_receipts')).rows[0].n,0);}finally{await f.db.close();}});
test('lost commit response reconciles original key without duplicate transfer',async()=>{
 const f=await fixture({commitLost:true});try{await assert.rejects(f.run(f.request),{code:'reassignment_outcome_unknown'});assert.equal(await owners(f.db),'target');
 const run=createReassignmentExecutionService({pool:pglitePool(f.db),adapter:relationalRehearsalAdapter()});assert.equal((await run(f.request)).replayed,true);
 }finally{await f.db.close();}
});
test('revoked authority blocks replay and foreign tenant cannot read receipts',async()=>{
 const f=await fixture();try{await f.run(f.request);await assert.rejects(f.run({...f.request,firmId:'firm-b'}),{status:403});await f.db.query("UPDATE firm_members SET status='suspended' WHERE user_id='boss'");await assert.rejects(f.run(f.request),{status:403});}finally{await f.db.close();}
});
