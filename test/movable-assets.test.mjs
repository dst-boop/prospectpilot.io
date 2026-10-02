import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {assessLead,leadScores,leadIdentity,validateObservation,researchCSV} from '../lead-quality.mjs';
import {createResearchLab} from '../research-lab.mjs';

const now=new Date('2026-10-02T12:00:00Z');
const lead={first_name:'Example',last_name:'Prospect',company:'Example Co',email:'example@example.com'};
const transfer={account_type:'401k',route:'separated',assets_confirmed:true,eligible_distribution:true,individual:true,evidence_basis:'participant_disclosure',consent_confirmed:true};
const amount={...transfer,lower_bound_usd:100000,amount_scope:'eligible_retained_assets'};
const review=(field,value)=>validateObservation({field,value,verdict:'confirmed',source:'Participant disclosure',note:'Synthetic reviewed evidence',observed_at:now.toISOString()},{userId:'owner',identity:leadIdentity(lead),now});
const base=()=>[review('residence',{country:'US',scope:'residence'}),review('contact',{channel:'email',address:lead.email,identity_confirmed:true}),review('retirement',transfer)];
const assess=rows=>assessLead(lead,rows,{now,target:'rollover_100k'});

test('movable target needs its own authorized amount, not net worth or demographics',()=>{
  const legacy=review('net_worth',{lower_bound_usd:1000000,excludes_home:true,net_of_liabilities:true,evidence_basis:'participant_disclosure',consent_confirmed:true});
  const missing=assess([...base(),legacy]);
  assert.notEqual(missing.status,'verified');assert.deepEqual(missing.gaps,['movable_assets']);
  assert.equal(assess([...base(),review('movable_assets',{...amount,lower_bound_usd:99999})]).gates.movable_assets.state,'unknown');
  const complete=assess([...base(),review('movable_assets',amount)]);
  assert.equal(complete.status,'verified');assert.equal(complete.score,100);
  const scores=leadScores(lead,complete,{now});
  assert.equal(scores.qualification.score,100);assert.equal(scores.opportunity.score,100);
  assert.doesNotMatch(JSON.stringify(scores.opportunity),/Net worth|45–73/);
  assert.equal(assess([...base(),review('movable_assets',amount),review('age',{min:80,max:80})]).status,'verified','age is context, not a rollover exclusion');
  assert.notEqual(assessLead(lead,[...base(),review('movable_assets',amount)],{now}).status,'verified','legacy mode is not silently converted');
});

test('movable evidence requires retained eligible assets, consent and a reviewed route',()=>{
  for(const change of [{lower_bound_usd:null},{lower_bound_usd:true},{lower_bound_usd:''},{lower_bound_usd:' '},{lower_bound_usd:-1},{amount_scope:'net_worth'},{evidence_basis:'provider_estimate'},{consent_confirmed:false},{assets_confirmed:false},{eligible_distribution:false},{individual:false},{route:'in_service',plan_permission:false}]) assert.throws(()=>review('movable_assets',{...amount,...change}));
  const valid=review('movable_assets',amount);
  for(const change of [{observed_at:'2025-01-01'},{observed_at:'2027-01-01'},{identity_signature:'another person'}]) assert.notEqual(assess([...base(),{...valid,...change}]).status,'verified');
  assert.notEqual(assess([...base(),review('movable_assets',{...amount,account_type:'403b'})]).status,'verified','different account reviews need reconciliation');
  assert.equal(assessLead({...lead,suppressed:true},[...base(),valid],{now,target:'rollover_100k'}).status,'excluded');
});

test('movable-assets migration preserves legacy observations',async()=>{
  const db=new PGlite();
  try {
    await db.exec("CREATE TABLE lab_observations(field text CONSTRAINT lab_observations_field_check CHECK(field IN ('net_worth')),payload jsonb); INSERT INTO lab_observations VALUES('net_worth','{\"lower_bound_usd\":250000}')");
    await db.exec(readFileSync(new URL('../migrations/026-movable-assets.sql',import.meta.url),'utf8'));
    await db.exec("INSERT INTO lab_observations VALUES('movable_assets','{\"lower_bound_usd\":100000}')");
    const rows=(await db.query('SELECT field,payload FROM lab_observations ORDER BY field')).rows;
    assert.deepEqual(rows.map(r=>r.field),['movable_assets','net_worth']);
    assert.equal(rows[1].payload.lower_bound_usd,250000);
  } finally {await db.close();}
});

test('saved rollover target is consistent across reviews, worklist, filters and exports',async()=>{
  const db=new PGlite();
  try {
    for(const file of readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1))) await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const lab=createResearchLab({pool,now:()=>now,sources:{readiness:{}}}),user={uid:'owner',email:'owner@example.com'};
    await lab.importCSV(user,{csv:'First Name,Last Name,Company,Email,Country\nExample,Prospect,Example Co,example@example.com,US'});
    const id=(await db.query('SELECT id FROM discovery_leads')).rows[0].id;
    const current=await lab.detail(user,id);
    const save=async(field,value)=>lab.review(user,id,{...review(field,value),identity_signature:current.quality.identity_signature});
    for(const row of [...base(),review('age',{min:60,max:60}),review('net_worth',{lower_bound_usd:1000000,excludes_home:true,net_of_liabilities:true,evidence_basis:'participant_disclosure',consent_confirmed:true})]) await save(row.field,row.value);
    assert.equal((await lab.detail(user,id)).quality.status,'verified');
    await lab.settings(user,{configuration:{qualification_target:'rollover_100k'}});
    assert.equal((await lab.list(user,{status:'verified'})).total,0,'old verified rule cannot populate the new verified filter');
    assert.equal((await lab.detail(user,id)).quality.gates.movable_assets.state,'unknown');
    assert.equal((await lab.advisor.detail(user,id)).action.field,'movable_assets','next action opens the missing criterion directly');
    await save('movable_assets',amount);
    await save('age',{min:80,max:80});
    const result=await lab.detail(user,id);
    assert.equal(result.quality.status,'verified');assert.equal(result.quality.target,'rollover_100k');
    assert.equal(result.scores.qualification.score,100);
    assert.equal((await lab.advisor.detail(user,id)).action.bucket,'ready');
    const work=(await lab.advisor.worklist(user,{view:'all'})).items.find(item=>item.lead.id===id);
    assert.equal(work.quality.target,'rollover_100k');assert.equal(work.action.bucket,'ready');
    assert.match(researchCSV([result]),/"rollover_100k","confirmed"/);
    const exported=await lab.route(new Request('https://app.example/api/lab/export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:[id]})}),user);
    assert.match(await exported.text(),/"rollover_100k","confirmed"/);
    assert.equal((await lab.list(user,{status:'verified'})).total,1);
    await lab.metrics(user);
    const stored=(await db.query('SELECT rule_version FROM lab_qualification')).rows[0];
    assert.equal(stored.rule_version,'retirement-movable-1');
    await lab.settings(user,{configuration:{score_weights:{qualification:5}}});
    assert.equal((await lab.settings(user)).configuration.qualification_target,'rollover_100k','unrelated settings preserve the target');
    assert.equal((await lab.settings({uid:'other',email:'other@example.com'})).configuration.qualification_target,'legacy','settings are per advisor');
  }finally{await db.close();}
});
