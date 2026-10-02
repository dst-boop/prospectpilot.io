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
    assert.equal(stored.rule_version,'retirement-movable-3');
    await lab.settings(user,{configuration:{score_weights:{qualification:5}}});
    assert.equal((await lab.settings(user)).configuration.qualification_target,'rollover_100k','unrelated settings preserve the target');
    assert.equal((await lab.settings({uid:'other',email:'other@example.com'})).configuration.qualification_target,'legacy','settings are per advisor');
    await lab.importCSV(user,{csv:'First Name,Last Name,Company,Email,Country\nSynthetic,Combined,Example Co,combined@example.com,US'});
    const combinedId=(await db.query("SELECT id FROM discovery_leads WHERE payload::jsonb->>'email'='combined@example.com'")).rows[0].id;
    const combinedIdentity=(await lab.detail(user,combinedId)).quality.identity_signature;
    for(const row of [review('residence',{country:'US',scope:'residence'}),review('contact',{channel:'email',address:'combined@example.com',identity_confirmed:true})]) await lab.review(user,combinedId,{...row,identity_signature:combinedIdentity});
    assert.equal((await lab.advisor.detail(user,combinedId)).action.field,'movable_assets','next prospect chooses combined financial review');
    await lab.review(user,combinedId,{...review('movable_assets',{...amount,account_type:'simple_ira',route:'trustee_transfer',destination_type:'traditional_ira',tax_treatment:'traditional',first_contribution_on:'2024-10-02'}),identity_signature:combinedIdentity});
    const combined=await lab.detail(user,combinedId);
    assert.equal(combined.quality.status,'verified');
    assert.equal(combined.quality.gates.retirement.evidence.field,'movable_assets');
    assert.equal(combined.quality.gates.movable_assets.evidence.value.first_contribution_on,'2024-10-02');
    assert.equal((await lab.advisor.detail(user,combinedId)).action.bucket,'ready');
    const observations=(await db.query('SELECT field FROM lab_observations WHERE lead_id=$1',[combinedId])).rows;
    assert.equal(observations.filter(o=>o.field==='retirement').length,0,'no duplicated or fabricated observation stored');

  }finally{await db.close();}
});


test('one complete amount review supplies transfer evidence only without a separate review',()=>{
  const context=base().filter(o=>o.field!=='retirement'), disclosed=review('movable_assets',amount);
  const pending=assess(context);
  assert.deepEqual(pending.gaps,['movable_assets','retirement']);
  const complete=assess([...context,disclosed]);
  assert.equal(complete.status,'verified');
  assert.equal(complete.gates.retirement.evidence,disclosed,'retain actual field, source and review provenance');
  assert.match(complete.gates.retirement.reason,/retained-assets review/);
  for(const change of [{observed_at:'2025-01-01'},{observed_at:'2027-01-01'},{identity_signature:'different'},{value:{...amount,consent_confirmed:false}},{value:{...amount,lower_bound_usd:99999}}]) {
    assert.notEqual(assess([...context,{...disclosed,...change}]).gates.retirement.state,'confirmed');
  }
  for(const separate of [
    {...review('retirement',transfer),verdict:'unknown',value:null},
    {...review('retirement',transfer),verdict:'rejected',value:null},
    {...review('retirement',transfer),observed_at:'2025-01-01'},
    {...review('retirement',transfer),identity_signature:'different'},
  ]) assert.notEqual(assess([...context,disclosed,separate]).status,'verified','separate review cannot be bypassed');
  assert.notEqual(assess([...context,disclosed,review('retirement',{...transfer,account_type:'403b'})]).status,'verified');
  assert.notEqual(assessLead(lead,[...context,disclosed],{now}).gates.retirement.state,'confirmed','legacy criteria unchanged');
  assert.equal(assessLead({...lead,suppressed:true},[...context,disclosed],{now,target:'rollover_100k'}).status,'excluded');
});


test('traditional SEP and SIMPLE transfers require explicit tax treatment and dated eligibility',()=>{
 const ira={...amount,route:'trustee_transfer',destination_type:'traditional_ira',tax_treatment:'traditional'};
 assert.equal(review('movable_assets',{...ira,account_type:'sep_ira'}).value.tax_treatment,'traditional');
 for(const tax_treatment of [undefined,'','roth'])assert.throws(()=>review('movable_assets',{...ira,account_type:'sep_ira',tax_treatment}));
 const simple={...ira,account_type:'simple_ira',first_contribution_on:'2024-10-02'};
 assert.equal(review('movable_assets',simple).value.first_contribution_on,'2024-10-02');
 for(const change of [{first_contribution_on:'2024-10-03'},{first_contribution_on:'2024-02-30'},{first_contribution_on:''},{first_contribution_on:'2027-01-01'},{tax_treatment:'roth'},{destination_type:'roth_ira'}])assert.throws(()=>review('movable_assets',{...simple,...change}));
 assert.throws(()=>validateObservation({...review('movable_assets',simple),observed_at:'2026-10-01'},{userId:'owner',identity:leadIdentity(lead),now}),'eligibility is checked at observation, not the later review day');
 const context=base().filter(o=>o.field!=='retirement');
 assert.equal(assess([...context,review('movable_assets',simple)]).status,'verified');
 assert.notEqual(assess([...context,review('retirement',simple),review('movable_assets',{...simple,first_contribution_on:'2024-09-01'})]).status,'verified','different participation facts require reconciliation');
});
