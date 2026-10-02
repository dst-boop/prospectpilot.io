import test from 'node:test';
import assert from 'node:assert/strict';
import {compareIdentity,chooseIdentityMatch} from '../identity-resolution.mjs';
import {createLead,addEvidence,evidenceSummary,estimateAge,scoreProspect} from '../prospect-core.mjs';

const person={first_name:'QA',last_name:'Example'};
const now=new Date('2026-09-27T12:00:00Z');

test('name-only and employer-context matches never auto-confirm a person',()=>{
  assert.equal(compareIdentity(person,person).outcome,'unresolved');
  assert.equal(chooseIdentityMatch(person,[{...person,id:'existing'}]).outcome,'review');
  const contextual={...person,company:'Example Co',current_title:'Director',city:'Albany',state:'NY',business_phone:'2125550100'};
  assert.equal(compareIdentity(contextual,contextual).outcome,'probable');
  const shared={...person,business_email:'info@example.com'};
  assert.equal(compareIdentity(shared,shared).outcome,'probable');
});

test('mailbox punctuation and international phone suffixes remain distinct',()=>{
  assert.notEqual(compareIdentity({...person,business_email:'a.b@example.com'},{...person,business_email:'a-b@example.com'}).outcome,'confirmed');
  assert.notEqual(compareIdentity({...person,mobile:'+442079460000'},{...person,mobile:'2079460000'}).outcome,'confirmed');
  assert.notEqual(compareIdentity({...person,mobile:'+4930555010'},{...person,mobile:'4930555010'}).outcome,'confirmed');
  assert.notEqual(compareIdentity({...person,mobile:'212+5550100'},{...person,mobile:'2125550100'}).outcome,'confirmed');
  assert.notEqual(compareIdentity({...person,mobile:'123'},{...person,mobile:'123'}).outcome,'confirmed');
  assert.equal(compareIdentity({...person,mobile:'(212) 555-0100'},{...person,mobile:'+12125550100'}).outcome,'confirmed');
});

test('profile tracking parameters normalize, but conflicting profiles require review',()=>{
  const a={...person,business_email:'qa@example.com',linkedin_url:'https://www.linkedin.com/in/qa-example/?trk=source'};
  const b={...person,business_email:'QA@example.com',linkedin_url:'https://linkedin.com/in/qa-example'};
  assert.equal(compareIdentity(a,b).outcome,'confirmed');
  const conflicting=compareIdentity(a,{...b,linkedin_url:'https://linkedin.com/in/different-person'});
  assert.equal(conflicting.hard_conflict,true);
  assert.equal(conflicting.outcome,'unresolved');
  assert.equal(chooseIdentityMatch(a,[{...b,id:'one'},{...b,id:'two'}]).outcome,'review');
});

test('repeated imported claims cannot become verified through confidence accumulation',()=>{
  const observations=Array.from({length:5},(_,i)=>({id:'copy-'+i,field:'age',value:61,source_type:'user_import',status:'verified',source_url:`https://example.com/copy-${i}`}));
  const age=evidenceSummary(observations).resolved.age;
  assert.equal(age.status,'reported');
  assert.equal(age.confidence,0.6);
  const official=evidenceSummary([{field:'age',value:61,source_type:'sec_filing'}]).resolved.age;
  assert.equal(official.status,'reported','source reputation is not a review');
});

test('inferred and unsupported ages are never labeled verified',()=>{
  const inferred=addEvidence(createLead(person,{now}),{field:'age',value:61,source_type:'inferred',status:'verified'},{now});
  assert.equal(estimateAge(inferred,{asOf:now}).status,'inferred');
  assert.deepEqual(estimateAge(inferred,{asOf:now}).basis,['inferred age']);
  const raw=estimateAge(createLead({...person,exact_age:61},{now}),{asOf:now});
  assert.equal(raw.status,'reported');assert.equal(raw.confidence,0.5);
  const reviewed=addEvidence(createLead(person,{now}),{field:'age',value:61,source_type:'sec_filing',status:'verified'},{now});
  assert.equal(estimateAge(reviewed,{asOf:now}).status,'verified');
});

test('conflicting ages remain a range and earn no age qualification points',()=>{
  let lead=createLead(person,{now});
  for(const age of [61,44])lead=addEvidence(lead,{field:'age',value:age,source_type:'sec_filing',status:'verified'},{now});
  const estimate=estimateAge(lead,{asOf:now});
  assert.equal(estimate.status,'conflicting');assert.equal(estimate.min,44);assert.equal(estimate.max,61);
  assert.equal(estimate.confidence,0);assert.equal(scoreProspect(lead,{asOf:now}).explanation.age55,0);
});

test('conflicting graduation years are not silently used to infer age',()=>{
  let lead=createLead(person,{now});
  for(const year of [1988,2010])lead=addEvidence(lead,{field:'graduation_year',value:year,source_type:'university'},{now});
  assert.equal(estimateAge(lead,{asOf:now}).min,null);
});

test('an explicit unresolved conflict is preserved even without its competing observation',()=>{
  const lead=addEvidence(createLead(person,{now}),{field:'age',value:61,source_type:'inferred',status:'conflicting'},{now});
  assert.equal(evidenceSummary(lead.evidence).resolved.age.status,'conflicting');
  assert.equal(estimateAge(lead,{asOf:now}).status,'conflicting');
  assert.equal(scoreProspect(lead,{asOf:now}).explanation.age55,0);
});


test('missing imported ages stay null instead of becoming zero',()=>{
 for(const value of [undefined,null,'',' ',false,true,[],[61],{},NaN,Infinity,-1,121]){
  const lead=createLead({...person,exact_age:value,estimated_age_min:value,estimated_age_max:value},{now});
  for(const field of ['exact_age','estimated_age_min','estimated_age_max'])assert.equal(lead[field],null);
 }
 assert.equal(createLead({...person,exact_age:'61'},{now}).exact_age,61);
});

test('contradictory career and graduation clues receive no age credit',()=>{
 const lead={...createLead(person,{now}),graduation_year:2015,career_start_year:1980};
 const age=estimateAge(lead,{asOf:now});
 assert.equal(age.status,'conflicting');assert.equal(age.confidence,0);
 assert.equal(age.basis.length,2,'both provenance clues remain visible');
 assert.equal(scoreProspect(lead,{asOf:now}).explanation.age55,0);
 for(const fields of [{graduation_year:2030},{career_start_year:2030},{employment_history:[{start_year:2030}]}]){
  const result=estimateAge({...createLead(person,{now}),...fields},{asOf:now});
  assert.equal(result.min,null);assert.equal(result.max,null);assert.equal(result.confidence,0);
 }
});
