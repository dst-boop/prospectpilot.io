import test,{before,after,beforeEach,afterEach}from'node:test';
import assert from'node:assert/strict';
import {PGlite}from'@electric-sql/pglite';
import {readFileSync}from'node:fs';
import {createFirmTransferAuthority}from'../firm-transfer-authority.mjs';
import {scope,records,prepareAuthorityFixture}from'./fixtures/firm-transfer-authority-fixture.mjs';
import {createReassignmentExecutionService}from'../advisor-reassignment-execution.mjs';
let db,client,queries,authority;
before(async()=>{db=new PGlite();await prepareAuthorityFixture(db);});after(async()=>db.close());
beforeEach(async()=>{await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');queries=[];client={query:async(s,v)=>{queries.push(s);return db.query(s,v);}};authority=createFirmTransferAuthority({firmId:'firm-a'});});
afterEach(async()=>db.exec('ROLLBACK'));
const key={firmId:'firm-a',actorUid:'boss',idempotencyKey:'one'};
const receipt={version:'advisor-reassignment-execution-1',status:'applied',...scope,idempotencyKey:'one',transferId:'synthetic-transfer',requestHash:'c'.repeat(64),beforeFingerprint:'d'.repeat(64),afterFingerprint:'e'.repeat(64),preservedFingerprint:'f'.repeat(64),recordCount:3,changes:records.map(r=>({...r,beforeVersion:'1',afterVersion:'2'})),recordedAt:'2026-11-15T12:00:00.000Z'};
test('authority uses stored members, fences and parameterized exact record rights',async()=>{
 const grant=await authority.authorizeAndLock(client,scope);assert.equal(grant.approved,true);
 const rights=await authority.loadAndLockRights(client,scope,records);assert.equal(rights.length,3);
 assert.ok(rights.every(r=>/^[a-f0-9-]{36}:1$/.test(r.assignmentVersion)&&/^[a-f0-9-]{36}:1$/.test(r.rights.version)));assert.doesNotMatch(JSON.stringify(rights),/private|example|synthetic/);
 assert.equal(await authority.findReceipt(client,key),null);
 assert.ok(queries[0].includes('transaction_isolation'));assert.ok(queries.some(s=>s.includes('FOR UPDATE OF a,r')));
});
test('metadata ports alone cannot configure the ownership execution service',()=>{
 assert.throws(()=>createReassignmentExecutionService({pool:{connect(){}},adapter:authority}),{status:503});
});
for(const request of [{...scope,firmId:'firm-b'},{...scope,actorUid:'target'},{...scope,targetUid:'target-b'},{...scope,sourceUid:'source-b'}])test('denies cross-scope '+JSON.stringify(request),async()=>{
 await assert.rejects(authority.authorizeAndLock(client,request),{status:403});assert.ok(!queries.some(s=>s.includes('firm_transfer_receipts')));
});
for(const [label,sql]of[
 ['suspended firm',"UPDATE firm_workspaces SET status='suspended' WHERE id='firm-a'"],
 ['revoked supervisor',"UPDATE firm_members SET role='advisor' WHERE user_id='boss'"],
 ['active source',"UPDATE firm_members SET status='active' WHERE user_id='source'"],
 ['departed target',"UPDATE firm_members SET status='departed' WHERE user_id='target'"],
 ['expired fence',"UPDATE firm_transfer_fences SET expires_at=now()-interval '1 second'"],
 ['unrevoked session',"UPDATE firm_transfer_fences SET sessions_revoked=false"],
 ['unfenced worker',"UPDATE firm_transfer_fences SET workers_fenced=false"],
 ['unverified target',"UPDATE firm_transfer_fences SET target_email_verified=false"]])test('fails closed: '+label,async()=>{
 await db.query(sql);await assert.rejects(authority.authorizeAndLock(client,scope));
});
for(const [label,sql]of[
 ['denied rights',"UPDATE firm_transfer_rights SET decision='denied' WHERE record_kind='contact'"],
 ['unreviewed rights',"UPDATE firm_transfer_rights SET decision='review' WHERE record_kind='contact'"],
 ['expired rights',"UPDATE firm_transfer_rights SET expires_at=now()-interval '1 second' WHERE record_kind='contact'"],
 ['mismatched legacy owner',"UPDATE prospect_contacts SET user_id='target' WHERE id='contact'"],
 ['missing explicit assignment',"DELETE FROM firm_contact_assignments WHERE contact_id='contact'"]])test('record rights fail closed: '+label,async()=>{
 await authority.authorizeAndLock(client,scope);await db.query(sql);await assert.rejects(authority.loadAndLockRights(client,scope,records),{status:409});
});
test('unassigned private UID inventory is not firm property',async()=>{
 await authority.authorizeAndLock(client,scope);await assert.rejects(authority.loadAndLockRights(client,scope,[{kind:'contact',id:'unassigned'}]),{status:409});
});
test('ports require the same authorized transaction and client',async()=>{
 await assert.rejects(authority.findReceipt(client,key),{status:403});await authority.authorizeAndLock(client,scope);
 await assert.rejects(authority.findReceipt({query:client.query},key),{status:403});
 await db.exec('ROLLBACK;BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');await assert.rejects(authority.findReceipt(client,key),{status:403});
});
test('failed reauthorization clears earlier grant',async()=>{
 await authority.authorizeAndLock(client,scope);await assert.rejects(authority.authorizeAndLock(client,{...scope,actorUid:'target'}));await assert.rejects(authority.findReceipt(client,key),{status:403});
});
test('read committed transaction is not accepted',async()=>{
 await db.exec('ROLLBACK;BEGIN');await assert.rejects(authority.authorizeAndLock(client,scope),{status:409});
});
test('scope versions increment even if caller attempts to hold version constant',async()=>{
 await db.query("UPDATE firm_members SET label='Updated',version=1 WHERE firm_id='firm-a' AND user_id='boss'");
 assert.equal(String((await db.query("SELECT version FROM firm_members WHERE firm_id='firm-a' AND user_id='boss'")).rows[0].version),'2');
 await db.query("UPDATE firm_transfer_rights SET decision='review',version=1 WHERE record_kind='contact'");
 assert.equal(String((await db.query("SELECT version FROM firm_transfer_rights WHERE record_kind='contact'")).rows[0].version),'2');
});
test('receipt audit is scoped, append-only and unique',async()=>{
 await authority.authorizeAndLock(client,scope);assert.equal(await authority.insertReceipt(client,receipt),1);assert.deepEqual(await authority.findReceipt(client,key),receipt);
 await assert.rejects(authority.findReceipt(client,{...key,firmId:'firm-b'}),{status:403});
 for(const sql of ['UPDATE firm_transfer_receipts SET receipt=receipt','DELETE FROM firm_transfer_receipts','TRUNCATE firm_transfer_receipts']) {
 await db.query('SAVEPOINT immutable');await assert.rejects(db.query(sql),{code:'55000'});await db.query('ROLLBACK TO SAVEPOINT immutable');
 }
 await db.query('SAVEPOINT duplicate');await assert.rejects(authority.insertReceipt(client,receipt),{code:'23505'});await db.query('ROLLBACK TO SAVEPOINT duplicate');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM firm_transfer_receipts')).rows[0].n,1);
});
test('a rolled-back assignment update and receipt leave no partial change',async()=>{
 await authority.authorizeAndLock(client,scope);await authority.loadAndLockRights(client,scope,records);
 await db.query('SAVEPOINT atomic');await db.query("UPDATE firm_contact_assignments SET advisor_uid='target' WHERE contact_id='contact'");await authority.insertReceipt(client,receipt);
 await db.query('ROLLBACK TO SAVEPOINT atomic');assert.equal(await authority.findReceipt(client,key),null);
 assert.equal((await db.query("SELECT advisor_uid FROM firm_contact_assignments WHERE contact_id='contact'")).rows[0].advisor_uid,'source');
});
test('draft remains absent from production routes and migration list',()=>{
 for(const file of ['server.mjs','handler.mjs','migrate.mjs','Dockerfile'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/firm-transfer-authority/);
});

test('receipt storage refuses extra private payload and incomplete audit shape',async()=>{
 await authority.authorizeAndLock(client,scope);
 for(const r of [{...receipt,privateEmail:'do-not-store@example.test'},{...receipt,recordCount:4},{...receipt,requestHash:'bad'},{...receipt,changes:[]}])await assert.rejects(authority.insertReceipt(client,r),{status:409});
 assert.equal(await authority.findReceipt(client,key),null);
});

test('savepoint rollback cannot resurrect a stale authorization',async()=>{
 await db.query('SAVEPOINT before_auth');await authority.authorizeAndLock(client,scope);await db.query('ROLLBACK TO SAVEPOINT before_auth');
 await db.query("UPDATE firm_members SET role='advisor' WHERE firm_id='firm-a' AND user_id='boss'");
 await assert.rejects(authority.findReceipt(client,key),{status:403});
});
test('SQL receipt identity nulls cannot evade checks',async()=>{
 await assert.rejects(db.query('INSERT INTO firm_transfer_receipts(firm_id,actor_uid,idempotency_key,receipt)VALUES($1,$2,$3,$4)',['firm-a','boss','null-test',{firmId:null,actorUid:null,idempotencyKey:null}]),{code:'23514'});
});
test('delete/reinsert rights gets a new incarnation and cannot reuse old version',async()=>{
 await authority.authorizeAndLock(client,scope);const before=await authority.loadAndLockRights(client,scope,records);
 await db.query("DELETE FROM firm_transfer_rights WHERE record_kind='contact'");
 await db.query("INSERT INTO firm_transfer_rights(firm_id,record_kind,record_id,source_uid,target_uid,decision,reference_digest,reviewed_by,expires_at)VALUES('firm-a','contact','contact','source','target','allowed',repeat('b',64),'boss',now()+interval '1 hour')");
 const after=await authority.loadAndLockRights(client,scope,records);
 assert.notEqual(before.find(r=>r.kind==='contact').rights.version,after.find(r=>r.kind==='contact').rights.version);
});

test('copy-reinsert cannot preserve caller-supplied incarnation or counter',async()=>{
 const old=(await db.query("SELECT * FROM firm_transfer_rights WHERE record_kind='contact'")).rows[0];
 await db.query("DELETE FROM firm_transfer_rights WHERE record_kind='contact'");
 await db.query("INSERT INTO firm_transfer_rights(firm_id,record_kind,record_id,source_uid,target_uid,decision,reference_digest,reviewed_by,expires_at,incarnation,version) VALUES('firm-a','contact','contact','source','target','allowed',repeat('b',64),'boss',now()+interval '1 hour',$1,$2)",[old.incarnation,old.version]);
 const current=(await db.query("SELECT incarnation,version FROM firm_transfer_rights WHERE record_kind='contact'")).rows[0];assert.notEqual(current.incarnation,old.incarnation);assert.equal(String(current.version),'1');
});
