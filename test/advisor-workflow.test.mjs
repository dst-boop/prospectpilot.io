import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createResearchLab} from '../research-lab.mjs';
import {assessLead} from '../lead-quality.mjs';
import {nextAction,workflowSignature} from '../advisor-workflow.mjs';
test('directory DNC restrictions remain effective after handoff and after a later import',async()=>{
 const {db,lab,user}=await fixture();try{
  const contact={...lead,phone:'+12125550199',mobile_phone:'+12125550199',phone_origin:'mobile',phone_restrictions:{direct:null,mobile:false}};
  await db.query('INSERT INTO prospect_contacts(id,user_id,payload) VALUES($1,$2,$3::jsonb)',['dnc-contact',user.uid,JSON.stringify(contact)]);
  await lab.importContacts(user,{ids:['dnc-contact']});
  const id=(await db.query("SELECT lead_id FROM advisor_contact_links WHERE contact_id='dnc-contact'")).rows[0].lead_id;
  let detail=await lab.detail(user,id);
  await lab.review(user,id,{field:'contact',value:{channel:'phone',address:contact.phone,identity_confirmed:true},verdict:'confirmed',source:'Synthetic fixture',note:'Synthetic reviewed phone.',observed_at:now.toISOString(),identity_signature:detail.quality.identity_signature});
  assert.equal((await lab.advisor.detail(user,id)).action.contact.address,contact.phone);
  await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{phone_restrictions,mobile}','true') WHERE id='dnc-contact'");
  assert.equal((await lab.advisor.detail(user,id)).action.contact,null);
  const work=await lab.advisor.worklist(user,{view:'all'});assert.equal(work.items.find(r=>r.lead.id===id).action.contact,null);
  await lab.importContacts(user,{ids:['dnc-contact']});
  detail=await lab.detail(user,id);assert.ok(detail.lead.imported_dnc.length);assert.equal(detail.quality.gates.contact.state,'failed');
 }finally{await db.close();}
});
const now=new Date('2026-09-12T15:00:00Z');
const lead={id:'fixture',first_name:'Jamie',last_name:'Rivera',company:'Example Manufacturing',email:'jamie@example.com',estimated_age_range:'62',country:'US'};
const csv='First Name,Last Name,Company,Title,Email,Estimated Age Range,Country\nJamie,Rivera,Example Manufacturing,Director,jamie@example.com,62,US';
async function fixture(){const db=new PGlite();for(const file of ['generated/schema.sql','migrations/006-research-lab.sql','migrations/007-quality-v2.sql','migrations/008-prospect-workspace.sql','migrations/012-plan-catalog-summary.sql','migrations/013-advisor-workflow.sql','migrations/014-outreach-cadence.sql', 'migrations/015-dial-budget.sql', 'migrations/016-inbound-contact.sql','migrations/017-forget.sql'])await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};const user={uid:'owner',email:'owner@example.com'},lab=createResearchLab({pool,now:()=>now,sources:{readiness:{}}});await lab.importCSV(user,{csv});const id=(await lab.list(user)).leads[0].lead.id;return {db,lab,user,id};}
async function reviewBasics(lab,user,id){const d=await lab.detail(user,id);for(const [field,value] of Object.entries({age:{min:62,max:62},residence:{country:'US',scope:'residence'},contact:{channel:'email',address:'jamie@example.com',identity_confirmed:true}}))await lab.review(user,id,{field,value,verdict:'confirmed',source:'Synthetic authorized fixture',note:'Synthetic evidence only.',observed_at:now.toISOString(),identity_signature:d.quality.identity_signature});}
test('next actions never equate contact details or financial estimates with verified qualification',()=>{const q=assessLead(lead,[],{now});assert.equal(nextAction(lead,q,now).bucket,'review');assert.equal(nextAction(lead,q,now).contact,null);const noContact={...lead,email:''};assert.equal(nextAction(noContact,assessLead(noContact,[],{now}),now).bucket,'enrich');const dnc={...lead,suppressed:true,follow_up_date:'2026-09-01T12:00:00Z'};assert.equal(nextAction(dnc,assessLead(dnc,[],{now}),now).bucket,'closed');assert.equal(nextAction({...lead,follow_up_status:'Not a Fit'},q,now).bucket,'closed');});
test('worklist uses live evidence, prioritizes due work, and supports full-name search',async()=>{const {db,lab,user,id}=await fixture();try{await reviewBasics(lab,user,id);let work=await lab.advisor.worklist(user,{view:'ready',search:'Jamie Rivera'});assert.equal(work.total,1);assert.notEqual(work.items[0].quality.status,'verified');assert.equal(work.items[0].action.contact.address,'jamie@example.com');await db.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_date}','"2026-09-10T10:00:00Z"')::text WHERE id=$1`,[id]);work=await lab.advisor.worklist(user,{view:'due'});assert.equal(work.total,1);assert.equal(work.items[0].action.rank,0);await db.query(`UPDATE lab_observations SET payload=jsonb_set(payload,'{observed_at}','"2020-01-01"') WHERE lead_id=$1 AND field='contact'`,[id]);assert.equal((await lab.advisor.worklist(user,{view:'due'})).items[0].action.contact,null);assert.equal((await lab.advisor.worklist(user,{search:'missing'})).total,0);}finally{await db.close();}});
test('outcomes persist to legacy workflow, replay safely, detect conflicts, and enforce ownership',async()=>{const {db,lab,user,id}=await fixture();try{let detail=await lab.advisor.detail(user,id);const input={outcome:'follow_up',note:'Asked to discuss goals next week.',next_at:'2026-09-15T14:00:00Z',signature:detail.action.signature,idempotency_key:'follow-1'};await lab.advisor.save(user,id,input);assert.equal((await lab.advisor.save(user,id,input)).replayed,true);const saved=(await lab.detail(user,id)).lead;assert.equal(saved.follow_up_status,'Follow-up');assert.equal(saved.follow_up_date,new Date(input.next_at).toISOString());assert.match(saved.notes,/goals next week/);assert.equal((await lab.advisor.worklist(user,{view:'scheduled'})).total,1);assert.equal((await lab.advisor.detail(user,id)).activities.length,1);await assert.rejects(lab.advisor.save(user,id,{...input,idempotency_key:'stale'}),{status:409});const other={uid:'other',email:'other@example.com'};assert.equal((await lab.advisor.worklist(other)).total,0);await assert.rejects(lab.advisor.detail(other,id),{status:404});await assert.rejects(lab.advisor.save(other,id,input),{status:404});await assert.rejects(lab.advisor.exportEnrichment(other,{ids:[id]}),{status:404});detail=await lab.advisor.detail(user,id);await assert.rejects(lab.advisor.save(user,id,{...input,signature:detail.action.signature,idempotency_key:'bad-time',next_at:'2026-09-01'}),{status:422});assert.notEqual(detail.action.signature,input.signature);assert.equal(detail.action.signature,workflowSignature(saved));}finally{await db.close();}});
test('meeting metrics count people once and suppression removes shortcuts and exports without allowing reopening',async()=>{const {db,lab,user,id}=await fixture();try{await reviewBasics(lab,user,id);for(const n of [1,2]){const d=await lab.advisor.detail(user,id);await lab.advisor.save(user,id,{outcome:'meeting_booked',signature:d.action.signature,idempotency_key:'meeting-'+n,next_at:'2026-09-15T14:00:00Z'});}let work=await lab.advisor.worklist(user,{view:'meetings'});assert.equal(work.total,1);assert.equal(work.activity.meetings,1);assert.equal(work.activity.conversations,2);let d=await lab.advisor.detail(user,id);await lab.advisor.save(user,id,{outcome:'do_not_contact',signature:d.action.signature,idempotency_key:'dnc',note:'Asked not to be contacted.'});d=await lab.advisor.detail(user,id);assert.equal(d.action.contact,null);assert.equal(d.action.bucket,'closed');await assert.rejects(lab.advisor.save(user,id,{outcome:'reopen',signature:d.action.signature,idempotency_key:'cannot-reopen'}),{status:422});assert.equal((await lab.advisor.exportEnrichment(user,{ids:[id]})).headers.get('content-type'),'text/csv; charset=utf-8');assert.doesNotMatch(await (await lab.advisor.exportEnrichment(user,{ids:[id]})).text(),/Jamie/);await db.query('DELETE FROM discovery_leads WHERE id=$1',[id]);assert.equal((await db.query('SELECT * FROM advisor_activities')).rows.length,0);}finally{await db.close();}});
test('provider export contains only matching identifiers and research task, with spreadsheet formula protection',async()=>{const {db,lab,user,id}=await fixture();try{await db.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{first_name}','"=HYPERLINK(test)"')::text WHERE id=$1`,[id]);const response=await lab.advisor.exportEnrichment(user,{ids:[id]});const text=await response.text();assert.match(text,/"'=HYPERLINK/);assert.match(text,/Company Name/);assert.doesNotMatch(text,/lower_bound_usd|consent_confirmed|jamie@example.com/);}finally{await db.close();}});
test('directory handoff is owned and replay-safe; suppression stays effective in both workspaces',async()=>{const {db,lab,user,id}=await fixture();try{
 await db.query('INSERT INTO prospect_contacts(id,user_id,payload) VALUES($1,$2,$3::jsonb)',['contact',user.uid,JSON.stringify({...lead,title:'Director',source:'Synthetic professional export'})]);
 let result=await lab.importContacts(user,{ids:['contact']});assert.equal(result.linked,1);assert.equal((await lab.importContacts(user,{ids:['contact']})).replayed,true);
 const linked=(await db.query('SELECT lead_id FROM advisor_contact_links WHERE contact_id=$1',['contact'])).rows[0].lead_id;
 assert.deepEqual(result.lead_ids,[linked]);assert.deepEqual((await lab.importContacts(user,{ids:['contact']})).lead_ids,[linked]);
 await reviewBasics(lab,user,linked);assert.equal((await lab.advisor.detail(user,linked)).action.bucket,'ready');
 await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','true') WHERE id='contact'`);
 assert.deepEqual((await lab.importContacts(user,{ids:['contact']})).lead_ids,[]);
 assert.deepEqual((await lab.importContacts(user,{ids:['contact']})).lead_ids,[]);
 assert.equal((await lab.advisor.detail(user,linked)).action.contact,null);assert.equal((await lab.detail(user,linked)).quality.status,'excluded');
 const work=await lab.advisor.worklist(user,{view:'closed'});assert.ok(work.items.some(r=>r.lead.id===linked));
 await assert.rejects(lab.importContacts({uid:'stranger',email:'stranger@example.com'},{ids:['contact']}),{status:404});
 await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','false') WHERE id='contact'`);
 const d=await lab.advisor.detail(user,linked);await lab.advisor.save(user,linked,{outcome:'do_not_contact',signature:d.action.signature,idempotency_key:'linked-dnc'});
 assert.equal((await db.query("SELECT payload->>'suppressed' AS suppressed FROM prospect_contacts WHERE id='contact'")).rows[0].suppressed,'true');
}finally{await db.close();}});

// Becoming a client.
//
// The outcome every touch before it was for, and the one that decides whether a
// source paid for itself. It is a status change rather than an approach, so the
// cases worth writing are the refusals: a client nobody spoke to, and a
// prospecting touch logged against somebody who has already signed.
test('a client cannot be recorded without a logged conversation, and leaves the worklist without being suppressed',async()=>{
 const {db,lab,user,id}=await fixture();try{
  await reviewBasics(lab,user,id);
  // Nothing has been logged against this record, so there is no conversation
  // for the strongest outcome in the report to rest on.
  let d=await lab.advisor.detail(user,id);
  await assert.rejects(lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'too-early'}),{status:422});
  // A touch that reached nobody is still not a conversation.
  await lab.advisor.save(user,id,{outcome:'no_answer',channel:'phone',signature:d.action.signature,idempotency_key:'rang-out'});
  d=await lab.advisor.detail(user,id);
  await assert.rejects(lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'still-too-early'}),{status:422});

  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke'});
  d=await lab.advisor.detail(user,id);
  const result=await lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'signed',note:'Opened an account.'});
  assert.equal(result.scheduled,null,'a client has no next prospecting follow-up');

  const saved=(await lab.detail(user,id)).lead;
  assert.equal(saved.follow_up_status,'Client');
  assert.equal(saved.follow_up_date,null);
  // A client is not a contact restriction. Nothing here may quietly suppress a
  // record the advisor now has a relationship with.
  assert.ok(!saved.suppressed);
  d=await lab.advisor.detail(user,id);
  assert.equal(d.action.bucket,'clients');
  assert.match(d.action.reason,/reopen the record/);

  // Its own bucket, and not counted among the records that were disqualified.
  const work=await lab.advisor.worklist(user,{view:'clients'});
  assert.equal(work.total,1);
  assert.equal(work.counts.clients,1);
  assert.equal(work.counts.closed,0);
  assert.equal(work.counts.today,0,'a client is not today’s prospecting work');
  // And nobody pays a provider to enrich them.
  assert.doesNotMatch(await (await lab.advisor.exportEnrichment(user,{ids:[id]})).text(),/Jamie/);
 }finally{await db.close();}
});

test('prospecting stops at the client until the record is explicitly reopened',async()=>{
 const {db,lab,user,id}=await fixture();try{
  await reviewBasics(lab,user,id);
  let d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'signed'});

  // A touch here would spend a dial and one of the six touches on somebody
  // nobody is prospecting.
  d=await lab.advisor.detail(user,id);
  await assert.rejects(lab.advisor.save(user,id,{outcome:'no_answer',channel:'phone',signature:d.action.signature,idempotency_key:'after-signing'}),{status:422});
  await assert.rejects(lab.advisor.save(user,id,{outcome:'meeting_booked',channel:'phone',next_at:'2026-09-20T14:00:00Z',signature:d.action.signature,idempotency_key:'review-meeting'}),{status:422});
  // Including a contact the client started. Pacing yields to an inbound contact
  // for a prospect, but this is not a pacing question: every logged conversation
  // sets the workflow status from its outcome, so recording that a client rang
  // would move them from Client back to Contacted and return them to the
  // worklist. The status has to survive somebody picking up the phone.
  await assert.rejects(lab.advisor.save(user,id,{outcome:'connected',channel:'phone',direction:'inbound',signature:d.action.signature,idempotency_key:'client-rang'}),{status:422});
  assert.equal((await lab.detail(user,id)).lead.follow_up_status,'Client');

  // Not a touch outcome, but it accepts a channel, spends a dial, and would set
  // the record to Not a Fit -- so recognizing only the touch outcomes here would
  // let it move somebody out of Client without reopening them.
  await assert.rejects(lab.advisor.save(user,id,{outcome:'not_interested',channel:'phone',signature:d.action.signature,idempotency_key:'not-a-fit'}),{status:422});
  assert.equal((await lab.detail(user,id)).lead.follow_up_status,'Client');
  // A second confirmation is refused too: they are already a client.
  await assert.rejects(lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'again'}),{status:422});

  // The way back is the one the workflow already had.
  await lab.advisor.save(user,id,{outcome:'reopen',signature:d.action.signature,idempotency_key:'reopened'});
  d=await lab.advisor.detail(user,id);
  assert.notEqual(d.action.bucket,'clients');
  await lab.advisor.save(user,id,{outcome:'no_answer',channel:'phone',signature:d.action.signature,idempotency_key:'working-again'});
  assert.equal((await lab.advisor.detail(user,id)).activities.filter(a=>a.outcome==='no_answer').length,1);
 }finally{await db.close();}
});

test('an outcome that is not an approach stores no channel, so it cannot spend a dial',async()=>{
 const {db,lab,user,id}=await fixture();try{
  await reviewBasics(lab,user,id);
  let d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke'});
  const before=(await lab.advisor.dialsToday(user)).placed;
  // The form hides the channel for both of these, but the budget counts every
  // stored phone row whatever its outcome, so the field has to be dropped on the
  // way in rather than trusted to be absent.
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'became_client',channel:'phone',signature:d.action.signature,idempotency_key:'signed'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'reopen',channel:'phone',signature:d.action.signature,idempotency_key:'reopened'});
  const stored=(await db.query("SELECT outcome,channel FROM advisor_activities WHERE lead_id=$1 AND outcome IN ('became_client','reopen') ORDER BY outcome",[id])).rows;
  assert.deepEqual(stored,[{outcome:'became_client',channel:null},{outcome:'reopen',channel:null}]);
  assert.equal((await lab.advisor.dialsToday(user)).placed,before,'neither may count against the day’s dials');
 }finally{await db.close();}
});

test('the scoreboard counts each client once and states why it is not a conversion rate',async()=>{
 const {db,lab,user,id}=await fixture();try{
  await reviewBasics(lab,user,id);
  let d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'signed'});

  const clients=async days=>(await lab.advisor.scoreboard(user,{days})).measured.find(m=>m.id==='clients_recorded');
  const board=await lab.advisor.scoreboard(user,{days:30});
  const won=board.measured.find(m=>m.id==='clients_recorded');
  assert.equal(won.value,1);
  assert.equal(won.unit,'count');
  assert.equal(won.target,null,'no target is claimed for a figure the firm has not measured');
  assert.match(won.basis,/counted once each/);
  assert.match(board.scopes[won.scope],/whenever they were first met/);
  // Another advisor's scoreboard is unaffected.
  assert.equal((await lab.advisor.scoreboard({uid:'other',email:'other@example.com'},{days:30}))
    .measured.find(m=>m.id==='clients_recorded').value,0);

  // One person arriving once, whatever the log holds. Age the conversion past the
  // window, then reopen, work them and record them again -- which is legitimate
  // and writes a second row inside the window. Dating the count by any matching
  // row would report a brand-new client in a period where nobody arrived; dating
  // it by each lead's first conversion reports the arrival where it happened.
  await db.query("UPDATE advisor_activities SET created_at=$2 WHERE lead_id=$1 AND outcome='became_client'",
    [id,new Date(now.getTime()-60*86400000).toISOString()]);
  assert.equal((await clients(30)).value,0,'the arrival was 60 days ago, not in the last 30');
  assert.equal((await clients(90)).value,1,'and it is still one arrival, in the period it happened');
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'reopen',signature:d.action.signature,idempotency_key:'reopened'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke-again'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'signed-again'});
  assert.equal((await clients(30)).value,0,'a returning client is not a new arrival this month');
  assert.equal((await clients(90)).value,1,'and never becomes two people');
 }finally{await db.close();}
});

test('a client asking not to be contacted is recorded without being reopened first',async()=>{
 const {db,lab,user,id}=await fixture();try{
  await reviewBasics(lab,user,id);
  let d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'signed'});
  // Consent is never refused on the grounds of workflow state. Everything else is
  // closed on a client, but making somebody turn a client back into a prospect
  // before they can record "do not contact" would put a workflow step between a
  // person saying stop and the record that stops it.
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'do_not_contact',signature:d.action.signature,idempotency_key:'asked-to-stop',note:'Asked not to be contacted.'});
  const saved=(await lab.detail(user,id)).lead;
  assert.equal(saved.suppressed,true);
  assert.equal(saved.follow_up_status,'Not a Fit');
  assert.equal((await lab.advisor.detail(user,id)).action.bucket,'closed');
  // And the suppression reaches the linked directory record, as it does elsewhere.
  assert.equal((await lab.advisor.worklist(user,{view:'clients'})).counts.clients,0);
 }finally{await db.close();}
});

test('a client is offered no drafted touch and no next follow-up time',async()=>{
 const {db,lab,user,id}=await fixture();try{
  await reviewBasics(lab,user,id);
  // The control: a prospect with a due step is handed the words for it.
  let d=await lab.advisor.detail(user,id);
  assert.ok(d.draft,'a prospect is given the words for the next approach');
  assert.ok(d.schedules);

  await lab.advisor.save(user,id,{outcome:'connected',channel:'phone',signature:d.action.signature,idempotency_key:'spoke'});
  d=await lab.advisor.detail(user,id);
  await lab.advisor.save(user,id,{outcome:'became_client',signature:d.action.signature,idempotency_key:'signed'});

  // Suppressing this cannot rely on the cadence having no step. Age the
  // conversation and close a rest period after it, and the cycle starts from the
  // rest boundary rather than the reply: the response is no longer the mark that
  // opened the cycle, so pacing computes the opening step again and would compose
  // an introductory email for somebody who has already signed.
  await db.query("UPDATE advisor_activities SET created_at=$2 WHERE lead_id=$1 AND outcome='connected'",
    [id,new Date(now.getTime()-100*86400000).toISOString()]);
  await db.query('INSERT INTO advisor_rest_periods(lead_id,user_id,reason,started_at,resume_at) VALUES($1,$2,$3,$4,$5)',
    [id,user.uid,'Synthetic expired rest',new Date(now.getTime()-140*86400000).toISOString(),new Date(now.getTime()-50*86400000).toISOString()]);
  d=await lab.advisor.detail(user,id);
  assert.equal(d.action.bucket,'clients');
  assert.ok(d.cadence.step,'the precondition: pacing does offer a step here');
  assert.equal(d.draft,null,'a client is not handed a prospecting email or voicemail');
  assert.equal(d.schedules,null,'nor a next follow-up time');
 }finally{await db.close();}
});

// A client stays a client when the record develops other problems. These drive
// nextAction directly, because the scenarios -- a later import bringing a
// conflicting identifier, a criterion being rejected -- are states of the quality
// assessment rather than sequences of saved outcomes.
test('a client outranks the evidence buckets, keeps no contact shortcut, and still reports the problem',()=>{
 const gates=state=>({age:{state},residence:{state},retirement:{state},net_worth:{state},
   contact:{state:'confirmed',reason:'Reviewed.',evidence:{value:{channel:'email',address:'jamie@example.com'}}}});
 const verified={status:'verified',score:100,warnings:[],gaps:[],gates:gates('confirmed')};
 const client={...lead,follow_up_status:'Client'};

 // A confirmed contact route exists, and is deliberately not offered: the
 // workspace would be handing over a Call or Email button for outreach it has
 // just said requires reopening, and the server would refuse the outcome.
 const plain=nextAction(client,verified,now);
 assert.equal(plain.bucket,'clients');
 assert.equal(plain.contact,null,'no prospecting shortcut for a client');
 // A prospect with the same evidence does get one, so this is the status at work.
 assert.equal(nextAction(lead,verified,now).contact.address,'jamie@example.com');

 // Conflicting identifiers would otherwise send them to Review, which is counted
 // in today's prospecting work and is not terminal, so they would be drafted to.
 const conflicted=nextAction(client,{...verified,status:'identity_review'},now);
 assert.equal(conflicted.bucket,'clients');
 assert.match(conflicted.reason,/Conflicting identifiers/);
 // The control: a prospect with the same conflict does go to Review.
 assert.equal(nextAction(lead,{...verified,status:'identity_review'},now).bucket,'review');

 // An excluded record would otherwise land in Closed, beside the disqualified.
 const excluded=nextAction(client,{...verified,status:'excluded',warnings:['Suppressed by the directory.']},now);
 assert.equal(excluded.bucket,'clients');
 assert.match(excluded.reason,/Suppressed by the directory/);
 assert.equal(nextAction(lead,{...verified,status:'excluded',warnings:['Suppressed by the directory.']},now).bucket,'closed');

 // An excluded record with no stated warning still says something true.
 assert.match(nextAction(client,{...verified,status:'excluded'},now).reason,/also excluded from the campaign/);
 // And a client with no problem at all says nothing extra.
 assert.doesNotMatch(plain.reason,/excluded|Conflicting/);
});
