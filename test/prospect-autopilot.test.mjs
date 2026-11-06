// Autopilot: the ladder, and what bounds it.
//
// The two properties worth pinning are the ones the operator is trusting:
// the cheap steps run before the expensive ones, and the figure they approved
// is the most the run can reserve. Everything else here is a refusal.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {createProspectJobs} from '../prospect-jobs.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createProspectAutopilot,ladder,AUTOPILOT_ACTIONS,CHUNK} from '../prospect-autopilot.mjs';

const user={uid:'owner'},other={uid:'stranger'};

async function fixture(fn,overrides={}) {
  const db=new PGlite();
  try {
    for(const name of ['008-prospect-workspace','020-list-sharing','009-prospect-jobs','011-email-domain-check',
      '017-forget','018-phone-check','019-web-research','031-autopilot'])
      await db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const providers={readiness:{search:true,enrichment:true,email_verification:true,domain_check:true,phone_check:true,web_research:true},
      search:async()=>({contacts:[],retrieved:0,total:0}),
      enrich:async c=>({contact:c,checked_at:new Date().toISOString()}),
      verifyEmail:async c=>({email:c.email,status:'valid',provider_status:'valid',provider:'hunter',checked_at:new Date().toISOString()}),
      checkPhone:async()=>({status:'owner_matched',provider:'trestle',checked_at:new Date().toISOString()}),
      webResearch:async()=>({findings:[],checked_at:new Date().toISOString()}),
      ...overrides};
    // Deliberately out of ladder order: enrich is dearest, the phone check is
    // cheap, the domain check is free. The ladder must sort on these.
    const config={dailyBudgetMicros:10000000,prices:{search:1000,enrich:5000,verify:2000,check_phone:300,web_research:4000}};
    const jobs=createProspectJobs({pool,providers,config,pacingMs:{pdl:0,hunter:0,dns:0,trestle:0,anthropic:0}});
    const autopilot=createProspectAutopilot({pool,jobs,config});
    const app=createProspectWorkspace({pool,jobs,autopilot});
    await fn({db,app,jobs,autopilot,providers,config});
  } finally { await db.close(); }
}

const seed=async(app,rows)=>app.importCSV(user,{csv:'First Name,Last Name,Email,Phone,Company\n'+rows.join('\n')});

test('the ladder is ordered by price, free first, and follows a repricing',()=>{
  const actions=Object.fromEntries(AUTOPILOT_ACTIONS.map(a=>[a,true]));
  const prices={enrich:5000,verify:2000,check_phone:300,web_research:4000};
  assert.deepEqual(ladder(AUTOPILOT_ACTIONS,{prices,actions}).map(s=>s.action),
    ['check_domain','check_phone','verify','web_research','enrich']);
  // Reprice and the ladder reorders. Lead Qualifier's hardcoded order could not.
  assert.deepEqual(ladder(['enrich','verify'],{prices:{enrich:10,verify:9000},actions}).map(s=>s.action),['enrich','verify']);
  // A step with no configured price, or no provider, is not offered at all —
  // Autopilot never puts a step in a quote it cannot run.
  assert.deepEqual(ladder(['enrich','verify'],{prices:{verify:2000},actions}).map(s=>s.action),['verify']);
  assert.deepEqual(ladder(['enrich','verify'],{prices,actions:{...actions,enrich:false}}).map(s=>s.action),['verify']);
  // check_domain is free whatever the price table says, and sorts first.
  assert.equal(ladder(['check_domain'],{prices:{},actions}).at(0).price_micros,0);
  // Unknown or duplicated steps cannot pad the ladder.
  assert.deepEqual(ladder(['verify','verify','not_a_step'],{prices,actions}).map(s=>s.action),['verify']);
});

test('a quote prices every step for every contact and says it is an upper bound',()=>fixture(async({app,autopilot,config})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline','Sam,Ortiz,sam@example.com,5165550143,Northline']);
  const quoted=await autopilot.plan(user,{steps:['check_domain','check_phone','verify']});
  assert.equal(quoted.contacts,2);
  assert.deepEqual(quoted.steps.map(s=>s.action),['check_domain','check_phone','verify']);
  // 2 × (0 + 300 + 2000).
  assert.equal(quoted.worst_case_micros,4600);
  assert.match(quoted.basis,/most this run can reserve/);
  assert.match(quoted.basis,/real figure is lower/);
  // A step the deployment cannot run is reported as unavailable rather than
  // quietly dropped, so the operator knows why it is not in the price.
  config.prices.web_research=undefined;
  const partial=await autopilot.plan(user,{steps:['verify','web_research']});
  assert.deepEqual(partial.steps.map(s=>s.action),['verify']);
  assert.equal(partial.unavailable.at(0).action,'web_research');
  assert.match(partial.unavailable.at(0).reason,/No price is configured/);
}));

test('the cheap step runs first, and the dear one only after it has finished',()=>fixture(async({app,jobs,autopilot,db})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline']);
  await autopilot.start(user,{steps:['check_phone','enrich'],approved_micros:5300});

  // The first step queued is the cheaper one, and only that one.
  let state=await autopilot.state(user,{});
  assert.equal(state.run.current.action,'check_phone');
  assert.equal(state.run.step,1);
  assert.equal(state.run.total_steps,2);
  assert.deepEqual(state.run.remaining.map(s=>s.action),['enrich']);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM prospect_tasks WHERE action='enrich'")).rows[0].n,0,
    'the expensive step is not queued while the cheap one is unresolved');

  // While the phone check is outstanding the run does not move on.
  assert.equal(await autopilot.tick(),false);
  assert.equal((await autopilot.state(user,{})).run.current.action,'check_phone');

  // Once it finishes, the next pass queues the dearer step.
  await jobs.tick();
  assert.equal(await autopilot.tick(),true);
  state=await autopilot.state(user,{});
  assert.equal(state.run.current.action,'enrich');
  assert.equal(state.run.status,'running');

  // And when the last step settles the run is done, not left open.
  await jobs.tick();
  assert.equal(await autopilot.tick(),true);
  state=await autopilot.state(user,{});
  assert.equal(state.run.status,'done');
  assert.match(state.run.note,/Every approved step has run/);
  assert.equal(await autopilot.tick(),false,'a finished run is not picked up again');
}));

test('the approved maximum bounds the whole run, not each step',()=>fixture(async({app,jobs,autopilot,config})=>{
  // Equal prices, so the ladder is check_phone then verify, and the numbers can
  // tell a cumulative ceiling from a per-step one: after the growth below the
  // second step's own quote still fits under the approval, and only the total
  // does not. A per-step check would let this run spend 5,000 against 4,000.
  config.prices.check_phone=1000;config.prices.verify=1000;
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline',
    'Sam,Ortiz,sam@example.com,5165550143,Northline']);
  const quoted=await autopilot.plan(user,{steps:['check_phone','verify']});
  assert.equal(quoted.worst_case_micros,4000);
  await autopilot.start(user,{steps:['check_phone','verify'],approved_micros:4000});
  await jobs.tick();await jobs.tick();
  assert.equal((await autopilot.state(user,{})).run.reserved_micros,2000);

  // A third contact arrives before the second step. Its step alone would fit.
  await seed(app,['Dana,Reyes,dana@example.com,5165550144,Northline']);
  assert.equal(await autopilot.tick(),true);
  const state=await autopilot.state(user,{});
  assert.equal(state.run.status,'paused','the run stops at the ceiling instead of exceeding it');
  assert.match(state.run.note,/more than the approved maximum/);
  assert.match(state.run.note,/Nothing was sent/);
  assert.equal(state.run.reserved_micros,2000,'only the step that fitted was reserved');
  // Paused is final for this run: the queue does not quietly resume it.
  assert.equal(await autopilot.tick(),false);
}));

test('a run will not start on an approval that no longer covers its quote',()=>fixture(async({app,autopilot})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline']);
  await assert.rejects(autopilot.start(user,{steps:['enrich'],approved_micros:4999}),{status:422});
  // Starting is refused outright rather than starting and pausing at step one,
  // so an under-funded approval never half-runs a ladder.
  assert.equal((await autopilot.state(user,{})).run,null);
  await assert.rejects(autopilot.start(user,{steps:['enrich'],approved_micros:-1}),{status:422});
  await assert.rejects(autopilot.start(user,{steps:[],approved_micros:0}),{status:422});
}));

test('the request cannot reorder the ladder or add an unpriced step',()=>fixture(async({app,autopilot})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline']);
  // Asking for the dear step first does not get it first: the ladder is
  // recomputed from prices on the server, so the order is not the caller's.
  await autopilot.start(user,{steps:['enrich','check_phone'],approved_micros:5300});
  assert.equal((await autopilot.state(user,{})).run.current.action,'check_phone');
  const state=await autopilot.state(user,{});
  assert.deepEqual(state.run.remaining.map(s=>s.action),['enrich']);
}));

test('one run at a time per list, and nobody else’s run is visible',()=>fixture(async({app,autopilot})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline']);
  const list=await app.createList(user,{name:'Prospects'});
  await app.membership(user,list.id,{ids:(await app.search(user)).contacts.map(c=>c.id)});
  await autopilot.start(user,{list_id:list.id,steps:['check_phone'],approved_micros:300});
  await assert.rejects(autopilot.start(user,{list_id:list.id,steps:['check_phone'],approved_micros:300}),{status:409});
  // A run on the whole workspace is a different run from a run on one list.
  await autopilot.start(user,{steps:['check_phone'],approved_micros:300});
  assert.equal((await autopilot.state(user,{list_id:list.id})).run.list_id,list.id);
  assert.equal((await autopilot.state(user,{})).run.list_id,null);
  // Another advisor sees none of it and cannot stop it.
  assert.equal((await autopilot.state(other,{})).run,null);
  const mine=(await autopilot.state(user,{})).run.id;
  await assert.rejects(autopilot.stop(other,mine),{status:404});
  await assert.rejects(autopilot.start(user,{list_id:'not-a-list',steps:['check_phone'],approved_micros:300}),{status:404});
}));

test('stopping a run sends no further step',()=>fixture(async({app,jobs,autopilot})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline']);
  await autopilot.start(user,{steps:['check_phone','enrich'],approved_micros:5300});
  await autopilot.stop(user,(await autopilot.state(user,{})).run.id);
  await jobs.tick();
  assert.equal(await autopilot.tick(),false,'a stopped run is not advanced');
  const state=await autopilot.state(user,{});
  assert.equal(state.run.status,'stopped');
  assert.match(state.run.note,/no further step/);
  assert.deepEqual(state.run.remaining.map(s=>s.action),['enrich'],'the step it never reached is still named');
}));

test('a suppressed contact is never worked, and an emptied list ends the run',()=>fixture(async({app,jobs,autopilot,db})=>{
  await seed(app,['Jamie,Rivera,jamie@example.com,5165550142,Northline']);
  const id=(await app.search(user)).contacts[0].id;
  await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','true') WHERE id=$1`,[id]);
  assert.equal((await autopilot.plan(user,{steps:['check_phone']})).contacts,0);
  await assert.rejects(autopilot.start(user,{steps:['check_phone'],approved_micros:300}),{status:422});
  // Suppression mid-run ends it rather than working the person anyway.
  await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','false') WHERE id=$1`,[id]);
  await autopilot.start(user,{steps:['check_phone','enrich'],approved_micros:5300});
  await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','true') WHERE id=$1`,[id]);
  await jobs.tick();
  await autopilot.tick();
  const state=await autopilot.state(user,{});
  assert.equal(state.run.status,'done');
  assert.match(state.run.note,/No contacts are left/);
}));

test('a list longer than one job becomes several jobs in the same step',()=>fixture(async({app,autopilot,db})=>{
  // One over the per-job limit, so the step must split rather than refuse.
  const rows=Array.from({length:CHUNK+1},(_,i)=>`First${i},Last${i},p${i}@example.com,516555${String(i).padStart(4,'0')},Northline`);
  await seed(app,rows);
  const quoted=await autopilot.plan(user,{steps:['check_phone']});
  assert.equal(quoted.contacts,CHUNK+1);
  assert.equal(quoted.steps.at(0).chunks,2);
  await autopilot.start(user,{steps:['check_phone'],approved_micros:quoted.worst_case_micros});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM prospect_jobs WHERE action='check_phone'")).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM prospect_tasks WHERE action='check_phone'")).rows[0].n,CHUNK+1);
}));

test('autopilot is refused on a shared list, because the run spends the owner’s budget',()=>fixture(async({app,jobs})=>{
  const scoped=createProspectWorkspace({pool:{query:async()=>({rows:[]}),connect:async()=>({query:async()=>({rows:[]}),release(){}})},
    jobs,autopilot:{route:async()=>({reached:true})},scope:{id:'shared-list'}});
  await assert.rejects(scoped.route(new Request('https://x/api/prospect/autopilot'),user),{status:404});
}));

// --- what the operator reads before approving a spend -------------------------

test('the quote states the order, the worst case, and that it is a worst case',async()=>{
  const {autopilotQuoteContent,autopilotRunContent}=await import('../prospect-jobs-client.js');
  const quote={contacts:2,worst_case_micros:4600,list_id:null,unavailable:[{action:'enrich',label:'Fill in missing contact details',reason:'No price is configured for this step.'}],
    steps:[{action:'check_domain',label:'Check the email domain',price_micros:0,worst_case_micros:0,contacts:2},
      {action:'check_phone',label:'Check the phone line',price_micros:300,worst_case_micros:600,contacts:2},
      {action:'verify',label:'Verify the email address',price_micros:2000,worst_case_micros:4000,contacts:2}],
    basis:'The most this run can reserve, at configured prices.'};
  const html=autopilotQuoteContent(quote);
  // The free step is named as free rather than priced at zero dollars.
  assert.match(html,/Check the email domain<\/strong> — no charge/);
  assert.match(html,/runs first/);
  assert.match(html,/Most this can reserve: \$0\.0046/);
  // A figure that commits money is never presented as a prediction.
  assert.match(html,/cheapest first/);
  assert.match(html,/cannot exceed it/);
  // A step left out is named with its reason, not silently absent.
  assert.match(html,/Not included: Fill in missing contact details \(No price is configured for this step\.\)/);
  // With nothing runnable it refuses rather than offering an empty approval.
  const none=autopilotQuoteContent({...quote,steps:[]});
  assert.match(none,/No step can run yet/);
  assert.match(none,/Nothing has been charged/);
  assert.doesNotMatch(none,/Most this can reserve/);

  // The run line shows real spend against the approval, and a paused run says so.
  const run={id:'r1',status:'paused',note:'Verify the email address would reserve more than the approved maximum for this run.',
    approved_micros:4600,reserved_micros:600,step:2,total_steps:3,
    current:{action:'check_phone',label:'Check the phone line'},remaining:[{action:'verify',label:'Verify the email address'}]};
  const line=autopilotRunContent(run);
  assert.match(line,/Autopilot: Paused/);
  assert.match(line,/\$0\.0006 of \$0\.0046 approved reserved/);
  assert.match(line,/role="status"/,'a paused run is announced, not styled as a muted aside');
  assert.match(line,/Still to run: Verify the email address/);
  assert.doesNotMatch(line,/Stop autopilot/,'a paused run offers a fresh setup, not a stop');
  assert.match(autopilotRunContent({...run,status:'running'}),/data-autopilot-stop="r1"/);
  assert.match(autopilotRunContent(null),/no page open/);
  // HTML in a note cannot reach the page as markup.
  assert.match(autopilotRunContent({...run,note:'<img src=x onerror=1>'}),/&lt;img/);
});
