import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLead,validateObservation,leadIdentity,linkedinURL,candidateKeys,researchCSV} from '../lead-quality.mjs';
const now=new Date('2026-09-07T12:00:00Z');
const lead={id:'l',first_name:'Jamie',last_name:'Rivera',company:'Example Manufacturing',email:'jamie@example.com',country:'US',estimated_age_range:'60-65',former_employers:['Previous Manufacturing']};
function evidence(field,value,verdict='confirmed') {return validateObservation({field,value:{...value,...(['retirement','net_worth'].includes(field)?{evidence_basis:'participant_disclosure',consent_confirmed:true}:{})},verdict,source:'Participant-provided evidence',note:'Reviewed information for this individual.',observed_at:now.toISOString()}, {userId:'owner',identity:leadIdentity(lead),now});}
const all=()=>[evidence('age',{min:60,max:60}),evidence('residence',{country:'US',scope:'residence'}),evidence('retirement',{account_type:'401k',route:'separated',assets_confirmed:true,eligible_distribution:true,individual:true}),evidence('contact',{channel:'email',address:lead.email,identity_confirmed:true}),evidence('net_worth',{lower_bound_usd:250000,excludes_home:true,net_of_liabilities:true})];
test('only reviewed evidence for all five gates qualifies; proxies never qualify',()=>{
  const inferred=assessLead({...lead,graduation_year:1988,estimated_assets:{low:1000000},plan_average_balance:2000000},[],{now,plans:[{net_assets:1000000000}]});assert.notEqual(inferred.status,'verified');assert.equal(inferred.score,20);
  assert.equal(assessLead(lead,all(),{now}).status,'verified');
  for(let i=0;i<5;i++)assert.notEqual(assessLead(lead,all().filter((_,j)=>j!==i),{now}).status,'verified');
});
test('ages 45 and 73 are inclusive; uncertain and stale evidence fail closed',()=>{
  const rows=all();
  for(const age of [44,74]){rows[0]=evidence('age',{min:age,max:age});assert.equal(assessLead(lead,rows,{now}).status,'excluded');}
  for(const age of [45,55,73]){rows[0]=evidence('age',{min:age,max:age});assert.equal(assessLead(lead,rows,{now}).status,'verified');}
  rows[0].observed_at='2026-09-01';assert.equal(assessLead(lead,rows,{now}).gates.age.state,'unknown');
  rows[0]=evidence('age',{min:44,max:60});assert.equal(assessLead(lead,rows,{now}).gates.age.state,'unknown');
  rows[0]=evidence('age',{min:56,max:56});assert.equal(assessLead(lead,rows,{now}).status,'verified');
  rows[2].observed_at='2025-01-01';assert.equal(assessLead(lead,rows,{now}).gates.retirement.state,'stale');
});
test('changed identity, suppression, future dates and excluded sources cannot produce verified leads',()=>{
  assert.notEqual(assessLead({...lead,last_name:'Other'},all(),{now}).status,'verified');
  assert.equal(assessLead({...lead,follow_up_status:'Do Not Contact'},all(),{now}).status,'excluded');
  assert.equal(assessLead({...lead,qualifier:{dnc_status:'BLOCKED'}},all(),{now}).status,'excluded');
  const rows=all();rows[0].observed_at='2030-01-01';assert.notEqual(assessLead(lead,rows,{now}).status,'verified');
  assert.throws(()=>validateObservation({...all()[0],source:'FEC contributor record'},{userId:'owner',identity:leadIdentity(lead),now}),/not enabled/);
});
test('in-service route needs plan permission; ineligible account types and office address fail',()=>{
  const retirement={account_type:'401k',route:'in_service',assets_confirmed:true,eligible_distribution:true,individual:true};
  assert.throws(()=>evidence('retirement',retirement),/permission/);
  assert.doesNotThrow(()=>evidence('retirement',{...retirement,plan_permission:true}));
  for(const account_type of ['nonqualified_457b','457f','brokerage','unknown'])assert.throws(()=>evidence('retirement',{...retirement,account_type,plan_permission:true}));
  assert.throws(()=>evidence('residence',{country:'US',scope:'office'}));
});
test('contact identity and URLs are validated; shared switchboards never deduplicate people',()=>{
  assert.equal(linkedinURL('https://www.linkedin.com/company/example'),'');assert.equal(linkedinURL('https://linkedin.com.evil.example/in/test'),'');
  assert.equal(linkedinURL('https://www.linkedin.com/in/Jamie-Rivera/?trk=search'),'https://www.linkedin.com/in/jamie-rivera');
  assert.throws(()=>evidence('contact',{channel:'email',address:'guessed@example.com',identity_confirmed:false}));
  const keys=candidateKeys({...lead,email:'info@example.com',phone:'2125551212'});assert.ok(!keys.some(k=>k.startsWith('email:')||k.startsWith('phone:')));
});
test('research CSV neutralizes spreadsheet formulas and carries qualification gaps',()=>{
  const row={lead:{...lead,first_name:'=HYPERLINK("evil")'},quality:assessLead(lead,[],{now})};const csv=researchCSV([row]);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('Missing Evidence'));assert.ok(csv.includes('Not a call list'));assert.ok(!csv.includes('verified"'));
});

test('IRA transfers support traditional, rollover and Roth accounts with matching destinations',()=>{
  for(const account_type of ['traditional_ira','rollover_ira','roth_ira']) {
    const value={account_type,route:'trustee_transfer',assets_confirmed:true,individual:true,eligible_distribution:true,destination_type:account_type==='roth_ira'?'roth_ira':'traditional_ira'};
    const rows=all();rows[2]=evidence('retirement',value);
    assert.equal(assessLead(lead,rows,{now}).status,'verified');
    assert.throws(()=>evidence('retirement',{...value,destination_type:value.destination_type==='roth_ira'?'traditional_ira':'roth_ira'}),/matching IRA/);
    assert.throws(()=>evidence('retirement',{...value,route:'separated'}));
  }
});

test('wealth requires consented disclosures, liabilities, home exclusion, and a sufficient lower bound',()=>{
  const rows=all();rows[4]=evidence('net_worth',{lower_bound_usd:249999,excludes_home:true,net_of_liabilities:true});
  assert.notEqual(assessLead(lead,rows,{now}).status,'verified');
  const valid=all()[4];
  for(const change of [{evidence_basis:'model_estimate'},{consent_confirmed:false},{excludes_home:false},{net_of_liabilities:false},{lower_bound_usd:null},{lower_bound_usd:''}]) {
    assert.throws(()=>validateObservation({...valid,value:{...valid.value,...change}},{userId:'owner',identity:leadIdentity(lead),now}));
  }
  const retirement=all()[2];delete retirement.value.evidence_basis;
  assert.notEqual(assessLead(lead,[...all().filter(o=>o.field!=='retirement'),retirement],{now}).status,'verified');
  const stale=all();stale[4].observed_at='2025-01-01';assert.equal(assessLead(lead,stale,{now}).gates.net_worth.state,'stale');
  assert.equal(assessLead(lead,all(),{now}).score,100);
});
