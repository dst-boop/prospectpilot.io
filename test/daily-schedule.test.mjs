import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab,localClock,SCHEDULED_SOURCES,accountEligibility} from '../research-lab.mjs';
const parseConfig=value=>typeof value==='string'?JSON.parse(value):value;

// The daily run: each advisor's own hour in their own time zone, once per
// local day, on the existing queue. Sources are stubs with a zero quote, so
// nothing is fetched and nothing is charged. All names are fictional.
const migrations=['006-research-lab','017-forget','034-historical-identities','012-plan-catalog-summary','007-quality-v2','008-prospect-workspace','013-advisor-workflow','014-outreach-cadence','015-dial-budget','016-inbound-contact','021-lab-companies','022-identity-reviews'];
// `eligibility` stands in for the identity authority; pass null to leave none wired.
async function scheduled(at,{inactive=new Set(),fault=()=>false,quote=()=>0,allowance=async()=>null,eligibility=async()=>'eligible'}={}) {
  const db=new PGlite();
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  for(const name of migrations)await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  // `fault` makes chosen statements fail, to stand in for a database blip.
  const query=(sql,values)=>{if(fault(sql,values))return Promise.reject(Error('connection reset'));return db.query(sql,values);};
  const pool={query,connect:async()=>({query,release(){}})};
  const clock={at},calls=[];
  const lab=createResearchLab({pool,now:()=>new Date(clock.at),subscriptionActive:async(_,uid)=>!inactive.has(uid),allowance,...(eligibility?{scheduledEligibility:eligibility}:{}),
    sources:{readiness:{},quote,run:async(source,employer)=>{calls.push([source,employer.company]);return {status:'completed',candidates:[]};}}});
  const runs=async uid=>(await db.query('SELECT idempotency_key FROM lab_runs WHERE user_id=$1 ORDER BY idempotency_key',[uid])).rows.map(r=>r.idempotency_key);
  return {lab,clock,runs,inactive,calls,db};
}
const daily={employers:['Example Manufacturing'],sources:['public_web']};
const advisor=(uid,zone,hour=8)=>[{uid,email:`${uid}@example.com`},{daily_enabled:true,daily_hour:hour,configuration:{...daily,daily_timezone:zone}}];
const silently=async fn=>{const original=console.error,lines=[];console.error=line=>lines.push(line);try{return [await fn(),lines];}finally{console.error=original;}};

test('the local clock follows daylight saving',()=>{
  assert.deepEqual(localClock(new Date('2026-07-01T12:00:00Z'),'America/New_York'),{day:'2026-07-01',hour:8});
  assert.deepEqual(localClock(new Date('2026-12-01T12:00:00Z'),'America/New_York'),{day:'2026-12-01',hour:7});
  assert.deepEqual(localClock(new Date('2026-12-01T03:30:00Z'),'America/Los_Angeles'),{day:'2026-11-30',hour:19});
  assert.deepEqual(localClock(new Date('2026-12-01T16:00:00Z'),'America/Phoenix'),{day:'2026-12-01',hour:9});
  assert.deepEqual(localClock(new Date('2026-12-01T03:30:00Z'),''),{day:'2026-12-01',hour:3});
});

test('8 a.m. stays 8 a.m. local across the daylight-saving changes',async()=>{
  // Spring forward is 8 March 2026 and fall back is 1 November 2026 in New York.
  for(const [early,due,day] of [['2026-03-07T12:59:00Z','2026-03-07T13:00:00Z','2026-03-07'],['2026-03-08T11:59:00Z','2026-03-08T12:00:00Z','2026-03-08'],
    ['2026-10-31T11:59:00Z','2026-10-31T12:00:00Z','2026-10-31'],['2026-11-01T12:59:00Z','2026-11-01T13:00:00Z','2026-11-01']]) {
    const {lab,clock,runs}=await scheduled(early);await lab.settings(...advisor('east','America/New_York'));
    assert.equal((await lab.scheduleDue()).not_due,1,`${early} is before 8 a.m.`);
    clock.at=due;assert.equal((await lab.scheduleDue()).queued,1);assert.deepEqual(await runs('east'),[`daily:${day}`]);
  }
});

test('each advisor gets one run per local day at their own hour',async()=>{
  const {lab,clock,runs}=await scheduled('2026-12-01T12:30:00Z');
  await lab.settings(...advisor('east','America/New_York'));await lab.settings(...advisor('west','America/Los_Angeles'));
  assert.deepEqual(await lab.scheduleDue(),{queued:0,already:0,not_due:2,inactive:0,ineligible:0,unverified:0,refused:0,failed:0},'7:30 Eastern in winter is too early for both');
  clock.at='2026-12-01T13:05:00Z';
  assert.deepEqual([(await lab.scheduleDue()).queued,(await lab.scheduleDue()).already],[1,1],'the worker\'s next pass is a no-op');
  assert.deepEqual([await runs('east'),await runs('west')],[['daily:2026-12-01'],[]],'8:05 Eastern is 5:05 Pacific');
  clock.at='2026-12-01T16:00:00Z';await lab.scheduleDue();
  assert.deepEqual(await runs('west'),['daily:2026-12-01']);
  // Late evening Pacific is already the next day in UTC: no second run.
  clock.at='2026-12-02T05:00:00Z';await lab.scheduleDue();
  assert.deepEqual([await runs('east'),await runs('west')],[['daily:2026-12-01'],['daily:2026-12-01']]);
  while(await lab.tick());
  clock.at='2026-12-02T13:00:00Z';await lab.scheduleDue();
  assert.deepEqual(await runs('east'),['daily:2026-12-01','daily:2026-12-02']);
});

test('a failed pass is retried without a duplicate, and does not hold up other advisors',async()=>{
  let failing=true;
  const {lab,runs,db}=await scheduled('2026-12-01T15:00:00Z',{fault:(sql,values)=>failing&&/^INSERT INTO lab_runs/.test(sql)&&values?.[1]==='blip'});
  await lab.settings(...advisor('blip','America/New_York'));await lab.settings(...advisor('steady','America/New_York'));
  const [first,lines]=await silently(()=>lab.scheduleDue());
  assert.deepEqual([first.failed,first.queued],[1,1]);
  assert.deepEqual([await runs('blip'),await runs('steady')],[[],['daily:2026-12-01']]);
  assert.deepEqual(lines.map(l=>JSON.parse(l)),[{event:'daily_schedule_incomplete',failed:1,unverified:0}],'counts only: no account identifier in the log');
  failing=false;
  assert.deepEqual([(await lab.scheduleDue()).queued,(await lab.scheduleDue()).queued],[1,0]);
  assert.deepEqual(await runs('blip'),['daily:2026-12-01']);
  assert.equal(Number((await db.query("SELECT count(*) AS n FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id WHERE r.user_id='blip'")).rows[0].n),1,'one run, one task');
});

test('yesterday\'s run still on the queue delays today\'s; it is never queued twice',async()=>{
  const {lab,clock,runs}=await scheduled('2026-12-01T14:00:00Z');
  await lab.settings(...advisor('east','America/New_York'));await lab.scheduleDue();
  clock.at='2026-12-02T14:00:00Z';
  assert.deepEqual([(await lab.scheduleDue()).already,await runs('east')],[1,['daily:2026-12-01']]);
  while(await lab.tick());
  assert.deepEqual([(await lab.scheduleDue()).queued,await runs('east')],[1,['daily:2026-12-01','daily:2026-12-02']]);
});

test('an inactive advisor gets no scheduled run until they are active again',async()=>{
  const {lab,runs,inactive,calls}=await scheduled('2026-12-01T15:00:00Z',{inactive:new Set(['lapsed'])});
  await lab.settings(...advisor('lapsed','America/New_York'));await lab.settings(...advisor('paying','America/New_York'));
  // Switched off by the advisor: the saved hour and zone stay, nothing runs.
  await lab.settings({uid:'paused',email:'paused@example.com'},{daily_enabled:false,daily_hour:8,configuration:{...daily,daily_timezone:'America/New_York'}});
  assert.deepEqual(await lab.scheduleDue(),{queued:1,already:0,not_due:0,inactive:1,ineligible:0,unverified:0,refused:0,failed:0});
  assert.deepEqual([await runs('lapsed'),await runs('paused'),await runs('paying')],[[],[],['daily:2026-12-01']],'no failed row is written for a lapsed advisor');
  while(await lab.tick());
  assert.ok(calls.length>0&&calls.every(([,company])=>company==='Example Manufacturing'));
  inactive.delete('lapsed');
  assert.equal((await lab.scheduleDue()).queued,1);assert.deepEqual(await runs('lapsed'),['daily:2026-12-01']);
});

test('a schedule saved as a UTC hour keeps its time, and an unknown zone is refused',async()=>{
  const {lab,clock,runs}=await scheduled('2026-12-01T12:59:00Z'),user={uid:'legacy',email:'legacy@example.com'};
  await lab.settings(user,{daily_enabled:true,daily_hour:13,configuration:daily});
  await lab.scheduleDue();assert.deepEqual(await runs('legacy'),[]);
  clock.at='2026-12-01T13:00:00Z';await lab.scheduleDue();assert.deepEqual(await runs('legacy'),['daily:2026-12-01']);
  await assert.rejects(lab.settings(user,{configuration:{...daily,daily_timezone:'Mars/Olympus'}}),{status:422});
  const fresh=await lab.settings({uid:'new',email:'new@example.com'});
  assert.deepEqual([fresh.daily_hour,fresh.configuration.daily_timezone,fresh.daily_enabled],[8,'America/New_York',false],'a new advisor is offered 8 a.m. Eastern, switched off');
});

test('a run that cannot start is recorded once for the day, not on every pass',async()=>{
  const {lab,runs,db}=await scheduled('2026-12-01T15:00:00Z');
  await lab.settings({uid:'empty',email:'empty@example.com'},{daily_enabled:true,daily_hour:8,configuration:{sources:['public_web'],daily_timezone:'America/New_York'}});
  assert.equal((await lab.scheduleDue()).refused,1);assert.equal((await lab.scheduleDue()).already,1);
  assert.deepEqual(await runs('empty'),['daily:2026-12-01']);
  assert.equal((await db.query("SELECT status FROM lab_runs WHERE user_id='empty'")).rows[0].status,'failed');
});

test('a scheduled run uses built-in sources only and can never spend',async()=>{
  const quote=source=>source==='web_search'?5000:0;
  const paid=(sources)=>({daily_enabled:true,daily_hour:8,configuration:{employers:['Example Manufacturing'],sources,daily_timezone:'America/New_York',daily_budget_micros:10000000}});
  assert.deepEqual([...SCHEDULED_SOURCES],['public_web','sec','warn']);
  // A paid source selected with a positive budget and a willing plan: the
  // scheduled run drops it, runs the built-in source, and reserves nothing.
  const mixed=await scheduled('2026-12-01T15:00:00Z',{quote});
  await mixed.lab.settings({uid:'mixed',email:'mixed@example.com'},paid(['web_search','public_web']));
  assert.equal((await mixed.lab.scheduleDue()).queued,1);
  const run=(await mixed.db.query("SELECT configuration,budget_micros FROM lab_runs WHERE user_id='mixed'")).rows[0];
  assert.deepEqual([run.configuration.sources,Number(run.budget_micros)],[['public_web'],0]);
  while(await mixed.lab.tick());
  assert.deepEqual([...new Set(mixed.calls.map(([source])=>source))],['public_web'],'licensed search is never called');
  assert.equal(Number((await mixed.db.query('SELECT count(*) AS n FROM lab_costs')).rows[0].n),0,'no reservation and no charge');
  assert.equal(Number((await mixed.db.query("SELECT daily_budget_micros AS n FROM lab_settings WHERE user_id='mixed'")).rows[0].n),10000000,'the advisor\'s own budget for manual runs is untouched');
  // Only a paid source selected: refused once for the day, never run on it.
  const only=await scheduled('2026-12-01T15:00:00Z',{quote});
  await only.lab.settings({uid:'paid-only',email:'paid-only@example.com'},paid(['web_search']));
  assert.equal((await only.lab.scheduleDue()).refused,1);assert.equal((await only.lab.scheduleDue()).already,1);
  const refused=(await only.db.query("SELECT status,message FROM lab_runs WHERE user_id='paid-only'")).rows;
  assert.equal(refused.length,1);assert.equal(refused[0].status,'failed');assert.match(refused[0].message,/no built-in source/);
  while(await only.lab.tick());
  assert.deepEqual([only.calls.length,Number((await only.db.query('SELECT count(*) AS n FROM lab_costs')).rows[0].n)],[0,0]);
  // A built-in source that has been given a price is not treated as built-in.
  const priced=await scheduled('2026-12-01T15:00:00Z',{quote:()=>2000});
  await priced.lab.settings({uid:'priced',email:'priced@example.com'},paid(['public_web']));
  assert.equal((await priced.lab.scheduleDue()).refused,1);
  // A run the advisor starts themselves still honours their licensed selection.
  const manual=await scheduled('2026-12-01T15:00:00Z',{quote});
  const started=await manual.lab.enqueue({uid:'manual',email:'manual@example.com'},{employers:['Example Manufacturing'],sources:['web_search'],daily_budget_micros:10000000});
  assert.deepEqual(parseConfig(started.configuration).sources,['web_search']);
});

test('with no identity authority wired in, nothing is scheduled',async()=>{
  const {lab,runs}=await scheduled('2026-12-01T15:00:00Z',{eligibility:null});
  await lab.settings(...advisor('east','America/New_York'));
  const [summary,lines]=await silently(()=>lab.scheduleDue());
  assert.deepEqual([summary.queued,summary.unverified],[0,1]);assert.deepEqual(await runs('east'),[]);
  assert.deepEqual(lines.map(l=>JSON.parse(l)),[{event:'daily_schedule_incomplete',failed:0,unverified:1}]);
  assert.ok(!lines.join('').includes('east'),'no account identifier in the log');
});

test('a paid-up subscription does not stand in for an active account',async()=>{
  const state={disabled:'ineligible',revoked:'ineligible',fine:'eligible'};
  const {lab,runs,inactive}=await scheduled('2026-12-01T15:00:00Z',{eligibility:async uid=>state[uid]});
  for(const uid of Object.keys(state))await lab.settings(...advisor(uid,'America/New_York'));
  assert.equal(inactive.size,0,'all three subscriptions are active');
  const summary=await lab.scheduleDue();
  assert.deepEqual([summary.queued,summary.ineligible],[1,2]);
  assert.deepEqual([await runs('disabled'),await runs('revoked'),await runs('fine')],[[],[],['daily:2026-12-01']]);
  // Restored the same day: the next pass queues it, once.
  state.disabled='eligible';
  assert.equal((await lab.scheduleDue()).queued,1);assert.deepEqual(await runs('disabled'),['daily:2026-12-01']);
});

test('an eligibility check that is unavailable or malformed means no run, and is retried',async()=>{
  let mode='down';
  const {lab,runs}=await scheduled('2026-12-01T15:00:00Z',{eligibility:async()=>{if(mode==='down')throw Error('directory unavailable');return mode==='odd'?{ok:true}:'eligible';}});
  await lab.settings(...advisor('east','America/New_York'));
  const [down]=await silently(()=>lab.scheduleDue());
  assert.deepEqual([down.queued,down.unverified,await runs('east')],[0,1,[]]);
  mode='odd';assert.equal((await lab.scheduleDue()).ineligible,1,'only the exact answer "eligible" counts');assert.deepEqual(await runs('east'),[]);
  mode='up';assert.equal((await lab.scheduleDue()).queued,1);assert.deepEqual(await runs('east'),['daily:2026-12-01']);
});

test('an account revoked after its run was queued does no further work',async()=>{
  for(const after of ['ineligible','down']) {
    let state='eligible';
    const {lab,runs,calls,db}=await scheduled('2026-12-01T15:00:00Z',{eligibility:async()=>{if(state==='down')throw Error('directory unavailable');return state;}});
    await lab.settings(...advisor('east','America/New_York'));
    assert.equal((await lab.scheduleDue()).queued,1);assert.deepEqual(await runs('east'),['daily:2026-12-01']);
    state=after;
    while(await lab.tick());
    assert.equal(calls.length,0,`no source is called once the account is ${after}`);
    const tasks=(await db.query('SELECT status,result FROM lab_tasks')).rows;
    assert.ok(tasks.length>0&&tasks.every(t=>t.status==='skipped'&&/could not be verified as active/.test(JSON.stringify(t.result))));
  }
  // A run the advisor started themselves is not subject to the scheduled gate:
  // it was authorized by their signed-in, revocation-checked request.
  const manual=await scheduled('2026-12-01T15:00:00Z',{eligibility:async()=>'ineligible'});
  await manual.lab.enqueue({uid:'manual',email:'manual@example.com'},daily);
  while(await manual.lab.tick());
  assert.ok(manual.calls.length>0);
});

test('the account adapter accepts only an enabled, verified account record',async()=>{
  const records={ok:{uid:'ok',disabled:false,emailVerified:true},off:{uid:'off',disabled:true,emailVerified:true},unverified:{uid:'unverified',disabled:false,emailVerified:false},
    other:{uid:'someone-else',disabled:false,emailVerified:true},partial:{uid:'partial',disabled:false}};
  const check=accountEligibility(async uid=>{if(uid==='gone')throw Object.assign(Error('not found'),{code:'auth/user-not-found'});return records[uid];});
  assert.deepEqual([await check('ok'),await check('off'),await check('unverified')],['eligible','ineligible','ineligible']);
  for(const uid of ['other','partial','gone','missing'])await assert.rejects(check(uid));
});
