import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProspectJobs,readPlans,providerJobConfig} from '../prospect-jobs.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {providerSetupContent} from '../prospect-jobs-client.js';

// Each advisor's membership plan includes a monthly allowance of paid lookups.
// The allowance is enforced on the server when a cost is reserved, per
// advisor, on top of the deployment's shared daily cap. Providers are stubs.
const advisor={uid:'advisor-a'},colleague={uid:'advisor-b'};
const record={first_name:'Jamie',last_name:'Rivera',company:'Example',title:'Director',email:'jamie@example.com',provider_id:'p1'};
const PLANS={starter:{name:'Starter',monthly_allowance_micros:2500},pro:{name:'Pro',monthly_allowance_micros:10000}};

async function fixture(fn,{plans=PLANS,defaultPlan='starter'}={}){
  const db=new PGlite();
  try{
    for(const name of ['008-prospect-workspace','020-list-sharing','009-prospect-jobs','011-email-domain-check','017-forget','019-web-research','023-memberships'])await db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    let calls=0;
    const providers={readiness:{search:true,profile_image:true},search:async()=>{calls++;return {contacts:[record],retrieved:1,total:1};},
      readProfileImage:async()=>{calls++;return {matches_contact:true,summary:'s',findings:[],model:'m',checked_at:new Date().toISOString()};}};
    const config={dailyBudgetMicros:1000000,prices:{search:1000,profile_image:1000},plans,defaultPlan};
    const jobs=createProspectJobs({pool,providers,config,pacingMs:{pdl:0,anthropic:0}});
    const app=createProspectWorkspace({pool,jobs});
    let n=0;
    const search=async user=>{const job=await jobs.enqueue(user,{action:'search',filters:{company:'Example'},size:1,max_cost_micros:1000,idempotency_key:'plan-search-'+(++n)});while(await jobs.tick());return (await jobs.jobs(user,job.id)).tasks[0];};
    await fn({db,jobs,app,search,calls:()=>calls});
  }finally{await db.close();}
}

test('an advisor stops at their plan allowance without charge, and colleagues are unaffected',()=>fixture(async({jobs,search,calls})=>{
  assert.equal((await search(advisor)).status,'completed');
  assert.equal((await search(advisor)).status,'completed');
  const third=await search(advisor);
  assert.equal(third.status,'skipped');
  assert.match(third.result.message,/Starter plan's monthly allowance for paid lookups is used up/);
  assert.equal(calls(),2,'the third request never reached the provider');
  const plan=(await jobs.summary(advisor)).plan;
  assert.deepEqual([plan.id,plan.name,plan.monthly_allowance_micros,plan.used_this_month_micros,plan.remaining_micros],['starter','Starter',2500,2000,500]);
  assert.match(plan.resets_at,/^\d{4}-\d{2}-01T00:00:00\.000Z$/);
  // A colleague's allowance is their own.
  assert.equal((await search(colleague)).status,'completed');
  assert.equal((await jobs.summary(colleague)).plan.used_this_month_micros,1000);
}));

test('assigning a plan or an override changes the allowance; an unknown plan allows nothing',()=>fixture(async({db,jobs,search})=>{
  await db.query("INSERT INTO prospect_memberships(user_id,plan) VALUES($1,'pro')",[advisor.uid]);
  assert.equal((await jobs.summary(advisor)).plan.monthly_allowance_micros,10000);
  await db.query("UPDATE prospect_memberships SET monthly_allowance_micros=0 WHERE user_id=$1",[advisor.uid]);
  assert.equal((await search(advisor)).status,'skipped');
  await db.query("INSERT INTO prospect_memberships(user_id,plan) VALUES($1,'retired-plan')",[colleague.uid]);
  const plan=(await jobs.summary(colleague)).plan;
  assert.equal(plan.monthly_allowance_micros,0);assert.equal(plan.name,'Plan not available');
  assert.equal((await search(colleague)).status,'skipped');
}));

test('spend from earlier months does not count against this month',()=>fixture(async({db,jobs,search})=>{
  await search(advisor);await search(advisor);
  await db.query("UPDATE prospect_charges SET reserved_at=date_trunc('month',now())-interval '1 day' WHERE user_id=$1",[advisor.uid]);
  assert.equal((await jobs.summary(advisor)).plan.used_this_month_micros,0);
  assert.equal((await search(advisor)).status,'completed');
}));

test('a profile screenshot is refused before reading when the plan is used up',()=>fixture(async({db,app,jobs,calls})=>{
  await app.importCSV(advisor,{csv:'First Name,Last Name,Company\nJamie,Rivera,Example'});
  const id=(await app.search(advisor)).contacts[0].id;
  await db.query("INSERT INTO prospect_memberships(user_id,plan,monthly_allowance_micros) VALUES($1,'starter',500)",[advisor.uid]);
  await assert.rejects(jobs.profileImage(advisor,id,{media_type:'image/png',data:'A'.repeat(200)}),e=>e.status===422&&/The screenshot was not read/.test(e.message));
  assert.equal(calls(),0);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM prospect_charges')).rows[0].n),0);
}));

test('without configured plans there is no per-advisor allowance, as before',()=>fixture(async({jobs,search})=>{
  for(let i=0;i<4;i++)assert.equal((await search(advisor)).status,'completed');
  assert.equal((await jobs.summary(advisor)).plan,null);
},{plans:null,defaultPlan:null}));

test('plans are read from settings and bad settings fail loudly',()=>{
  assert.deepEqual(readPlans({}),{plans:null,defaultPlan:null});
  const env={PROSPECT_PLANS:JSON.stringify(PLANS),PROSPECT_DEFAULT_PLAN:'pro'};
  assert.equal(readPlans(env).defaultPlan,'pro');
  assert.equal(readPlans({PROSPECT_PLANS:JSON.stringify(PLANS)}).defaultPlan,'starter');
  assert.equal(providerJobConfig(env).plans.pro.monthly_allowance_micros,10000);
  assert.throws(()=>readPlans({PROSPECT_PLANS:'{'}),/Invalid PROSPECT_PLANS/);
  assert.throws(()=>readPlans({PROSPECT_PLANS:'{"Bad Id":{"name":"x","monthly_allowance_micros":1}}'}),/Invalid PROSPECT_PLANS entry/);
  assert.throws(()=>readPlans({PROSPECT_PLANS:'{"a":{"name":"A","monthly_allowance_micros":-1}}'}),/Invalid PROSPECT_PLANS entry/);
  assert.throws(()=>readPlans({PROSPECT_PLANS:JSON.stringify(PLANS),PROSPECT_DEFAULT_PLAN:'gold'}),/PROSPECT_DEFAULT_PLAN/);
});

test('the tools panel shows the plan and what it has used, escaped',()=>{
  const html=providerSetupContent({actions:{},prices:{},daily_budget_micros:0,reserved_today_micros:0,plan:{name:'<Pro>',used_this_month_micros:1500000,monthly_allowance_micros:25000000,resets_at:'2026-11-01T00:00:00.000Z'}});
  assert.match(html,/Your plan: <strong>&lt;Pro&gt;<\/strong>/);
  assert.match(html,/\$1\.50 of \$25\.00 included\. Resets 2026-11-01/);
  assert.doesNotMatch(providerSetupContent({actions:{},prices:{},plan:null}),/Your plan/);
});
