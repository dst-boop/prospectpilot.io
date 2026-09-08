import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {createResearchJobs} from '../research-jobs.mjs';
test('jobs deduplicate, isolate users, retry and complete all sources',async()=>{
 const db=new PGlite();try{
 await db.exec(readFileSync(new URL('../migrations/004-research-jobs.sql',import.meta.url),'utf8'));
 let calls=0,dispatches=0;const queue=createResearchJobs({pool:db,dispatch:async()=>{dispatches++;return true;},runSource:async(_,source)=>({source,status:++calls===1?'partial':'no_match',records:[{excerpt:'saved lead evidence'}]})});
 const user={user_id:'u',email:'u@example.com'},a=await queue.enqueue('l',user,'identity'),b=await queue.enqueue('l',user,'identity');assert.equal(a.id,b.id);assert.equal(dispatches,1);
 assert.equal(await queue.status('l',{user_id:'other'}),null);
 await queue.tick();assert.equal((await queue.status('l',user)).next_source,0);
 await db.exec("UPDATE research_jobs SET available_at=now()-interval '1 second'");
 for(let i=0;i<12;i++)assert.equal(await queue.tick(),true);
 const completed=await queue.status('l',user);assert.equal(completed.status,'completed');assert.equal(completed.reports[0].attempt_count,2);assert.equal(completed.reports[0].saved_record_count,1);assert.equal('records' in completed.reports[0],false);assert.ok(completed.reports.every(r=>Number.isInteger(r.last_attempt_ms)&&r.last_attempt_ms>=0));assert.equal(await queue.tick(),false);
 }finally{await db.close();}
});
test('expired leases recover and changed identity terminates',async()=>{
 const db=new PGlite();try{
 await db.exec(readFileSync(new URL('../migrations/004-research-jobs.sql',import.meta.url),'utf8'));
 const queue=createResearchJobs({pool:db,runSource:async()=>{throw Object.assign(Error('changed'),{status:409});}});
 const user={user_id:'u',email:'u@example.com'};await queue.enqueue('l',user,'old');
 await db.exec("UPDATE research_jobs SET status='running',lease_until=now()-interval '1 minute'");
 await queue.tick();assert.equal((await queue.status('l',user)).status,'failed');
 }finally{await db.close();}
});

test('explicit failed source results retry before advancing',async()=>{const db=new PGlite();try{await db.exec(readFileSync(new URL('../migrations/004-research-jobs.sql',import.meta.url),'utf8'));const queue=createResearchJobs({pool:db,runSource:async(_,source)=>({source,status:'failed',records:[]})});const user={user_id:'u',email:'u@example.com'};await queue.enqueue('l',user,'x');await queue.tick();assert.equal((await queue.status('l',user)).next_source,0);assert.equal((await db.query('SELECT attempts FROM research_jobs')).rows[0].attempts,1);}finally{await db.close();}});

test('permanent coverage gaps advance immediately while remaining visible',async()=>{const db=new PGlite();try{await db.exec(readFileSync(new URL('../migrations/004-research-jobs.sql',import.meta.url),'utf8'));const queue=createResearchJobs({pool:db,runSource:async(_,source)=>({source,status:'partial',retryable:false,limitations:['Coverage incomplete'],records:[]})});const user={user_id:'u',email:'u@example.com'};await queue.enqueue('l',user,'x');for(let i=0;i<12;i++)assert.equal(await queue.tick(),true);const result=await queue.status('l',user);assert.equal(result.status,'completed_with_gaps');assert.equal(result.reports.length,12);assert.equal(result.reports[0].limitations[0],'Coverage incomplete');}finally{await db.close();}});
