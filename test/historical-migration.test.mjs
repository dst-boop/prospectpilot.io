import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOwnershipTestDatabase} from './ownership-test-database.mjs';
import {migrate} from '../migrate.mjs';
const files=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
test('034 upgrade rolls back atomically on failure, preserves existing data and reruns safely',async()=>{
 const db=await createOwnershipTestDatabase();try{
  for(const f of files.slice(0,33))await db.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
  await db.exec('CREATE TABLE prospectpilot_migrations(id text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  await db.query("INSERT INTO prospectpilot_migrations(id) SELECT lpad(n::text,3,'0') FROM generate_series(1,33)n");
  await db.query("INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES('existing','owner','{\"first_name\":\"Existing\"}','[]')");
  const before=(await db.query("SELECT * FROM prospect_contacts WHERE id='existing'")).rows;
  const pool=fail=>({connect:async()=>({query:async(sql,args)=>{if(fail&&sql.startsWith('INSERT INTO prospectpilot_migrations')&&args?.[0]==='034')throw Error('synthetic migration failure');return sql.includes(';')?(await db.exec(sql)):db.query(sql,args);},release(){}}),end:async()=>{}});
  await assert.rejects(migrate(pool(true)),/synthetic migration failure/);
  assert.equal((await db.query("SELECT to_regclass('prospect_identity_evidence') AS t")).rows[0].t,null);
  assert.deepEqual((await db.query("SELECT * FROM prospect_contacts WHERE id='existing'")).rows,before);
  await migrate(pool(false));await migrate(pool(false));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM prospectpilot_migrations")).rows[0].n,34);
  assert.deepEqual((await db.query("SELECT * FROM prospect_contacts WHERE id='existing'")).rows,before);
  for(const table of ['prospect_identity_evidence','prospect_historical_identifiers','prospect_historical_reviews'])assert.equal((await db.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n,0,'no guessed historical backfill');
 }finally{await db.close();}
});
