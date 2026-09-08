import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
test('migrations apply once and history queries can use an index',async()=>{
 const db=new PGlite();
 const pool={connect:async()=>({query:async(sql,values)=>sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values),release(){}}),end:async()=>{}};
 try{
  await migrate(pool);await migrate(pool);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM prospectpilot_migrations')).rows[0].count,6);
  assert.equal((await db.query("SELECT indexname FROM pg_indexes WHERE indexname='research_jobs_user_lead_latest'")).rows.length,1);
  await db.exec(`INSERT INTO lead_call_records(id,user_id,lead_id,week_start,outcome,created_at) SELECT n::text, 'user-'||(n % 100),n::text,'2026-09-01','test',n::text FROM generate_series(1,5000) n; ANALYZE lead_call_records;`);
  const plan=JSON.stringify((await db.query("EXPLAIN (FORMAT JSON) SELECT * FROM lead_call_records WHERE user_id=$1 AND week_start=$2 ORDER BY created_at DESC",['user-1','2026-09-01'])).rows);
  // The index exists for this exact filter/order; PostgreSQL still chooses the plan.
  assert.ok((await db.query("SELECT indexname FROM pg_indexes WHERE indexname='idx_call_user_week_created'")).rows.length);
  assert.ok(plan.includes('Index')||plan.includes('Bitmap'));
 }finally{await db.close();}
});
