import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationGuidance} from '../advisor-conversation-guidance.mjs';
const quality={status:'incomplete',gates:{contact:{state:'confirmed'}}};
const action={bucket:'ready',contact:{channel:'email',address:'synthetic@example.com'},reason:'Review the saved evidence.'};

test('generic coaching has objective, permission-based language, discovery, objections and capture without claiming financial facts',()=>{
  const before=JSON.stringify({action,quality}),guide=conversationGuidance(action,quality);
  assert.equal(guide.status,'prepare');
  assert.match(guide.label,/Draft.*firm review required/);
  assert.match(guide.notice,/not financial advice/);
  assert.match(guide.opening,/\[your name\].*\[firm\].*Is now a suitable time/);
  assert.equal(guide.questions.length,3);assert.equal(guide.objections.length,3);
  assert.match(guide.objections[2].action,/do not schedule another approach/);
  assert.match(guide.capture.join(' '),/Confirm or clear any suggested follow-up/);
  assert.match(guide.capture.join(' '),/Do not record account numbers/);
  assert.doesNotMatch(JSON.stringify(guide),/synthetic@example.com|\$100|your recent|you qualify|guaranteed/);
  assert.equal(JSON.stringify({action,quality}),before,'generation must not mutate the current action or evidence');
  guide.questions.push('consumer edit');assert.equal(conversationGuidance(action,quality).questions.length,3);
});

test('closed, client and excluded records never receive a guide',()=>{
  assert.equal(conversationGuidance(null,quality),null);
  for(const bucket of ['closed','clients'])assert.equal(conversationGuidance({...action,bucket},quality),null);
  assert.equal(conversationGuidance(action,{...quality,status:'excluded'}),null);
});

test('missing review, identity conflicts, pacing holds and later work expose preparation reason without scripts or capture',()=>{
  const cases=[
    [{...action,contact:null},quality], [action,undefined],
    [action,{...quality,status:'identity_review'}],
    ...['unknown','stale','failed'].map(state=>[action,{...quality,gates:{contact:{state}}}]),
    ...['review','enrich','resting','scheduled','unexpected'].map(bucket=>[{...action,bucket},quality]),
    [{...action,held:true},quality],
    ...['resting','capped','blocked'].map(status=>[{...action,cadence:{status}},quality]),
    [{...action,cadence:{step:{due:true,ready:false}}},quality],
  ];
  for(const [a,q] of cases){
    const guide=conversationGuidance(a,q);assert.equal(guide.status,'hold',JSON.stringify({a,q}));
    assert.equal(guide.reason,a.reason);assert.equal(guide.opening,undefined);assert.equal(guide.questions,undefined);assert.equal(guide.capture,undefined);
  }
});

test('existing ready, due and meeting workflow gates can expose coaching without inferring financial qualification',()=>{
  for(const bucket of ['ready','due','meetings'])assert.equal(conversationGuidance({...action,bucket},quality).status,'prepare');
});

test('actual meeting actions still honor authoritative cadence omitted from nextAction result',async()=>{
  const {nextAction}=await import('../advisor-workflow.mjs');
  const {assessLead}=await import('../lead-quality.mjs');
  const now=new Date('2026-11-15T12:00:00Z');
  const lead={id:'meeting',first_name:'Synthetic',last_name:'Example',company:'Example Co',email:'synthetic@example.com',follow_up_status:'Meeting Set'};
  const assessed=assessLead(lead,[],{now});
  assessed.gates.contact={state:'confirmed',evidence:{value:action.contact}};
  for(const cadence of [{status:'resting'},{status:'capped'},{status:'blocked'},{status:'active',step:{due:true,ready:false}}]){
    const meeting=nextAction(lead,assessed,now,cadence);
    assert.equal(meeting.bucket,'meetings');assert.equal(meeting.cadence,undefined);
    const guide=conversationGuidance(meeting,assessed,cadence);
    assert.equal(guide.status,'hold');assert.equal(guide.opening,undefined);
  }
});
