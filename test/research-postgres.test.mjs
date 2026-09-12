import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {createResearchLab} from '../research-lab.mjs';
import {leadIdentity} from '../lead-quality.mjs';

test('PostgreSQL serializes a new review behind an in-flight assessment',{
 skip:!process.env.POSTGRES_TEST_URL,timeout:20000
},async()=>{
 const schema='pp_test_'+randomUUID().replaceAll('-','');
 const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:2});
 const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:4,options:`-c search_path=${schema} -c statement_timeout=10000`});
 let releaseAssessment,assessment,review,paused=false,reviewPid;
 const started=new Promise(resolve=>{releaseAssessment={started:resolve};});
 const gate=new Promise(resolve=>{releaseAssessment.release=resolve;});
 const wrapper={query:(...args)=>pool.query(...args),connect:async()=>{
  const client=await pool.connect();
  return {release:error=>client.release(error),query:async(sql,args)=>{
   if(paused&&sql.startsWith('SELECT discovery_leads.*,EXISTS(')&&sql.endsWith('FOR UPDATE'))reviewPid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
   const result=await client.query(sql,args);
   if(!paused&&assessment&&sql==='SELECT payload FROM lab_observations WHERE lead_id=$1 AND user_id=$2'){
    paused=true;releaseAssessment.started();await gate;
   }
   return result;
  }};
 }};
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const file of ['generated/schema.sql','migrations/006-research-lab.sql','migrations/007-quality-v2.sql','migrations/012-plan-catalog-summary.sql','migrations/008-prospect-workspace.sql','migrations/013-advisor-workflow.sql'])await pool.query(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const lab=createResearchLab({pool:wrapper,sources:{readiness:{},quote:()=>0}}),user={uid:'synthetic',email:'synthetic@example.com'};
  await lab.importCSV(user,{csv:'First Name,Last Name,Company,Estimated Age Range,Country\nJamie,Rivera,Example Manufacturing,62,US'});
  const row=(await pool.query('SELECT id,payload FROM discovery_leads')).rows[0],lead={...JSON.parse(row.payload),id:row.id};
  assessment=lab.detail(user,row.id);await started;
  review=lab.review(user,row.id,{field:'age',verdict:'rejected',source:'Synthetic test',note:'Fictional review used only for lock validation.',observed_at:new Date().toISOString(),identity_signature:leadIdentity(lead)});
  let blocked=false;
  for(let i=0;i<100&&!blocked;i++){
   if(reviewPid)blocked=(await admin.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[reviewPid])).rows[0].blocked;
   if(!blocked)await delay(10);
  }
  assert.equal(blocked,true,'The review must wait for the assessment record lock');
  releaseAssessment.release();await assessment;await review;
  const stored=(await pool.query('SELECT status FROM lab_qualification WHERE lead_id=$1',[row.id])).rows[0].status;
  assert.equal(stored,'excluded');assert.equal((await lab.list(user)).leads[0].quality.status,'excluded');
 }finally{
  releaseAssessment.release();await Promise.allSettled([assessment,review].filter(Boolean));await pool.end();
  assert.match(schema,/^pp_test_[a-f0-9]{32}$/);
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
 }
});
