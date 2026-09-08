import test from 'node:test';import assert from 'node:assert/strict';import {parseWarn,dateValue,createWarnService} from '../warn.mjs';
const base='https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/';
const csv='Business Legal Name,Date Layoff/Closure Starts,Date of WARN Notice ,Date Posted,Impacted Site Address,Impacted Site County,Layoff or Closure?,Number of Affected Workers,Number of Affected Workers\n"Example Consulting, LLC",2026-09-30,2026-07-01,2026-07-02,"123 Main Street, Albany, NY",Albany,Closure,42,42';
test('current NY schema preserves distinct dates and duplicate worker columns',()=>{const r=parseWarn(csv,'NY');assert.equal(r.events.length,1);assert.equal(r.events[0].employer,'Example Consulting, LLC');assert.equal(r.events[0].notice_date,'2026-07-01');assert.equal(r.events[0].effective_date,'2026-09-30');assert.equal(r.events[0].workers,42);assert.equal(r.events[0].county,'Albany');});
test('Maryland headerless format is recognized; date ranges are not guessed',()=>{const r=parseWarn('\n08/31/2026,459510,Example Consulting,Albany,Albany County,136,10/31/2026 - 11/30/2026,Plant Closure','MD');assert.equal(r.events[0].notice_date,'2026-08-31');assert.equal(r.events[0].effective_date,null);assert.ok(r.events[0].date_note.includes('11/30'));assert.equal(dateValue('2026-02-30'),null);assert.throws(()=>parseWarn('Strange,Columns\nA,B','NY'),/employer/);});
test('feed service queries, caches, reports missing coverage and matches employer without individual inference',async()=>{
 let calls=0;const service=createWarnService({get:async url=>{calls++;return {text:String(url).endsWith('.json')?JSON.stringify([{state:'NY',format:'csv',url:base+'ny.csv'}]):csv};}});
 const q=await service.query({state:'NY',company:'Example'});assert.equal(q.total,1);assert.equal(q.coverage.length,51);assert.equal(q.coverage.find(x=>x.state==='TX').status,'not_published');
 assert.equal((await service.query({from:'2027-01-01'})).total,0);assert.equal(calls,3);assert.equal(q.published_at,null);
 const r=await service.research({company:'Example Consulting'});assert.equal(r.retryable,false);assert.equal(r.records.length,1);assert.equal(r.records[0].event.workers,42);assert.match(r.limitations[0],/does not establish/);
 assert.equal((await service.research({company:'Unrelated Corporation'})).records.length,0);
});
test('feed failures and unexpected manifest URLs fail closed',async()=>{
 const service=createWarnService({get:async()=>({text:JSON.stringify([{state:'NY',format:'csv',url:'https://evil.example/ny.csv'}])})});
 const result=await service.research({company:'Example Consulting'});assert.equal(result.retryable,true);assert.equal(result.status,'partial');assert.equal(result.records.length,0);assert.match(result.limitations[0],/could not be loaded/);
});
