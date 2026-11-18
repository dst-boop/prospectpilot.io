import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingDatabase} from './helpers/staging-database.mjs';
import {tableSnapshot} from './helpers/full-upgrade.mjs';
import {migrate} from '../migrate.mjs';
import {verifyRollbackSchema,normalizeSchemaQualification} from '../rollback-schema.mjs';
async function fixture(run){const db=await createStagingDatabase();try{await migrate(db.pool);await run(db);}finally{await db.close();}}

test('rollback033 catalog contract matches fresh schema with read-only inspection and no data changes',async()=>fixture(async db=>{
 await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES('schema-fixture','synthetic','owner','owner@example.test','{}')");
 const before=await tableSnapshot(db);const statements=[];
 const readOnly={query(sql,args){assert.match(sql,/^SELECT /);statements.push(sql);return db.query(sql,args);}};
 assert.equal((await verifyRollbackSchema(readOnly)).compatible,true);
 assert.deepEqual(await tableSnapshot(db),before);assert.equal(statements.length,11);
}));

test('rollback033 refuses column, constraint, index, trigger, function, row-security and extra-object drift',async()=>fixture(async db=>{
 const alterations=[
  'ALTER TABLE discovery_leads ALTER COLUMN owner_user_id TYPE varchar(200)',
  'ALTER TABLE discovery_leads ALTER COLUMN owner_user_id SET DEFAULT \'someone-else\'',
  'ALTER TABLE discovery_leads ALTER COLUMN payload DROP NOT NULL',
  'ALTER TABLE lab_observations DROP CONSTRAINT lab_observations_field_check',
  'DROP INDEX prospect_charges_lead',
  'ALTER TABLE lab_run_leads DISABLE TRIGGER lab_run_leads_acquired',
  'ALTER TABLE lab_run_leads DISABLE TRIGGER ALL',
  "CREATE OR REPLACE FUNCTION record_lab_acquisition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$",
  'ALTER TABLE discovery_leads ENABLE ROW LEVEL SECURITY',
  'CREATE POLICY permissive_read ON discovery_leads FOR SELECT USING (true)',
  'CREATE TABLE unexpected_rollback_table(id text)',
  "DELETE FROM prospectpilot_migrations WHERE id='033'",
 ];
 for(const sql of alterations){
  await db.query('BEGIN');try{await db.query(sql);await assert.rejects(verifyRollbackSchema(db),/refused startup/,sql);}finally{await db.query('ROLLBACK');}
  assert.equal((await verifyRollbackSchema(db)).compatible,true,'fixture restored after '+sql);
 }
}));

for(const count of [0,29,30,31,32,34])test('rollback schema refuses incompatible migration ledger '+count,async()=>{
 let calls=0;await assert.rejects(verifyRollbackSchema({query:async(sql)=>{calls++;return {rows:sql.includes('current_schema()')?[{schema:'public',schemas:['public']}]:Array.from({length:count},(_,i)=>({id:String(i+1).padStart(3,'0')}))};}}),/refused startup/);assert.equal(calls,2);
});
test('rollback schema fails closed on inspection errors and ambiguous search paths',async()=>{
 await assert.rejects(verifyRollbackSchema({query:async()=>{throw Error('no database');}}),/refused startup/);
 await assert.rejects(verifyRollbackSchema({query:async()=>({rows:[{schema:'public',schemas:['public','other']}]})}),/refused startup/);
});
test('normalization changes only qualified schema identifiers, not string values or function bodies',()=>{
 const sql=`ON "fixture".records WHERE note = 'fixture.records' AND body = $$fixture.records$$`;
 assert.equal(normalizeSchemaQualification(sql,'fixture'),`ON __rollback_schema__.records WHERE note = 'fixture.records' AND body = $$fixture.records$$`);
 assert.equal(normalizeSchemaQualification("fixture.records AND fixture_other.records",'fixture'),"__rollback_schema__.records AND fixture_other.records");
 const escaped=String.raw`E'can\'t fixture.records'`;assert.equal(normalizeSchemaQualification(escaped,'fixture'),escaped);
});
