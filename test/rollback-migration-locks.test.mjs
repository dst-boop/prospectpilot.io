import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withCompatibilityDatabase} from './helpers/rollback-compatibility.mjs';
import {createResearchLab} from '../research-lab.mjs';

test('native PostgreSQL: 030–033 retains table locks until commit; blocked operations fail boundedly without partial migration', {skip:!process.env.POSTGRES_TEST_URL,timeout:30000},async t=>{
 await withCompatibilityDatabase('postgres',async pool=>{
  const owner={uid:'lock-owner',email:'lock@example.test'};
  const lab=createResearchLab({pool,sources:{readiness:{}}});
  await lab.importCSV(owner,{csv:'First Name,Last Name,Company,Email\nSynthetic,Lock,Example,lock@example.test'});
  const id=(await lab.list(owner)).leads[0].lead.id;
  await pool.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) SELECT $1,$2||'-'||n,'age','{}'::jsonb FROM generate_series(1,10000) AS n",[id,owner.uid]);
  const migration=await pool.connect(),reader=await pool.connect();
  try{
   await migration.query('BEGIN');
   await migration.query("SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='10s'");
   const start=performance.now();
   for(const name of ['030-personal-events','031-autopilot','032-networking-capture','033-planning-decisions']){
    await migration.query(readFileSync(new URL('./fixtures/'+name+'.sql',import.meta.url),'utf8'));
    await migration.query('INSERT INTO prospectpilot_migrations(id) VALUES($1)',[name.slice(0,3)]);
   }
   t.diagnostic(`Synthetic 10,000-row DDL elapsed ${Math.round(performance.now()-start)}ms; not a production capacity estimate.`);
   await reader.query("SET lock_timeout='200ms'");
   await assert.rejects(reader.query('SELECT count(*) FROM lab_observations'),{code:'55P03'});
   await assert.rejects(reader.query("UPDATE lab_observations SET payload='{\"blocked\":true}'::jsonb WHERE lead_id=$1",[id]),{code:'55P03'});
   await assert.rejects(reader.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES($1,$2,'age','{}'::jsonb)",[id,owner.uid]),{code:'55P03'});
   await migration.query('ROLLBACK');
   assert.equal((await reader.query('SELECT count(*)::int AS n FROM lab_observations')).rows[0].n,10000);
   assert.equal((await reader.query("SELECT count(*)::int AS n FROM lab_observations WHERE payload <> '{}'::jsonb")).rows[0].n,0);
   assert.equal((await reader.query("SELECT count(*)::int AS n FROM prospectpilot_migrations WHERE id>='030'")).rows[0].n,0);
   assert.equal((await reader.query("SELECT to_regclass('prospect_networking_captures') AS x")).rows[0].x,null);
   // A live reader can prevent migration lock acquisition. Failure must leave 029 unchanged.
   await reader.query('BEGIN'); await reader.query('SELECT count(*) FROM lab_observations');
   await migration.query('BEGIN');await migration.query("SET LOCAL lock_timeout='200ms'");
   await assert.rejects(migration.query(readFileSync(new URL('./fixtures/030-personal-events.sql',import.meta.url),'utf8')),{code:'55P03'});
   await migration.query('ROLLBACK');await reader.query('ROLLBACK');
   assert.equal((await reader.query('SELECT count(*)::int AS n FROM lab_observations')).rows[0].n,10000);
  }finally{await migration.query('ROLLBACK').catch(()=>{});await reader.query('ROLLBACK').catch(()=>{});migration.release();reader.release();}
 });
});
