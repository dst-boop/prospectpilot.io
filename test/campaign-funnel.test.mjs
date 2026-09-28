import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab,runFunnel} from '../research-lab.mjs';

// A campaign read as a funnel, so an empty result explains itself. Counts come
// only from what the run recorded; the sources are stubs.
const stage=(f,key)=>f.stages.find(s=>s.key===key);
const lost=(s,reason)=>s.lost?.find(l=>l.reason===reason)?.count||0;

test('each stage counts what got through and names why the rest stopped',()=>{
  const task=(company,status,result)=>({source:'public_web',payload:{company},status,result});
  const f=runFunnel({
    companies:[{name:'A',queued:true},{name:'B',queued:true},{name:'C',queued:true},{name:'D',queued:false,skip_reason:'Researched in the last 7 days.'}],
    tasks:[{source:'market',payload:{},status:'completed',result:{}},
      task('A','completed',{pages_checked:4,discovered:3,off_target:5,added:2,duplicates:1,rejected:0,ambiguous:0,errors:[]}),
      task('B','partial',{pages_checked:1,discovered:0,errors:['Publisher disallows automated access to this page.','Publisher disallows automated access to this page.']}),
      task('C','skipped',{errors:['Daily provider budget reached. No paid request made.']})],
    statuses:{verified:1,promising:1,incomplete:1}});
  assert.equal(stage(f,'companies_found').count,4);
  const researched=stage(f,'companies_researched');
  assert.equal(researched.count,2);
  assert.equal(lost(researched,'Researched in the last 7 days.'),1);assert.equal(lost(researched,'Daily provider budget reached'),1);
  const pages=stage(f,'pages_read');assert.equal(pages.count,5);assert.equal(lost(pages,'Site blocks automated reading'),1,'one company, counted once');
  assert.equal(stage(f,'people_found').count,8);
  const kept=stage(f,'people_kept');assert.equal(kept.count,3);assert.equal(lost(kept,'Other titles, not kept'),5);
  assert.equal(stage(f,'people_saved').count,3);assert.match(stage(f,'people_saved').detail,/2 new · 1 already on file/);
  const promising=stage(f,'promising');assert.equal(promising.count,2);assert.equal(lost(promising,'Evidence still needed'),1);
  assert.equal(stage(f,'qualified').count,1);
  assert.deepEqual(f.stages.map(s=>s.key),['companies_found','companies_researched','pages_read','people_found','people_kept','people_saved','promising','qualified']);
});

test('a run with nothing found still says where it stopped, and zero losses are not listed',()=>{
  const f=runFunnel({tasks:[{source:'public_web',payload:{company:'Nowhere Co'},status:'partial',result:{errors:['No official website was found in the free index. Add an employer website or enable licensed web search.']}}]});
  assert.equal(stage(f,'companies_found').count,1,'named employers count as found');
  assert.equal(lost(stage(f,'companies_researched'),'No company website found'),0,'a partial task still ran');
  assert.equal(lost(stage(f,'pages_read'),'No company website found'),1);
  assert.deepEqual(stage(f,'people_kept').lost,[],'no off-target people, no line for them');
  const odd=runFunnel({tasks:[{source:'sec',payload:{company:'X'},status:'skipped',result:{errors:['Synthetic demo: no external provider calls.']}}]});
  assert.equal(lost(stage(odd,'companies_researched'),'Synthetic demo: no external provider calls.'),1,'an unrecognised reason is shown as recorded');
  assert.deepEqual(stage(odd,'pages_read').lost,[],'a skipped task read no pages');
  // Two sources failing one company for the same reason count that company once.
  const twice=runFunnel({tasks:[{source:'public_web',payload:{company:'Y'},status:'partial',result:{errors:['Public page unavailable.']}},{source:'sec',payload:{company:'Y'},status:'partial',result:{errors:['Source unavailable or timed out.']}},
    {source:'sec',payload:{company:'Z'},status:'partial',result:{errors:['Source unavailable or timed out.']}}]});
  assert.equal(lost(stage(twice,'pages_read'),'Page or source unavailable'),2);
  // Matches held by another advisor are counted by the task but never linked to the run.
  const other=runFunnel({tasks:[{source:'public_web',payload:{company:'W'},status:'completed',result:{discovered:2,added:0,duplicates:2}}],statuses:{}});
  const saved=stage(other,'people_saved');
  assert.equal(saved.count,0);assert.equal(lost(saved,'Already held by another advisor'),2);assert.match(saved.detail,/0 new · 0 already on file/);
});

const migrations=['006-research-lab','017-forget','012-plan-catalog-summary','007-quality-v2','008-prospect-workspace','013-advisor-workflow','014-outreach-cadence','015-dial-budget','016-inbound-contact','021-lab-companies','022-identity-reviews'];
test('run details carry the funnel for a discovery run, built from the stored results',async()=>{
  const db=new PGlite();
  try{
    await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
    for(const name of migrations)await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>pool.query(...a),release(){}})};
    const people=[{name:'Pat Owens',company:'Bright Spark Electric',current_title:'Owner',email:'pat@brightspark.example',country:'US'},
      {name:'Sam Lee',company:'Bright Spark Electric',current_title:'Office Assistant',email:'sam@brightspark.example',country:'US'}];
    const lab=createResearchLab({pool,sources:{readiness:{},quote:()=>0,
      market:async()=>({status:'completed',companies:[{name:'Bright Spark Electric',website:'',location:'Huntington, NY',distance_miles:2}],errors:[]}),
      run:async()=>({status:'completed',candidates:people,pages_checked:3})}});
    const user={uid:'owner',email:'owner@example.com'};
    const run=await lab.enqueue(user,{location:'11747',industries:['Electrical contractors'],titles:['Owner'],sources:['public_web'],idempotency_key:'f1'});
    while(await lab.tick());
    const {funnel}=await lab.runDetail(user,run.id);
    assert.deepEqual(funnel.stages.map(s=>[s.key,s.count]),[['companies_found',1],['companies_researched',1],['pages_read',3],['people_found',2],['people_kept',1],['people_saved',1],['promising',0],['qualified',0]]);
    assert.equal(lost(stage(funnel,'people_kept'),'Other titles, not kept'),1);
    assert.equal(lost(stage(funnel,'promising'),'Evidence still needed'),1);
    const imported=await lab.importCSV(user,{csv:'First Name,Last Name,Company\nJo,Park,Example Co'});
    assert.equal((await lab.runDetail(user,imported.run.id)).funnel,null,'imports are not campaigns');
  }finally{await db.close();}
});
