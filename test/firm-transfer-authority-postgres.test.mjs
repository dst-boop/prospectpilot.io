import test from'node:test';
import assert from'node:assert/strict';
import {randomUUID}from'node:crypto';
import pg from'pg';
import {createFirmTransferAuthority}from'../firm-transfer-authority.mjs';
import {scope,records,prepareAuthorityFixture}from'./fixtures/firm-transfer-authority-fixture.mjs';
// Never use DATABASE_URL. Opt-in, disposable schema only.
test('native PG authority locks prevent racing membership, rights and legacy ownership writes',{skip:!process.env.POSTGRES_TEST_URL,timeout:60000},async()=>{
 const schema='pp_transfer_authority_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1});
 let pool,a,b;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:3,options:`-c search_path=${schema},public`});
  const setup=await pool.connect();
  try { await prepareAuthorityFixture({query:(s,v)=>setup.query(s,v),exec:async s=>{const r=await setup.query(s);return Array.isArray(r)?r:[r];}}); } finally {setup.release();}
  a=await pool.connect();b=await pool.connect();
  const authority=createFirmTransferAuthority({firmId:'firm-a'});
  await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');await authority.authorizeAndLock(a,scope);await authority.loadAndLockRights(a,scope,records);
  for(const sql of ["UPDATE firm_members SET status='suspended' WHERE firm_id='firm-a' AND user_id='boss'", "UPDATE firm_transfer_rights SET decision='denied' WHERE record_kind='contact'", "UPDATE prospect_contacts SET user_id='target' WHERE id='contact'"]) {
   await b.query('BEGIN');await b.query("SET LOCAL lock_timeout='100ms'");await assert.rejects(b.query(sql),{code:'55P03'});await b.query('ROLLBACK');
  }
  await a.query('ROLLBACK');
  await b.query("UPDATE firm_transfer_rights SET decision='denied' WHERE record_kind='contact'");
  await a.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');await authority.authorizeAndLock(a,scope);await assert.rejects(authority.loadAndLockRights(a,scope,records),{status:409});await a.query('ROLLBACK');
  await assert.rejects(authority.findReceipt(a,{firmId:'firm-a',actorUid:'boss',idempotencyKey:'one'}),{status:403});
 }finally{
  for(const c of [a,b])if(c){await c.query('ROLLBACK').catch(()=>{});c.release();}
  if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
 }
});
