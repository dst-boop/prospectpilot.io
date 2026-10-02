import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRollover,sourcingPlan} from '../scripts/daily-leads/rollover.mjs';
import {candidatesFromSearch} from '../scripts/daily-leads/engine.mjs';
const today='2026-09-30', person_id='101';
const ev=(kind,extra={})=>({kind,person_id,source_ref:'https://example.com/fixture',observed_at:today,...extra});
const assess=rows=>assessRollover({person_id,rollover_evidence:rows},{today});
const money=extra=>ev('movable_assets',{lower_bound_usd:100000,source_type:'participant_disclosure',authorized:true,assets_retained:true,eligibility_confirmed:true,account_type:'401k',route:'direct_rollover',distribution_reason:'separated',individual:true,consent_confirmed:true,amount_scope:'eligible_retained_assets',...extra});
test('events and preferred alumni never establish assets or age',()=>{
 const r=assess([ev('job_change'),ev('layoff'),ev('graduation',{year:1977,school:'Fictional University'})]);
 assert.equal(r.status,'research_candidate');assert.equal(r.alumni_preference,true);assert.equal(r.financial_status,'unconfirmed');
 assert.ok(!r.signals.some(s=>s.kind==='in_service'));
 assert.equal(assess([ev('graduation',{year:1990,school:'Example'})]).alumni_preference,true);
 assert.equal(assess([ev('graduation',{year:1991,school:'Example'})]).alumni_preference,false);
});
test('100k requires authorized eligible assets, not provider estimates',()=>{
 assert.equal(assess([money()]).status,'confirmed_target');
 for(const change of [{lower_bound_usd:99999},{source_type:'provider_estimate'},{authorized:false},{assets_retained:false},{eligibility_confirmed:false},{account_type:'nongovernmental_457b'},{observed_at:'2027-01-01'},{person_id:'102'},{source_ref:''}])
  assert.notEqual(assess([money(change)]).status,'confirmed_target',JSON.stringify(change));
 assert.notEqual(assess([money({lower_bound_usd:60000}),money({lower_bound_usd:60000})]).status,'confirmed_target','duplicate amounts are not added');
});
test('plan permission, SIMPLE restrictions and financial conflicts require review',()=>{
 assert.notEqual(assess([money({route:'in_service'})]).status,'confirmed_target');
 assert.equal(assess([money({route:'in_service',plan_permission:true})]).status,'confirmed_target');
 assert.notEqual(assess([money({account_type:'simple_ira',route:'trustee_transfer'})]).status,'confirmed_target');
 assert.notEqual(assess([money({account_type:'simple_ira',route:'trustee_transfer',two_year_rule_reviewed:true})]).status,'confirmed_target','unsupported account review cannot be replaced by one boolean');
 assert.equal(assess([money(),money({conflict:true})]).financial_status,'conflict');
 assert.equal(assess([money(),money({lower_bound_usd:200000})]).financial_status,'conflict');
 assert.equal(assessRollover({person_id,suppressed:true,rollover_evidence:[money()]},{today}).status,'excluded');
});
test('source plan covers employer, IRA, age and optional alumni routes without spending',()=>{
 const p=sourcingPlan({employers:['Example','Example'],schools:['Fictional University'],today});
 assert.deepEqual(p.tasks.map(t=>t.lane),['job_change','layoff','acquisition','alumni','ira_transfer','in_service']);
 assert.equal(p.target.minimum_movable_usd,100000);assert.equal(p.tasks[3].infer_age,false);
 assert.match(p.execution,/Plan only/);
});
test('a scoop cannot be attached to a different provider ID through a matching name',()=>{
 const signal={type:'Left company',why:'A fictional departure'};
 const [c]=candidatesFromSearch({meta:{tier:'A'},response:{data:[{id:'102',attributes:{firstName:'Alex',lastName:'Example'}}]}},new Map([['101',signal]]),new Map([['alex|example',signal]]));
 assert.notEqual(c.tier,'A');assert.notEqual(c.signal.why,signal.why);
});


test('equal balances cannot hide conflicting account, route or eligibility evidence',()=>{
 for(const change of [{account_type:'403b'},{route:'trustee_transfer'},{destination_type:'roth_ira'},{assets_retained:false},{eligibility_confirmed:false}]){
  for(const rows of [[money(),money(change)],[money(change),money()]]){
   const result=assess(rows);
   assert.equal(result.financial_status,'conflict',JSON.stringify(change));
   assert.notEqual(result.status,'confirmed_target');
   assert.ok(!result.signals.some(s=>s.kind==='confirmed_assets'));
  }
 }
 assert.equal(assess([money(),money({source_ref:'https://example.com/second'})]).financial_status,'confirmed_100k_plus','corroborating equivalent disclosures are not conflicts');
});

test('daily financial evidence expires after the same 180-day window as app qualification',()=>{
 const date=days=>new Date(Date.parse(today)-days*86400000).toISOString();
 assert.equal(assess([money({observed_at:date(180)})]).status,'confirmed_target');
 assert.notEqual(assess([money({observed_at:date(181)})]).status,'confirmed_target');
 assert.equal(assess([money(),money({conflict:true,observed_at:date(181)})]).status,'confirmed_target','expired conflicts have the same freshness window');
 assert.equal(assess([money(),money({account_type:'403b',observed_at:date(181)})]).status,'confirmed_target');
 assert.equal(assess([ev('job_change',{observed_at:date(181)})]).status,'research_candidate','career context retains its separate window');
});


test('daily financial confirmation uses the app account, consent and eligibility requirements',()=>{
 for(const change of [{individual:undefined},{consent_confirmed:undefined},{amount_scope:undefined},{distribution_reason:undefined},{route:'trustee_transfer'},{account_type:'sep_ira'},{account_type:'simple_ira',two_year_rule_reviewed:true}]){
  assert.notEqual(assess([money(change)]).status,'confirmed_target',JSON.stringify(change));
 }
 for(const account_type of ['traditional_ira','rollover_ira','roth_ira']){
  const destination_type=account_type==='roth_ira'?'roth_ira':'traditional_ira';
  assert.equal(assess([money({account_type,route:'trustee_transfer',destination_type})]).status,'confirmed_target');
  assert.notEqual(assess([money({account_type,route:'trustee_transfer',destination_type:destination_type==='roth_ira'?'traditional_ira':'roth_ira'})]).status,'confirmed_target');
 }
});
