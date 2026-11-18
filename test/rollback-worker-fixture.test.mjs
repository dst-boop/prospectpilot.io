// Queue semantics only, not evidence of actual-image bootstrap or real providers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingDatabase} from './helpers/staging-database.mjs';
import {migrate} from '../migrate.mjs';
import {createResearchJobs} from '../research-jobs.mjs';
import {createProspectJobs} from '../prospect-jobs.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectAutopilot} from '../prospect-autopilot.mjs';
import {fetchLegacySafely} from '../legacy-identity-guard.mjs';
test('worker fixture has only terminal legacy409 work and preserves future paid reservations',{timeout:60000},async()=>{
 const db=await createStagingDatabase();try{
  await migrate(db.pool);
  await db.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('fixture-job','owner','enrich','fixture','synthetic',100)");
  for(const [id,status] of [['future','pending'],['leased','running']])await db.query("INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,payload,status,next_attempt_at,lease_token,lease_until) VALUES($1,'fixture-job','owner','enrich','synthetic','{}',$2,now()+interval '1 day',$3,now()+interval '1 day')",[id,status,status==='running'?'lease':null]);
  await db.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('leased','owner','synthetic',100)");
  const snapshot=async()=>{const result={};for(const table of ['prospect_jobs','prospect_tasks','prospect_charges','lab_runs','lab_tasks','lab_settings','prospect_autopilot_runs'])result[table]=(await db.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return result;};
  const before=await snapshot();let calls=0,sourceCalls=0;const deny=()=>{calls++;throw Error('No provider may run');};
  const jobs=createProspectJobs({pool:db.pool,providers:new Proxy({},{get:()=>deny})});
  const lab=createResearchLab({pool:db.pool,sources:{readiness:{},run:deny,quote:deny}});
  const autopilot=createProspectAutopilot({pool:db.pool,jobs});
  const queue=createResearchJobs({pool:db.pool,runSource:async(job,source)=>{sourceCalls++;assert.equal(source,'website');const response=await fetchLegacySafely({fetch:deny},new Request('https://synthetic.example.test/api/research/auto',{method:'POST',body:JSON.stringify({lead_id:job.lead_id,source})}),{});assert.equal(response.status,409);throw Object.assign(Error('Legacy research paused'),{status:response.status});}});
  await lab.scheduleDue();assert.equal(await jobs.tick(),false);assert.equal(await lab.tick(),false);assert.equal(await queue.tick(),false);assert.equal(await autopilot.tick(),false);
  await queue.enqueue('synthetic-lead',{user_id:'owner',email:'owner@example.test'},'synthetic');
  assert.equal(await jobs.tick(),false);assert.equal(await lab.tick(),false);assert.equal(await queue.tick(),true);assert.equal(await autopilot.tick(),false);
  const row=(await db.query('SELECT * FROM research_jobs')).rows[0];assert.equal(row.status,'failed');assert.equal(row.next_source,1);assert.equal(row.attempts,0);assert.equal(row.lease_token,null);assert.equal(row.lease_until,null);assert.equal(row.reports.length,1);
  const report=row.reports[0];assert.deepEqual({...report,last_attempt_ms:0},{source:'website',status:'failed',limitations:['Lead access or identity changed.'],saved_record_count:0,attempt_count:1,last_attempt_ms:0});assert.ok(Number.isInteger(report.last_attempt_ms)&&report.last_attempt_ms>=0);
  assert.equal(await queue.tick(),false);assert.deepEqual((await db.query('SELECT * FROM research_jobs')).rows[0],row);assert.deepEqual(await snapshot(),before);assert.equal(sourceCalls,1);assert.equal(calls,0);
 }finally{await db.close();}
});
