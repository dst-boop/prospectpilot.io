import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createStagingDatabase} from './helpers/staging-database.mjs';
import {tableSnapshot} from './helpers/full-upgrade.mjs';
import {migrate} from '../migrate.mjs';
import {verifyRollbackSchema,inspectRollbackSchema,normalizeSchemaQualification} from '../rollback-schema.mjs';
async function fixture(run){const db=await createStagingDatabase();try{await migrate(db.pool);await run(db);}finally{await db.close();}}

test('rollback033 catalog contract matches fresh schema with read-only inspection and no data changes',async()=>fixture(async db=>{
 await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES('schema-fixture','synthetic','owner','owner@example.test','{}')");
 // Emit only the first differing synthetic catalog row, not a whole manifest,
 // so a native/PGlite portability failure gives actionable evidence in CI logs.
 const expected=JSON.parse(readFileSync(new URL('../scripts/rollback-schema033.json',import.meta.url),'utf8'));
 const actual=await inspectRollbackSchema(db);
 for(const [section,rows] of Object.entries(expected.sections)){
  const observed=actual.sections[section];
  const index=Array.from({length:Math.max(rows.length,observed.length)},(_,i)=>i).find(i=>JSON.stringify(rows[i])!==JSON.stringify(observed[i]));
  if(index!==undefined){
   // Disposable fixture catalog only: no table contents, credentials or raw
   // connection settings. Application-schema qualification is canonicalized.
   writeFileSync('/tmp/rollback-schema-actual.json',JSON.stringify(actual,null,2)+'\n');
   assert.deepEqual(observed[index],rows[index],`Synthetic schema first difference: ${section}[${index}]; actual length ${observed.length}, expected length ${rows.length}`);
  }
 }
 const before=await tableSnapshot(db);const statements=[];
 const readOnly={query(sql,args){assert.match(sql,/^SELECT /);statements.push(sql);return db.query(sql,args);}};
 assert.equal((await verifyRollbackSchema(readOnly)).compatible,true);
 assert.deepEqual(await tableSnapshot(db),before);assert.equal(statements.length,11);
 assert.match(statements[0],/current_schemas\(false\)::text\[\]/,'node-postgres needs text[] rather than unparsed name[]');
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


test('PostgreSQL18 NOT VALID not-null remains distinguishable from validated protection',async t=>fixture(async db=>{
 const version=(await db.query("SELECT current_setting('server_version_num')::int AS version")).rows[0].version;
 if(version<180000){t.skip('Native NOT VALID not-null constraints require PostgreSQL18');return;}
 await db.query('BEGIN');
 try{
  await db.query('ALTER TABLE discovery_leads ALTER COLUMN payload DROP NOT NULL');
  await db.query('ALTER TABLE discovery_leads ADD CONSTRAINT rollback_unvalidated_not_null NOT NULL payload NOT VALID');
  const actual=await inspectRollbackSchema(db),column=actual.sections.columns.find(c=>c.relation==='discovery_leads'&&c.name==='payload');
  assert.equal(column.not_null,true);assert.equal(column.not_null_validated,false);
  assert.ok(actual.sections.constraints.every(c=>c.type!=='n'),'Version-specific NOT NULL names are represented by canonical column flags');
  await assert.rejects(verifyRollbackSchema(db),error=>error.cause?.message==='Rollback schema mismatch: columns');
  await db.query('ALTER TABLE discovery_leads VALIDATE CONSTRAINT rollback_unvalidated_not_null');
  assert.equal((await verifyRollbackSchema(db)).compatible,true,'A validated renamed NOT NULL has the same column protection');
 }finally{await db.query('ROLLBACK');}
}));

test('PostgreSQL18 unenforced CHECK and foreign key cannot match the enforced033 contract',async t=>fixture(async db=>{
 const version=(await db.query("SELECT current_setting('server_version_num')::int AS version")).rows[0].version;
 if(version<180000){t.skip('NOT ENFORCED constraints require PostgreSQL18');return;}
 for(const name of ['lab_observations_field_check','lab_observations_lead_id_fkey']){
  await db.query('BEGIN');
  try{
   const original=(await inspectRollbackSchema(db)).sections.constraints.find(c=>c.relation==='lab_observations'&&c.name===name).definition;
   await db.query('ALTER TABLE lab_observations DROP CONSTRAINT '+name);
   await db.query('ALTER TABLE lab_observations ADD CONSTRAINT '+name+' '+original+' NOT ENFORCED');
   const actual=await inspectRollbackSchema(db),constraint=actual.sections.constraints.find(c=>c.relation==='lab_observations'&&c.name===name);
   assert.match(constraint.definition,/NOT ENFORCED/,'Deparsed definition retains enforcement semantics');
   await assert.rejects(verifyRollbackSchema(db),error=>error.cause?.message==='Rollback schema mismatch: constraints');
  }finally{await db.query('ROLLBACK');}
  assert.equal((await verifyRollbackSchema(db)).compatible,true);
 }
}));
