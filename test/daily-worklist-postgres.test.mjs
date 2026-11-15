import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {createResearchLab} from '../research-lab.mjs';

async function verifyDaily(pool) {
  const at=new Date('2026-09-12T15:00:00Z');
  const user={uid:'daily-owner',email:'daily-owner@example.com'},other={uid:'daily-other',email:'daily-other@example.com'};
  await migrate({connect:()=>pool.connect(),end:async()=>{}});
  const lab=createResearchLab({pool,now:()=>at,sources:{readiness:{},quote:()=>0}});
  await lab.importCSV(user,{csv:'First Name,Last Name,Company,Title,Email,Country\nJamie,Fixture,Example Co,Director,jamie@example.com,US\nCasey,Fixture,Example Co,Director,casey@example.com,US\nRobin,Future,Example Co,Director,robin@example.com,US'});
  await lab.importCSV(other,{csv:'First Name,Last Name,Company,Title,Email,Country\nPrivate,Fixture,Other Example,Director,private@example.com,US'});
  const own=(await lab.list(user)).leads.map(item=>item.lead),privateId=(await lab.list(other)).leads[0].lead.id;
  const jamie=own.find(lead=>lead.first_name==='Jamie'),future=own.find(lead=>lead.first_name==='Robin');
  const detail=await lab.detail(user,jamie.id);
  await lab.review(user,jamie.id,{field:'contact',value:{channel:'email',address:jamie.email,identity_confirmed:true},verdict:'confirmed',source:'Synthetic CI fixture',note:'Fictional reviewed ownership, no real contact.',observed_at:at.toISOString(),identity_signature:detail.quality.identity_signature});
  await pool.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_date}',to_jsonb($2::text))::text WHERE id=ANY($1::text[])`,[[...own.map(lead=>lead.id),privateId],'2026-09-10T10:00:00Z']);
  await pool.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_date}',to_jsonb($2::text))::text WHERE id=$1`,[future.id,'2026-09-13T10:00:00Z']);
  const snapshot=async()=>({leads:(await pool.query('SELECT id,payload FROM discovery_leads ORDER BY id')).rows,observations:(await pool.query('SELECT lead_id,user_id,field,payload FROM lab_observations ORDER BY lead_id,user_id,field')).rows,activities:(await pool.query('SELECT * FROM advisor_activities ORDER BY id')).rows});
  const before=await snapshot();
  const page=await lab.advisor.worklist(user,{view:'due',offset:1,limit:1});
  assert.equal(page.items.length,1);assert.equal(page.total,2);
  assert.deepEqual(page.daily,{as_of:at.toISOString(),due:2,with_reviewed_route:1,needs_contact_review:1,on_hold:0});
  assert.deepEqual((await lab.advisor.worklist(user,{view:'closed'})).daily,page.daily);
  assert.equal((await lab.advisor.worklist(user,{search:'Jamie'})).daily.due,1);
  assert.equal((await lab.advisor.worklist(user,{search:'Private'})).daily.due,0);
  assert.equal((await lab.advisor.worklist(other)).daily.due,1);
  assert.deepEqual(await snapshot(),before,'Summary reads must not change prospects, evidence, or activity');
  await pool.query(`UPDATE lab_observations SET payload=jsonb_set(payload,'{observed_at}','"2020-01-01"') WHERE lead_id=$1 AND field='contact'`,[jamie.id]);
  const expired=await lab.advisor.worklist(user,{search:'Jamie'});
  assert.equal(expired.daily.with_reviewed_route,0);assert.equal(expired.daily.needs_contact_review,1);
}

test('PGlite daily summary uses the same isolated schema and read-only checks as PostgreSQL',async()=>{
  const db=new PGlite();
  const query=(sql,args)=>!args&&sql.includes(';')?db.exec(sql).then(results=>results.at(-1)):db.query(sql,args);
  const pool={query,connect:async()=>({query,release(){}})};
  try {await verifyDaily(pool);} finally {await db.close();}
});

test('PostgreSQL daily summary is owner scoped, page independent and read-only on the current migration schema',{
  skip:!process.env.POSTGRES_TEST_URL,timeout:30000
},async()=>{
  const schema='pp_daily_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1});
  const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:3,options:`-c search_path=${schema} -c statement_timeout=10000`});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await verifyDaily(pool);
  } finally {
    await pool.end();
    assert.match(schema,/^pp_daily_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
