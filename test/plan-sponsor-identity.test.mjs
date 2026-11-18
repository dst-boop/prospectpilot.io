import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {selectEmployers,matchPlans} from '../plan-catalog.mjs';
import {nameKey} from '../lead-quality.mjs';
const year=new Date().getUTCFullYear()-1;
async function fixture(fn){const db=new PGlite();try{for(const f of ['generated/schema.sql','migrations/006-research-lab.sql','migrations/017-forget.sql'])await db.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));const put=async(id,ein,count,extra={})=>{const p={id,ein,plan_number:'001',sponsor:'Same Name Company',city:'Albany',state:'NY',plan_year:year,separated_future_benefits:count,net_assets:1000,participants_with_balances:100,...extra};await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5)',[id,nameKey(p.sponsor),p.state,p.plan_year,JSON.stringify(p)]);};await fn(db,put);}finally{await db.close();}}
test('same-name sponsors with different EINs remain distinct ranked filings, without summed figures',()=>fixture(async(db,put)=>{await put('ein-one','111111111',15);await put('ein-two','222222222',40,{city:'Buffalo'});const rows=await selectEmployers(db,{plan_filter:{order:'former_employee_population'}});assert.deepEqual(rows.map(p=>[p.id,p.ein,p.separated_future_benefits]),[['ein-two','222222222',40],['ein-one','111111111',15]]);assert.equal((await matchPlans(db,{company:'Same Name Company'})).length,2);}));

test('same EIN keeps one representative while missing identifiers remain separate filing candidates',()=>fixture(async(db,put)=>{
 await put('one-a','111111111',4,{plan_number:'001'});await put('one-b','111111111',20,{plan_number:'002'});
 await put('missing-a',null,8,{plan_number:null});await put('missing-b',null,9,{plan_number:null});
 const rows=await selectEmployers(db,{plan_filter:{order:'former_employee_population'}});
 assert.deepEqual(rows.map(p=>p.id),['one-b','missing-b','missing-a']);
 assert.ok(rows.every(p=>p.sponsor_identity_status==='ambiguous_name'));
 assert.equal((await matchPlans(db,{company:'Same Name Company'})).length,4);
}));

test('mailing-state filtering does not clear same-name ambiguity; rotation does not suppress another EIN',()=>fixture(async(db,put)=>{
 await put('ny','111111111',10);await put('ca','222222222',20,{state:'CA',city:'Sacramento'});
 const {planResearchTargets}=await import('../plan-catalog.mjs');
 const ny=await selectEmployers(db,{states:['NY']});assert.equal(ny.length,1);assert.equal(ny[0].sponsor_name_entity_count,2);
 const target=planResearchTargets(ny)[0];assert.equal(target.plan_identity_review,true);assert.equal(target.city,'');assert.equal(target.state,'');assert.equal(target.plan_id,undefined);
 const limited=planResearchTargets(await selectEmployers(db,{max_companies:1}))[0];assert.equal(limited.plan_identity_review,true);assert.equal(limited.plan_candidates.length,1);assert.equal(limited.state,'');
 await db.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key) VALUES('run','owner','owner@example.test','discovery','run')");
 await db.query("INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES('task','run','task','public_web',$1)",[JSON.stringify({company:'Same Name Company',plan_sponsor_keys:['ein:111111111']})]);
 assert.deepEqual((await selectEmployers(db,{},'owner')).map(p=>p.ein),['222222222']);
 assert.equal((await selectEmployers(db,{},'other')).length,2);
 await db.query("UPDATE lab_tasks SET payload=$1 WHERE id='task'",[JSON.stringify({company:'Same Name Company'})]);
 assert.equal((await selectEmployers(db,{},'owner')).length,2,'legacy name-only task cannot resolve which namesake EIN was researched');
}));

test('ambiguous discovery queues one name-research task, preserves both filings and does not qualify or enrich a person',async()=>{
 const {createResearchLab}=await import('../research-lab.mjs');const db=new PGlite();try{
 const files=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(v=>v.slice(1,-1));for(const f of files)await db.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 for(const [id,ein,city,count] of [['ny','111111111','Albany',15],['ny-other','222222222','Buffalo',40]])await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5)',[id,'same name company','NY',year,JSON.stringify({id,ein,plan_number:'001',sponsor:'Same Name Company',city,state:'NY',plan_year:year,separated_future_benefits:count,participants_with_balances:100})]);
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})},calls=[];
 const lab=createResearchLab({pool,sources:{readiness:{},quote:()=>0,run:async(source,payload)=>{calls.push({source,payload});return {status:'completed',candidates:[{name:'Synthetic Candidate',company:'Same Name Company',email:'synthetic@example.com',country:'US'}]};}}});
 const user={uid:'owner',email:'owner@example.test'};const run=await lab.enqueue(user,{employers:['Same Name Company'],websites:['https://specific.example.test'],states:['NY'],sources:['public_web'],idempotency_key:'ambiguous',max_companies:10});
 const tasks=(await db.query('SELECT payload FROM lab_tasks WHERE run_id=$1',[run.id])).rows;assert.equal(tasks.length,1);
 const target=tasks[0].payload;assert.equal(target.plan_candidates.length,2);assert.deepEqual(target.plan_candidates.map(p=>p.separated_future_benefits).sort((a,b)=>b-a),[40,15]);assert.equal(target.plan_id,undefined);assert.equal(target.sponsor_ein,undefined);assert.equal(target.city,'');assert.equal(target.state,'');assert.equal(target.website,undefined);assert.equal(target.requested_website,'https://specific.example.test');
 assert.equal(await lab.tick(),true);assert.equal(calls.length,1);assert.equal(calls[0].payload.plan_identity_review,true);
 const saved=(await db.query('SELECT id,payload FROM discovery_leads')).rows;assert.equal(saved.length,1);assert.equal(JSON.parse(saved[0].payload).plan_id,undefined);
 const detail=await lab.detail(user,saved[0].id);assert.equal(detail.quality.plans.length,2);assert.ok(detail.quality.plans.every(p=>/not evidence of individual participation/.test(p.match_basis)));assert.notEqual(detail.quality.status,'verified');assert.notEqual(detail.quality.gates.retirement?.state,'confirmed');
 const filtered=await lab.enqueue(user,{employers:['Same Name Company'],websites:['https://specific.example.test'],states:['TX'],sources:['public_web'],idempotency_key:'filtered-out',max_companies:1});
 const fallback=(await db.query('SELECT payload FROM lab_tasks WHERE run_id=$1',[filtered.id])).rows[0].payload;
 assert.equal(fallback.plan_identity_review,true);assert.equal(fallback.city,'');assert.equal(fallback.state,'');assert.equal(fallback.website,undefined);assert.equal(fallback.plan_candidates.length,2);assert.match(fallback.plan_identity_notice,/No eligible sponsor filing was selected/);

 }finally{await db.close();}
});

test('ambiguity context and reported EINs are visible and escaped in the existing evidence UI',async()=>{
 const vm=await import('node:vm'),src=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
 const start=src.indexOf('function planIdentityContext('),end=src.indexOf('async function openRun',start);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({esc,num:x=>String(x)});vm.runInContext(src.slice(start,end),context);
 const html=vm.runInContext(`planIdentityContext({plan_identity_review:true,plan_identity_notice:'No corporate relationship inferred',plan_candidates:[{id:'<script>bad</script>',ein:'111111111',city:'Albany',state:'NY',separated_future_benefits:15},{id:'two',ein:'222222222',separated_future_benefits:40}]})`,context);
 assert.match(html,/111111111/);assert.match(html,/222222222/);assert.match(html,/not a complete entity inventory/);assert.match(html,/15 \(this filing only\)/);assert.doesNotMatch(html,/<script>|55 \(this filing only\)/);
 assert.match(src,/Reported sponsor EIN:/);
});

test('empty plan numbers retain distinct evidence and renamed latest filings do not create stale ambiguity',()=>fixture(async(db,put)=>{await put('empty-a','111111111',10,{plan_number:''});await put('empty-b','111111111',12,{plan_number:''});assert.equal((await matchPlans(db,{company:'Same Name Company'})).length,2);await put('old-name','222222222',100,{plan_year:year-1,plan_number:'001'});await put('new-name','222222222',20,{sponsor:'Renamed Entity',plan_number:'001'});const rows=await selectEmployers(db,{employers:['Same Name Company']});assert.equal(rows.length,1);assert.equal(rows[0].sponsor_name_entity_count,1);assert.equal((await matchPlans(db,{company:'Same Name Company'})).length,2);}));
