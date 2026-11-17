import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLead, leadIdentity, leadScores, researchCSV, validateObservation} from '../lead-quality.mjs';
import {nextAction} from '../advisor-workflow.mjs';
import {cadenceState} from '../outreach-cadence.mjs';
import {ADVICE_TARGET} from '../opportunity-policy.mjs';

const now = new Date('2026-11-16T15:00:00Z');
const person = {id:'synthetic',first_name:'Jordan',last_name:'Example',company:'Example Works',current_title:'Engineer',
  state:'NY',email:'jordan@example.test',estimated_age_range:'35',estimated_assets:{low:30000}};
const review = (field,value,{lead=person,at='2026-11-15',verdict='confirmed',url=''}={}) => validateObservation({field,value,
  verdict,source:'Synthetic QA fixture',note:'Fictional evidence.',observed_at:at,url}, {now,userId:'advisor',identity:leadIdentity(lead)});
const decision = (origin='inbound_request',decision_by='2026-11-30') => ({origin,topic:'retirement_income',decision_by,
  identity_confirmed:true,prospect_confirmed:true});
const residence = (lead=person) => review('residence',{country:'US',scope:'residence',state:'NY'},{lead});
const contact = (lead=person,basis='person_requested') => review('contact',{channel:'email',address:lead.email,identity_confirmed:true,
  outreach_basis:basis},{lead});
const publicEvent = (lead=person,event_date='2026-11-10') => review('personal_event',{type:'plan_termination',event_date,
  identity_confirmed:true,identity_basis:'Employer and documented professional identifier.'},{lead,url:'https://example.test/notice'});
const assess = (lead,rows,plans=[]) => assessLead(lead,rows,{target:ADVICE_TARGET,now,plans});

test('qualification follows a person-confirmed decision and reviewed route across ages and balances',()=>{
  const rows = [review('planning_decision',decision()),residence(),contact()];
  for (const age of ['33','82','']) {
    const lead = {...person,estimated_age_range:age};
    const quality = assess(lead,rows);
    assert.equal(quality.status,'verified');
    assert.equal(quality.gates.retirement.state,'unknown');
    assert.equal(quality.score,100);
    assert.equal(nextAction(lead,quality,now).label,'Respond to the advice request');
    assert.equal(leadScores(lead,quality,{now}).opportunity.score,100);
  }
  assert.throws(()=>review('planning_decision',{...decision(),prospect_confirmed:false}),{status:422});
  assert.throws(()=>review('planning_decision',decision('inbound_request','2026-11-31')),{status:422});
  assert.throws(()=>review('planning_decision',decision('vendor_inference')),{status:422});
});

test('plan records, imported assets and public events create research context only',()=>{
  const lead = {...person,email:''};
  const plans = [{average_account_balance:900000,participants_with_balances:5000}];
  let quality=assess(lead,[residence(lead)],plans);
  assert.equal(quality.status,'incomplete');
  assert.equal(nextAction(lead,quality,now).bucket,'review');
  quality=assess(lead,[residence(lead),publicEvent(lead)],plans);
  assert.equal(quality.status,'promising');
  assert.equal(quality.gates.retirement.state,'unknown');
  assert.equal(leadScores(lead,quality,{now}).opportunity.score,0);
  assert.equal(nextAction(lead,quality,now).bucket,'enrich');
  const closed = review('planning_decision',null,{lead,verdict:'rejected'});
  assert.equal(nextAction(lead,assess(lead,[residence(lead),publicEvent(lead),closed]),now).bucket,'review');
});

test('changed identity, expired permission, shared contacts and DNC remove contact and qualified export data',()=>{
  const intent=review('planning_decision',decision());
  for (const [lead,rows] of [
    [{...person,identity_status:'review'},[intent,residence(),contact()]],
    [{...person,last_name:'Changed'},[intent,residence(),contact()]],
    [{...person,suppressed:true},[intent,residence(),contact()]],
    [person,[intent,residence(),contact(person,'')]],
    [person,[intent,residence(),{...contact(),observed_at:'2026-08-01'}]],
    [{...person,imported_dnc:['212-555-0199']},[intent,residence(),review('contact',{
      channel:'phone',address:'2125550199',identity_confirmed:true,outreach_basis:'person_requested'})]],
    [person,[intent,residence(),review('contact',{
      channel:'email',address:'info+old@example.test',identity_confirmed:true,outreach_basis:'firm_cleared'})]],
  ]) {
    const quality=assess(lead,rows);
    assert.notEqual(quality.status,'verified');
    const action=nextAction(lead,quality,now);
    assert.equal(action.contact,null);
    assert.doesNotMatch(researchCSV([{lead,quality}]),/jordan@example|5550199|info\+old/);
  }
});

test('worklist uses commitments, requests, accepted introductions and stated decision windows',()=>{
  const action = (value,extra={},clock=now) => {
    const lead={...person,...extra};
    const quality=assessLead(lead,[review('planning_decision',value),residence(),contact()],{target:ADVICE_TARGET,now:clock});
    return nextAction(lead,quality,clock);
  };
  const promised=action(decision(),{follow_up_status:'Follow-up',follow_up_date:'2026-11-16T13:00:00Z'});
  const inbound=action(decision());
  const introduction=action(decision('accepted_introduction'));
  const short=action(decision('confirmed_conversation'));
  const longer=action(decision('confirmed_conversation','2027-01-10'));
  assert.deepEqual([promised,inbound,introduction,short,longer].map(item=>item.rank),[0,2,4,6,10]);
  assert.equal(inbound.decision_by,'2026-11-30');
  assert.equal(inbound.due_at,null);
  assert.equal(action(decision('confirmed_conversation','2027-04-01')).bucket,'scheduled');
  assert.equal(action(decision('inbound_request','2026-11-16')).bucket,'ready');
  assert.equal(action(decision('inbound_request','2026-11-15')).bucket,'review');
  const rows=[review('planning_decision',decision()),residence()];
  assert.equal(nextAction(person,assess(person,rows),now).rank,2,'pending permission still prompts a timely review');
});

test('a first-party request follows the cleared channel and approved calling window',()=>{
  const quality = assess(person,[review('planning_decision',decision()),residence(),contact()]);
  const cadence = cadenceState({lead:person,quality,now,dials:{spent:true,reason:'Dial budget spent.'}});
  assert.equal(nextAction(person,quality,now,cadence).contact.channel,'email');
  const phone = review('contact',{channel:'phone',address:'2125550199',identity_confirmed:true,outreach_basis:'person_requested'});
  const phoneQuality = assess(person,[review('planning_decision',decision()),residence(),phone]);
  const held = cadenceState({lead:person,quality:phoneQuality,now,dials:{spent:true,reason:'Dial budget spent.'}});
  assert.equal(nextAction(person,phoneQuality,now,held).held,true);
  assert.equal(nextAction(person,phoneQuality,now,held).contact,null);
});
