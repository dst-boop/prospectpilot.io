import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab,assessInventory} from '../research-lab.mjs';
import {leadIdentity} from '../lead-quality.mjs';
async function fixture(options={}) {
  const db=new PGlite();
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../migrations/006-research-lab.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../migrations/012-plan-catalog-summary.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../migrations/007-quality-v2.sql',import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const sources=options.sources||{readiness:{},quote:()=>0,run:async()=>({status:'completed',candidates:[{name:'Jamie Rivera',company:'Example Manufacturing',current_title:'Director',email:'jamie@example.com',estimated_age_range:'62',country:'US'}]})};
  return {db,pool,lab:createResearchLab({pool,sources,...options}),user:{uid:'owner',email:'owner@example.com'}};
}
const csv='First Name,Last Name,Company,Title,Email,Estimated Age Range,Country\nJamie,Rivera,Example Manufacturing,Director,jamie@example.com,62,US';
test('imports replay safely, preserve restrictions, isolate users, and reject malformed or oversized row sets',async()=>{
  const {db,lab,user}=await fixture();try{
    const first=await lab.importCSV(user,{csv});assert.equal(first.result.added,1);
    assert.equal((await lab.importCSV(user,{csv})).replayed,true);
    assert.equal((await lab.list(user)).leads.length,1);
    const id=(await db.query('SELECT id FROM discovery_leads')).rows[0].id;
    await assert.rejects(lab.detail({uid:'other',email:'other@example.com'},id),{status:404});
    await db.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_status}','"Do Not Contact"')::text WHERE id=$1`,[id]);
    const changed=await lab.importCSV(user,{csv:csv+'\n',source:'Another export'});assert.equal(changed.result.duplicates,1);assert.equal((await lab.detail(user,id)).quality.status,'excluded');
    await assert.rejects(lab.importCSV(user,{csv:'First Name,Last Name\n"Unclosed,Person'}),{status:422});
    await assert.rejects(lab.importCSV(user,{csv:'First Name,Last Name\n'+Array(5001).fill('Test,Person').join('\n')}),{status:422});
  }finally{await db.close();}
});
test('discovery is durable, launch-idempotent, deduplicated and counted separately from imports',async()=>{
  const {db,lab,user}=await fixture();try{
    const config={employers:['Example Manufacturing'],sources:['public_web'],idempotency_key:'run1'};
    const run=await lab.enqueue(user,config);assert.equal((await lab.enqueue(user,config)).id,run.id);
    assert.equal(await lab.tick(),true);assert.equal(await lab.tick(),false);
    const metrics=await lab.metrics(user);assert.equal(metrics.totals.new_sourced,1);assert.equal(metrics.totals.newly_verified,0);assert.equal(metrics.totals.cost_per_verified,null);
    await lab.enqueue(user,{...config,idempotency_key:'run2'});await lab.tick();assert.equal((await lab.metrics(user)).totals.new_sourced,1);
    assert.equal((await lab.runDetail(user,run.id)).run.status,'completed');
  }finally{await db.close();}
});
test('review requires current identity; first verification is counted once and deletion cascades',async()=>{
  const {db,lab,user}=await fixture();try{
    await lab.importCSV(user,{csv});const id=(await db.query('SELECT id FROM discovery_leads')).rows[0].id;
    let detail=await lab.detail(user,id);const values={age:{min:62,max:62},residence:{country:'US',scope:'residence'},retirement:{account_type:'401k',route:'separated',assets_confirmed:true,individual:true,eligible_distribution:true,evidence_basis:'participant_disclosure',consent_confirmed:true},contact:{channel:'email',address:'jamie@example.com',identity_confirmed:true},net_worth:{lower_bound_usd:250000,excludes_home:true,net_of_liabilities:true,evidence_basis:'authorized_document',consent_confirmed:true}};
    for(const [field,value] of Object.entries(values))await lab.review(user,id,{field,value,verdict:'confirmed',source:'Participant evidence',note:'Documented confirmation for this individual.',observed_at:new Date().toISOString(),identity_signature:detail.quality.identity_signature});
    assert.equal((await lab.detail(user,id)).quality.status,'verified');assert.equal((await lab.metrics(user)).totals.newly_verified,1);
    const cohort=(await lab.metrics(user)).sources.find(s=>s.acquired===1);
    assert.equal(cohort.qualified,1);assert.equal(cohort.qualification_rate,1);
    await lab.importCSV(user,{csv:csv+'\n',source:'Repeated import'});
    assert.equal((await lab.metrics(user)).sources.reduce((n,s)=>n+Number(s.acquired||0),0),1);
    await lab.detail(user,id);assert.equal((await lab.metrics(user)).totals.newly_verified,1);
    await db.query(`UPDATE lab_observations SET payload=jsonb_set(payload,'{observed_at}','"2020-01-01"') WHERE lead_id=$1 AND field='retirement'`,[id]);assert.equal((await lab.metrics(user)).totals.newly_verified,0);
    await assert.rejects(lab.review(user,id,{identity_signature:'stale'}),{status:409});
    await db.query('DELETE FROM discovery_leads WHERE id=$1',[id]);assert.equal((await db.query('SELECT * FROM lab_observations')).rows.length,0);assert.equal((await db.query('SELECT * FROM lab_qualification')).rows.length,0);
  }finally{await db.close();}
});

test('rule migration invalidates previous verification and retains observations without resetting new-rule reviews',async()=>{
  const {db,lab,user}=await fixture();try {
    await lab.importCSV(user,{csv});const id=(await db.query('SELECT id FROM discovery_leads')).rows[0].id;
    const detail=await lab.detail(user,id);
    await lab.review(user,id,{field:'contact',value:{channel:'email',address:'jamie@example.com',identity_confirmed:true},verdict:'confirmed',source:'Participant',note:'Confirmed email.',observed_at:new Date().toISOString(),identity_signature:detail.quality.identity_signature});
    await db.query("UPDATE lab_qualification SET status='verified',score=100,first_verified_at=now(),rule_version='retirement-evidence-1' WHERE lead_id=$1",[id]);
    const migration=readFileSync(new URL('../migrations/007-quality-v2.sql',import.meta.url),'utf8');
    await db.exec(migration);
    let row=(await db.query('SELECT * FROM lab_qualification WHERE lead_id=$1',[id])).rows[0];
    assert.equal(row.status,'unassessed');assert.equal(row.first_verified_at,null);
    assert.equal((await db.query('SELECT * FROM lab_observations')).rows.length,1);
    await lab.detail(user,id);await db.exec(migration);
    row=(await db.query('SELECT * FROM lab_qualification WHERE lead_id=$1',[id])).rows[0];assert.equal(row.rule_version,'retirement-evidence-2');assert.notEqual(row.status,'unassessed');
  }finally{await db.close();}
});
test('paid lookup budget is reserved before calls and never silently retried after interruption',async()=>{
  let calls=0;const source={readiness:{web_search:true},quote:()=>5000,run:async()=>{calls++;return {status:'failed',errors:['Unavailable'],candidates:[]};}};
  const {db,lab,user}=await fixture({sources:source});try{
    await assert.rejects(lab.enqueue(user,{employers:['Example Manufacturing'],sources:['web_search'],daily_budget_micros:0,idempotency_key:'zero'}),{status:422});assert.equal(await lab.tick(),false);assert.equal(calls,0);
    await lab.enqueue(user,{employers:['Example Manufacturing'],sources:['web_search'],daily_budget_micros:5000,idempotency_key:'one'});await lab.tick();assert.equal(calls,1);
    await lab.enqueue(user,{employers:['Example Manufacturing'],sources:['web_search'],daily_budget_micros:5000,idempotency_key:'two'});await lab.tick();assert.equal(calls,1);
    assert.equal(Number((await db.query('SELECT sum(amount_micros) AS n FROM lab_costs')).rows[0].n),5000);
    assert.equal((await lab.metrics(user)).totals.cost_usd,.005);
  }finally{await db.close();}
});
test('source failures remain gaps; expired free tasks recover and daily settings schedule once',async()=>{
  const {db,lab,user}=await fixture({sources:{quote:()=>0,readiness:{},run:async()=>{throw Error('network');}}});try{
    await lab.settings(user,{daily_enabled:true,daily_hour:0,configuration:{employers:['Example Manufacturing'],sources:['public_web']}});await lab.scheduleDue();await lab.scheduleDue();assert.equal((await db.query('SELECT * FROM lab_runs')).rows.length,1);
    await db.exec("UPDATE lab_tasks SET status='running',lease_until=now()-interval '5 minutes',attempts=1");await lab.tick();assert.equal((await db.query('SELECT status FROM lab_runs')).rows[0].status,'completed_with_gaps');assert.equal((await db.query('SELECT status FROM lab_tasks')).rows[0].status,'failed');
  }finally{await db.close();}
});

test('unconfigured discovery is rejected before queueing and source gaps remain available in run summaries',async()=>{
  let employer;
  const sources={readiness:{web_search:false},quote:s=>s==='web_search'?null:0,run:async(s,e)=>{employer=e;return {status:'partial',candidates:[],errors:['Official website index unavailable.']};}};
  const {db,lab,user}=await fixture({sources});try{
    await assert.rejects(lab.enqueue(user,{employers:['Example'],sources:['web_search']}),{status:422});
    assert.equal((await db.query('SELECT count(*)::int AS n FROM lab_runs')).rows[0].n,0);
    const run=await lab.enqueue(user,{employers:['Example'],states:['NY'],sources:['public_web']});
    await lab.tick();assert.equal(employer.state,'NY');
    const result=await lab.route(new Request('https://example.org/api/lab/runs'),user);
    assert.deepEqual(result.runs[0].source_results[0].errors,['Official website index unavailable.']);
    assert.equal(result.runs[0].source_results[0].company,'Example');
    const detail=await lab.route(new Request('https://example.org/api/lab/runs/'+run.id),user);
    assert.equal((await Response.json(detail).json()).tasks[0].result.errors[0],'Official website index unavailable.');
    assert.equal((await lab.route(new Request('https://example.org/api/lab/runs'),{uid:'other',email:'other@example.org'})).runs.length,0);
    await assert.rejects(lab.runDetail({uid:'other',email:'other@example.org'},run.id),{status:404});
  }finally{await db.close();}
});

test('active inventory assessments are reused per user, while completed runs can be restarted',async()=>{
 const {db,lab,user}=await fixture();try{
  await lab.importCSV(user,{csv});
  const first=await lab.enqueue(user,{kind:'inventory',idempotency_key:'first'});
  const second=await lab.enqueue(user,{kind:'inventory',idempotency_key:'second'});
  assert.equal(second.id,first.id);assert.equal(second.reused_active,true);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM lab_tasks WHERE source='inventory'")).rows[0].n,1);
  await lab.tick();
  const next=await lab.enqueue(user,{kind:'inventory',idempotency_key:'next'});assert.notEqual(next.id,first.id);
  const other=await lab.enqueue({uid:'other',email:'other@example.com'},{kind:'inventory'});
  assert.notEqual(other.id,next.id);assert.equal(other.status,'completed');assert.equal(other.dispatched,false);assert.equal(other.message,'No saved leads to assess.');
 }finally{await db.close();}
});

test('research search matches full names and treats wildcard characters literally',async()=>{
 const {db,lab,user}=await fixture();try{
  await lab.importCSV(user,{csv:csv+'\nMorgan,Chen,100% Engineering,Manager,morgan@example.com,60,US'});
  assert.equal((await lab.list(user,{search:'Jamie Rivera'})).total,1);
  assert.equal((await lab.list(user,{search:'  jamie   rivera  '})).total,1);
  assert.equal((await lab.list(user,{search:'%'})).total,1);
  assert.equal((await lab.list(user,{search:'_'})).total,0);
  assert.equal((await lab.list(user,{search:'\\'})).total,0);
 }finally{await db.close();}
});

test('compact research pages preserve displayed quality and out-of-range totals without returning full records',async()=>{
 const {db,lab,user}=await fixture();try{
  await lab.importCSV(user,{csv});const id=(await lab.list(user)).leads[0].lead.id;
  await db.query("UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{notes}',$1::jsonb)::text WHERE id=$2",[JSON.stringify('Private source note '.repeat(1000)),id]);
  const full=await lab.list(user),small=await lab.list(user,{compact:'true'});
  assert.equal(small.total,full.total);assert.equal(small.leads[0].quality.status,full.leads[0].quality.status);assert.equal(small.leads[0].quality.score,full.leads[0].quality.score);
  for(const [key,gate] of Object.entries(full.leads[0].quality.gates))assert.deepEqual(small.leads[0].quality.gates[key],{state:gate.state,reason:gate.reason});
  assert.equal(small.leads[0].lead.notes,undefined);assert.equal(small.leads[0].lead.email,undefined);
  assert.ok(JSON.stringify(small).length<JSON.stringify(full).length/4);
  assert.equal((await lab.detail(user,id)).lead.notes,'Private source note '.repeat(1000));
  const beyond=await lab.list(user,{offset:100,search:'Jamie Rivera',compact:true});assert.equal(beyond.total,1);assert.equal(beyond.leads.length,0);
  assert.equal((await lab.list({uid:'other',email:'other@example.com'},{offset:100,compact:true})).total,0);
  await assert.rejects(lab.list(user,{compact:'sometimes'}),{status:422});
 }finally{await db.close();}
});

test('inventory preserves partial progress and bounds new work without exposing record errors',async()=>{
 const result=await assessInventory(['good','gone','bad','later'],async id=>{if(id==='gone')throw Object.assign(Error('Private identity'),{status:404});if(id==='bad')throw Error('Secret database detail');});
 assert.equal(result.assessed,2);assert.equal(result.failed,1);assert.equal(result.skipped,1);assert.equal(result.remaining,0);assert.equal(result.status,'partial');
 assert.doesNotMatch(JSON.stringify(result),/Private identity|Secret database detail/);
 let time=0,calls=0;const bounded=await assessInventory(['a','b','c'],async()=>{calls++;time=61000;},{clock:()=>time});
 assert.equal(calls,1);assert.equal(bounded.assessed,1);assert.equal(bounded.remaining,2);assert.equal(bounded.status,'partial');
});

test('a single record failure persists batch counts while other inventory records finish',async()=>{
 const {db,pool,lab,user}=await fixture();try{
  await lab.importCSV(user,{csv:csv+'\nMorgan,Chen,Other,Manager,morgan@example.com,60,US\nTaylor,Brooks,Other,Director,taylor@example.com,61,US'});
  const bad=(await lab.list(user)).leads[0].lead.id;
  await db.query('DELETE FROM lab_qualification');
  const query=pool.query;pool.query=(sql,args)=>sql.startsWith('SELECT * FROM discovery_leads WHERE')&&args?.[3]===bad?Promise.reject(Error('Internal details')):query(sql,args);
  const run=await lab.enqueue(user,{kind:'inventory'});await lab.tick();
  const detail=await lab.runDetail(user,run.id),result=detail.tasks[0].result;
  assert.equal(detail.run.status,'completed_with_gaps');assert.equal(result.assessed,2);assert.equal(result.failed,1);assert.equal(result.remaining,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM lab_qualification')).rows[0].n,2);
  assert.doesNotMatch(JSON.stringify(detail),/Internal details/);
 }finally{await db.close();}
});

test('inventory retries prioritize unassessed and oldest records within the current user scope',async()=>{
 const {db,lab,user}=await fixture();try{
  await lab.importCSV(user,{csv:csv+'\nMorgan,Chen,Other,Manager,morgan@example.com,60,US\nTaylor,Brooks,Other,Director,taylor@example.com,61,US'});
  const ids=(await db.query('SELECT id FROM discovery_leads ORDER BY id')).rows.map(r=>r.id);
  await db.query('DELETE FROM lab_qualification');
  await lab.detail(user,ids[0]);await lab.detail(user,ids[2]);
  await db.query("UPDATE lab_qualification SET evaluated_at='2020-01-01' WHERE lead_id=$1",[ids[2]]);
  await db.query(`INSERT INTO lab_qualification(lead_id,user_id,status,score,identity_signature)
    SELECT $1,'other',status,score,identity_signature FROM lab_qualification WHERE lead_id=$2`,[ids[1],ids[0]]);
  const first=await lab.enqueue(user,{kind:'inventory'}),task=(await lab.runDetail(user,first.id)).tasks[0];
  assert.deepEqual(task.payload.ids,[ids[1],ids[2],ids[0]]);
  let time=0;const result=await assessInventory(task.payload.ids,async id=>{await lab.detail(user,id);time=61000;},{clock:()=>time});
  assert.equal(result.assessed,1);assert.equal(result.remaining,2);
  // Simulate persistence of the bounded runner's completion before another run.
  await db.query("UPDATE lab_runs SET status='completed_with_gaps' WHERE id=$1",[first.id]);
  const next=await lab.enqueue(user,{kind:'inventory'}),nextTask=(await lab.runDetail(user,next.id)).tasks[0];
  assert.deepEqual(nextTask.payload.ids,[ids[2],ids[0],ids[1]]);
  assert.equal((await lab.enqueue({uid:'other',email:'other@example.com'},{kind:'inventory'})).status,'completed');
 }finally{await db.close();}
});
