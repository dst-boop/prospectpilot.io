import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab,localClock} from '../research-lab.mjs';
import {assessLead,leadScores,complianceProfile,excludedEmployer,DEFAULT_COMPLIANCE} from '../lead-quality.mjs';

// The advisor's own firm and its affiliates are a setting per advisor, not
// code. An advisor who has saved nothing keeps the original Equitable rule.
// Every name here is fictional or a company; nothing leaves the test.
const migrations=['006-research-lab','017-forget','012-plan-catalog-summary','007-quality-v2','008-prospect-workspace','013-advisor-workflow','014-outreach-cadence','015-dial-budget','016-inbound-contact','021-lab-companies','022-identity-reviews'];
async function fixture() {
  const db=new PGlite();
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  for(const name of migrations)await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>pool.query(...a),release(){}})};
  const sources={readiness:{},quote:()=>0,market:async()=>({status:'completed',companies:[]}),run:async()=>({status:'completed',candidates:[]})};
  return {db,lab:createResearchLab({pool,sources})};
}
const now=new Date('2026-11-19T12:00:00Z');
const lead={first_name:'Jamie',last_name:'Example',company:'Northwind Mutual',email:'jamie@example.com',country:'US'};
const firm={firm_name:'Northwind Advisors',excluded_employers:['Northwind','Contoso Life']};

test('an advisor with no saved profile keeps the Equitable exclusion',()=>{
  assert.equal(complianceProfile(undefined),DEFAULT_COMPLIANCE);
  assert.equal(assessLead({...lead,company:'Equitable Holdings'},[],{now}).status,'excluded');
  assert.notEqual(assessLead(lead,[],{now}).status,'excluded');
});

test('excluded employers match whole words and name the employer that matched',()=>{
  assert.equal(excludedEmployer('Northwind Mutual, Inc.',firm),'Northwind');
  assert.equal(excludedEmployer('CONTOSO   LIFE of New York',firm),'Contoso Life');
  assert.equal(excludedEmployer('Northwinds Aviation',firm),'','a longer word is a different employer');
  assert.equal(excludedEmployer('Axalta Coatings',{excluded_employers:['AXA']}),'');
  assert.equal(excludedEmployer('',firm),'');
  const quality=assessLead(lead,[],{now,compliance:firm});
  assert.equal(quality.status,'excluded');
  assert.match(leadScores(lead,quality,{now}).qualification.basis,/Northwind employees are excluded/);
  // Another firm's advisor is not bound by the Equitable rule.
  assert.notEqual(assessLead({...lead,company:'Equitable Holdings'},[],{now,compliance:firm}).status,'excluded');
});

test('a profile is cleaned: blanks and repeats dropped, lengths bounded',()=>{
  const p=complianceProfile({firm_name:'  Northwind   Advisors ',excluded_employers:['Northwind',' northwind ','','!!!',7]});
  assert.equal(p.firm_name,'Northwind Advisors');
  assert.deepEqual(p.excluded_employers,['Northwind','7'],'the first spelling is kept');
  assert.equal(complianceProfile({excluded_employers:Array.from({length:80},(_,i)=>`Employer ${i}`)}).excluded_employers.length,50);
});

test('settings are per advisor, validated, and survive saving other settings',async()=>{
  const {lab,db}=await fixture(),a={uid:'advisor-a',email:'a@example.com'},b={uid:'advisor-b',email:'b@example.com'};
  assert.deepEqual((await lab.settings(a)).configuration.compliance,DEFAULT_COMPLIANCE,'the default is shown before anything is saved');
  await assert.rejects(lab.settings(a,{configuration:{compliance:{firm_name:'',excluded_employers:['Northwind']}}}),{status:422});
  await assert.rejects(lab.settings(a,{configuration:{compliance:{firm_name:'Northwind Advisors',excluded_employers:['ab']}}}),{status:422});
  await assert.rejects(lab.settings(a,{configuration:{compliance:null}}),{status:422});
  assert.deepEqual((await lab.settings(a,{configuration:{compliance:firm}})).configuration.compliance,firm);
  // The daily-settings form sends no compliance profile: it must not reset it.
  const again=await lab.settings(a,{configuration:{states:['NY']},daily_enabled:false,daily_hour:9});
  assert.deepEqual(again.configuration.compliance,firm);assert.deepEqual(again.configuration.states,['NY']);
  // Saving other settings does not write the default as if it were chosen.
  await lab.settings(b,{configuration:{states:['NJ']}});
  assert.equal((await db.query("SELECT configuration->'compliance' AS c FROM lab_settings WHERE user_id='advisor-b'")).rows[0].c,null);
  assert.deepEqual((await lab.settings(b)).configuration.compliance,DEFAULT_COMPLIANCE,'one advisor never sees another advisor\'s firm');
});

test('imports reject people at the advisor\'s excluded employers, not at another firm\'s',async()=>{
  const {lab}=await fixture(),a={uid:'advisor-a',email:'a@example.com'},b={uid:'advisor-b',email:'b@example.com'};
  await lab.settings(a,{configuration:{compliance:firm}});
  const csv=suffix=>'First Name,Last Name,Company,Title,Email,Country\n'+[['Jamie','Example','Northwind Mutual'],['Robin','Sample','Equitable Holdings'],['Casey','Placeholder','Fabrikam Tools']]
    .map(([first,last,company])=>`${first},${last},${company},Director,${first.toLowerCase()}${suffix}@synthetic.example,US`).join('\n');
  const mine=await lab.importCSV(a,{source:'Test file',csv:csv('')});
  assert.equal(mine.result.rejected,1,'only the Northwind employee is excluded for a Northwind advisor');
  const theirs=await lab.importCSV(b,{source:'Test file',csv:csv('.b')});
  assert.equal(theirs.result.rejected,1,'the default profile still excludes the Equitable employee');
});

// The daily run is due at the advisor's own hour, in their own time zone.
async function scheduled(at) {
  const db=new PGlite();
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  for(const name of migrations)await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>pool.query(...a),release(){}})};
  const clock={at};
  const lab=createResearchLab({pool,now:()=>new Date(clock.at),sources:{readiness:{},quote:()=>0,run:async()=>({status:'completed',candidates:[]})}});
  const runs=async uid=>(await db.query('SELECT idempotency_key FROM lab_runs WHERE user_id=$1 ORDER BY idempotency_key',[uid])).rows.map(r=>r.idempotency_key);
  return {lab,clock,runs};
}
const daily={employers:['Example Manufacturing'],sources:['public_web']};

test('the local clock follows daylight saving',()=>{
  assert.deepEqual(localClock(new Date('2026-07-01T12:00:00Z'),'America/New_York'),{day:'2026-07-01',hour:8});
  assert.deepEqual(localClock(new Date('2026-12-01T12:00:00Z'),'America/New_York'),{day:'2026-12-01',hour:7});
  assert.deepEqual(localClock(new Date('2026-12-01T03:30:00Z'),'America/Los_Angeles'),{day:'2026-11-30',hour:19});
  assert.deepEqual(localClock(new Date('2026-12-01T03:30:00Z'),''),{day:'2026-12-01',hour:3});
});

test('each advisor\'s daily run starts at their own 8 a.m., once per local day',async()=>{
  const {lab,clock,runs}=await scheduled('2026-12-01T12:30:00Z');
  const east={uid:'east',email:'east@example.com'},west={uid:'west',email:'west@example.com'};
  await lab.settings(east,{daily_enabled:true,daily_hour:8,configuration:{...daily,daily_timezone:'America/New_York'}});
  await lab.settings(west,{daily_enabled:true,daily_hour:8,configuration:{...daily,daily_timezone:'America/Los_Angeles'}});
  await lab.scheduleDue();
  assert.deepEqual([await runs('east'),await runs('west')],[[],[]],'7:30 Eastern in winter is too early for both');
  clock.at='2026-12-01T13:05:00Z';await lab.scheduleDue();await lab.scheduleDue();
  assert.deepEqual([await runs('east'),await runs('west')],[['daily:2026-12-01'],[]],'8:05 Eastern, 5:05 Pacific');
  clock.at='2026-12-01T16:00:00Z';await lab.scheduleDue();
  assert.deepEqual(await runs('west'),['daily:2026-12-01']);
  // Late evening Pacific is already the next day in UTC: no second run.
  clock.at='2026-12-02T05:00:00Z';await lab.scheduleDue();
  assert.deepEqual([await runs('east'),await runs('west')],[['daily:2026-12-01'],['daily:2026-12-01']]);
  // Yesterday's run finishes on the queue before today's is due.
  while(await lab.tick());
  clock.at='2026-12-02T13:00:00Z';await lab.scheduleDue();
  assert.deepEqual(await runs('east'),['daily:2026-12-01','daily:2026-12-02']);
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
