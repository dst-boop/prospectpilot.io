import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {assessLead,leadScores,scoreWeights,DEFAULT_SCORE_WEIGHTS} from '../lead-quality.mjs';
import {createResearchLab,labConfiguration} from '../research-lab.mjs';

// Four scores, each built from named factors, and a priority whose formula the
// advisor sets. None of them turns employer plans or titles into wealth.
const now=new Date('2026-09-28T15:00:00Z');
const base={first_name:'Jamie',last_name:'Rivera',company:'Example Manufacturing',current_title:'Vice President',country:'US',state:'TX',source_names:['ZoomInfo CSV'],updated_at:'2026-09-01T00:00:00Z'};
const gate=(state,extra={})=>({state,reason:'',evidence:null,...extra});
const confirmed=(lead,overrides={})=>{const q=assessLead(lead,[],{now});return {...q,status:'verified',gates:{age:gate('confirmed'),residence:gate('confirmed'),contact:gate('confirmed'),net_worth:gate('confirmed'),
  retirement:gate('confirmed',{evidence:{value:{route:'separated'}}}),...overrides}};};

test('each score is the sum of its named factors',()=>{
  const lead={...base,email:'jamie@example.com',linkedin_url:'https://www.linkedin.com/in/jamie-rivera',phone:'+12125550199'};
  const s=leadScores(lead,confirmed(lead),{now});
  for(const key of ['qualification','opportunity','confidence','contactability'])
    assert.equal(s[key].score,Math.min(100,s[key].factors.reduce((a,f)=>a+f.points,0)),key);
  assert.equal(s.qualification.score,100);assert.equal(s.opportunity.score,100);assert.equal(s.contactability.score,100);
  assert.equal(s.confidence.score,100,'anchored, licensed source, no disagreement, seen within 180 days');
  assert.equal(s.priority.score,100);assert.equal(s.priority.formula,'(4×Qualification + 3×Opportunity + 1×Data confidence + 2×Contactability) ÷ 10');
});

test('employer plans and titles never add opportunity',()=>{
  const lead={...base,current_title:'Chief Executive Officer',former_employers:['Big Pension Co']};
  const quality=assessLead(lead,[],{now,plans:[{sponsor:'Example Manufacturing',net_assets:5e9}]});
  assert.equal(quality.gates.retirement.state,'candidate','a plan is a lead to check');
  const s=leadScores(lead,quality,{now});
  assert.equal(s.opportunity.score,0);
  assert.match(s.opportunity.basis,/never count/);
  assert.equal(s.qualification.factors.find(f=>/Retirement/.test(f.label)).points,5,'the plan only marks a lead to check');
});

test('an in-service route counts only with plan permission',()=>{
  const q=confirmed(base,{retirement:gate('confirmed',{evidence:{value:{route:'in_service',plan_permission:false}}})});
  const s=leadScores(base,q,{now});
  assert.equal(s.opportunity.factors.at(-1).points,0);assert.match(s.opportunity.factors.at(-1).detail,/permission/);
  const ok=leadScores(base,confirmed(base,{retirement:gate('confirmed',{evidence:{value:{route:'in_service',plan_permission:true}}})}),{now});
  assert.equal(ok.opportunity.factors.at(-1).points,10);
});

test('disagreeing sources, stale records and identity conflicts lower confidence',()=>{
  const lead={...base,updated_at:'2024-01-01T00:00:00Z',source_names:['News article'],field_values:{current_title:[{value:'Director',source:'News article',last_seen:'2024-01-01T00:00:00Z'},{value:'Plant Manager',source:'Web search',last_seen:'2024-01-02T00:00:00Z'}]}};
  const s=leadScores(lead,assessLead(lead,[],{now}),{now});
  const by=Object.fromEntries(s.confidence.factors.map(f=>[f.label,f]));
  assert.equal(by['Identified by LinkedIn or a personal email'].points,0);
  assert.equal(by['Strongest source'].detail,'News article');assert.equal(by['Strongest source'].points,8);
  assert.equal(by['Sources agree'].points,15);assert.match(by['Sources agree'].detail,/current title/);
  assert.equal(by['Recently seen'].points,0);
  const held=leadScores({...base,email:'jamie@example.com'},{...confirmed(base),status:'identity_review'},{now});
  assert.equal(held.confidence.score,40);assert.match(held.confidence.basis,/Held at 40/);
});

test('a restriction ends contactability, an exclusion ends priority, and mobile numbers are flagged',()=>{
  const lead={...base,mobile_phone:'+12125550199',email:'jamie@example.com'};
  const open=leadScores(lead,assessLead(lead,[],{now}),{now});
  assert.equal(open.contactability.score,40);assert.match(open.contactability.factors.find(f=>f.label==='Phone on file').detail,/stricter/);
  const blocked=leadScores({...lead,suppressed:true},assessLead({...lead,suppressed:true},[],{now}),{now});
  assert.equal(blocked.contactability.score,0);assert.equal(blocked.priority.score,0);
  const equitable=leadScores({...lead,company:'Equitable Holdings'},assessLead({...lead,company:'Equitable Holdings'},[],{now}),{now});
  assert.equal(equitable.priority.score,0);assert.match(equitable.qualification.basis,/Equitable/);
});

test('weights are the advisor\'s: bounded, defaulted, and shown in the formula',()=>{
  assert.deepEqual(scoreWeights({qualification:'7',opportunity:-1,confidence:11,contactability:2.5}),{qualification:7,opportunity:3,confidence:1,contactability:2});
  assert.deepEqual(scoreWeights({qualification:0,opportunity:0,confidence:0,contactability:0}),DEFAULT_SCORE_WEIGHTS,'all zero would divide by zero');
  const lead={...base,email:'jamie@example.com'};
  const q=confirmed(lead,{net_worth:gate('unknown'),retirement:gate('unknown'),age:gate('unknown')});
  const onlyContact=leadScores(lead,q,{now,weights:{qualification:0,opportunity:0,confidence:0,contactability:1}});
  assert.equal(onlyContact.priority.score,onlyContact.contactability.score);assert.equal(onlyContact.priority.formula,'(1×Contactability) ÷ 1');
  assert.deepEqual(labConfiguration({score_weights:{qualification:9}}).score_weights,{...DEFAULT_SCORE_WEIGHTS,qualification:9});
});

test('the lead detail carries the scores with the saved formula',async()=>{
  const db=new PGlite();
  try{
    for(const file of readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1)))
      await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const lab=createResearchLab({pool,now:()=>now,sources:{readiness:{}}}),user={uid:'owner',email:'owner@example.com'};
    await lab.importCSV(user,{csv:'First Name,Last Name,Company,Title,Email,State,Country\nJamie,Rivera,Example Manufacturing,Director,jamie@example.com,TX,US'});
    const id=(await db.query('SELECT id FROM discovery_leads')).rows[0].id;
    const before=await lab.detail(user,id);
    assert.equal(before.scores.priority.weights.qualification,4);
    await lab.settings(user,{configuration:{score_weights:{qualification:0,opportunity:0,confidence:0,contactability:5}}});
    const after=await lab.detail(user,id);
    assert.equal(after.scores.priority.score,after.scores.contactability.score);
    assert.equal(after.scores.priority.formula,'(5×Contactability) ÷ 5');
  }finally{await db.close();}
});

test('within a worklist group the advisor\'s formula decides the order',async()=>{
  const db=new PGlite();
  try{
    for(const file of readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1)))
      await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const lab=createResearchLab({pool,now:()=>now,sources:{readiness:{}}}),user={uid:'owner',email:'owner@example.com'};
    // Reachable but weakly sourced, against well sourced but unreachable.
    await lab.importCSV(user,{source:'Web search',csv:'First Name,Last Name,Company,Email,Phone,State,Country\nAlex,Reach,Alpha Co,alex@alpha.example,+12125550100,NY,US'});
    await lab.importCSV(user,{source:'ZoomInfo CSV',csv:'First Name,Last Name,Company,LinkedIn URL,State,Country\nBlair,Sourced,Beta Co,https://www.linkedin.com/in/blair-sourced,NY,US'});
    const order=async weights=>{await lab.settings(user,{configuration:{score_weights:weights}});return (await lab.advisor.worklist(user,{view:'all'})).items.map(i=>i.lead.first_name);};
    assert.deepEqual(await order({qualification:0,opportunity:0,confidence:0,contactability:1}),['Alex','Blair']);
    assert.deepEqual(await order({qualification:0,opportunity:0,confidence:1,contactability:0}),['Blair','Alex']);
    const [item]=(await lab.advisor.worklist(user,{view:'all'})).items;
    assert.deepEqual(Object.keys(item.scores),['priority','qualification','opportunity','confidence','contactability']);
  }finally{await db.close();}
});
