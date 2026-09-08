import test from 'node:test';import assert from 'node:assert/strict';import {parseWarn,dateValue,createWarnService} from '../warn.mjs';
const base='https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/';
const csv='Business Legal Name,Date Layoff/Closure Starts,Date of WARN Notice ,Date Posted,Impacted Site Address,Impacted Site County,Layoff or Closure?,Number of Affected Workers,Number of Affected Workers\n"Example Consulting, LLC",2026-09-30,2026-07-01,2026-07-02,"123 Main Street, Albany, NY",Albany,Closure,42,42';

test('published timestamp, compact and written dates normalize without guessing ranges or centuries',()=>{
 for(const value of ['2026-01-02 00:00:00','2026-01-02T13:05:00Z','20260102','2026/1/2','January 2, 2026','Jan. 2 2026'])assert.equal(dateValue(value),'2026-01-02');
 for(const value of ['1/2/26','20260230','January 32, 2026','2026-01-02 25:00:00','January 2, 2026 to January 4, 2026','2026/13/2'])assert.equal(dateValue(value),null);
});

test('rows explicitly labeled non-WARN are excluded from WARN counts',()=>{
 const parsed=parseWarn('Company,WARN Notice,Initial Date Reported\nExample,True,2026-01-01 00:00:00\nOther,False,2026-01-02 00:00:00','IL');assert.equal(parsed.events.length,1);assert.equal(parsed.excluded_non_warn,1);assert.equal(parsed.events[0].notice_date,'2026-01-01');
});

test('misaligned source rows are counted and unsafe worker numbers remain unknown',()=>{
 const parsed=parseWarn('Company,Employees Affected,Notice Date\nExample,42,2026-01-01,extra\nOther,999999999999999999999,2026-01-01','NY');assert.equal(parsed.malformed_rows,1);assert.equal(parsed.events.length,1);assert.equal(parsed.events[0].workers,null);
});

test('known Wisconsin header repair and omitted unused trailing fields preserve aligned records',()=>{
 const wi=parseWarn('Company,City,Affected Workers,Notice Received,Original Notice Type / Update Type,Layoff Begin Date,NAICS Description,CountyWorkforce Development Area\nExample,City,12,20260102,Closure,2026-03-01,Industry,Example County,Region','WI');assert.equal(wi.events[0].county,'Example County');assert.equal(wi.schema_notes.length,1);assert.equal(wi.malformed_rows,0);
 const shorter=parseWarn('Company,Notice Date,Unused Notes\nExample,2026-01-01','IA');assert.equal(shorter.events.length,1);assert.equal(shorter.malformed_rows,0);
});
test('current NY schema preserves distinct dates and duplicate worker columns',()=>{const r=parseWarn(csv,'NY');assert.equal(r.events.length,1);assert.equal(r.events[0].employer,'Example Consulting, LLC');assert.equal(r.events[0].notice_date,'2026-07-01');assert.equal(r.events[0].effective_date,'2026-09-30');assert.equal(r.events[0].workers,42);assert.equal(r.events[0].county,'Albany');});
test('Maryland headerless format is recognized; date ranges are not guessed',()=>{const r=parseWarn('\n08/31/2026,459510,Example Consulting,Albany,Albany County,136,10/31/2026 - 11/30/2026,Plant Closure','MD');assert.equal(r.events[0].notice_date,'2026-08-31');assert.equal(r.events[0].effective_date,null);assert.ok(r.events[0].date_note.includes('11/30'));assert.equal(dateValue('2026-02-30'),null);assert.throws(()=>parseWarn('Strange,Columns\nA,B','NY'),/employer/);});
test('feed service queries, caches, reports missing coverage and matches employer without individual inference',async()=>{
 let calls=0;const service=createWarnService({officialTexas:false,get:async url=>{calls++;return {text:String(url).endsWith('.json')?JSON.stringify([{state:'NY',format:'csv',url:base+'ny.csv'}]):csv};}});
 const q=await service.query({state:'NY',company:'Example'});assert.equal(q.total,1);assert.equal(q.coverage.length,51);assert.equal(q.coverage.find(x=>x.state==='TX').status,'not_published');
 assert.equal((await service.query({from:'2027-01-01'})).total,0);assert.equal(calls,3);assert.equal(q.published_at,null);
 const r=await service.research({company:'Example Consulting'});assert.equal(r.retryable,false);assert.equal(r.records.length,1);assert.equal(r.records[0].event.workers,42);assert.match(r.limitations[0],/does not establish/);
 assert.equal((await service.research({company:'Unrelated Corporation'})).records.length,0);
});
test('feed failures and unexpected manifest URLs fail closed',async()=>{
 const service=createWarnService({officialTexas:false,get:async()=>({text:JSON.stringify([{state:'NY',format:'csv',url:'https://evil.example/ny.csv'}])})});
 const result=await service.research({company:'Example Consulting'});assert.equal(result.retryable,true);assert.equal(result.status,'partial');assert.equal(result.records.length,0);assert.match(result.limitations[0],/could not be loaded/);
});

test('WARN retains official notice links and falls back safely for non-government URLs',()=>{
 const prefix='Company,Notice Date,Source URL\nExample,2026-01-01,';
 const official=parseWarn(prefix+'https://dol.ny.gov/notices/example','NY').events[0];assert.equal(official.source_url,'https://dol.ny.gov/notices/example');assert.equal(official.feed_url,base+'ny.csv');
 for(const url of ['javascript:alert(1)','https://dol.ny.gov.evil.example/a','https://user:password@dol.ny.gov/a'])assert.equal(parseWarn(prefix+url,'NY').events[0].source_url,base+'ny.csv');
});

test('WARN reports undated records, archive fingerprint and stale research coverage',async()=>{
 const get=async url=>({text:url.endsWith('.json')?JSON.stringify([{state:'NY',format:'csv',url:base+'ny.csv'}]):url.endsWith('.txt')?'2020-01-01T00:00:00Z':'Company,Notice Date\nExample,2026-01-01\nExample,'});
 const service=createWarnService({officialTexas:false,get});const q=await service.query();const state=q.coverage.find(x=>x.state==='NY');assert.equal(state.unknown_notice_dates,1);assert.equal(state.latest_notice_date,'2026-01-01');assert.match(state.sha256,/^[a-f0-9]{64}$/);
 const r=await service.research({company:'Example'});assert.equal(r.publication_stale,true);assert.ok(r.limitations.some(x=>x.includes('48 hours')));
});

test('duplicate manifest states and future publication dates do not become fresh coverage',async()=>{
 const feed={state:'NY',format:'csv',url:base+'ny.csv'};
 await assert.rejects(createWarnService({officialTexas:false,get:async()=>({text:JSON.stringify([feed,feed])})}).load(),/Duplicate/);
 const service=createWarnService({officialTexas:false,get:async url=>({text:url.endsWith('.json')?JSON.stringify([feed]):url.endsWith('.txt')?'2099-01-01T00:00:00Z':csv})});
 assert.equal((await service.load()).published_at,null);
});

test('official Texas source adds coverage with its own publication date and source URL',async()=>{
 const get=async url=>({text:url.includes('/resource/')?'notice_date,job_site_name,county_name,total_layoff_number,layoff_date,city_name\n2026-01-01T00:00:00.000,Texas Example,County,23,2026-03-01T00:00:00.000,Austin':url.includes('/api/views/')?JSON.stringify({rowsUpdatedAt:1577836800}):url.endsWith('.json')?JSON.stringify([{state:'NY',format:'csv',url:base+'ny.csv'}]):url.endsWith('.txt')?new Date().toISOString():csv});
 const service=createWarnService({get});const q=await service.query({state:'TX'});assert.equal(q.total,1);assert.equal(q.events[0].workers,23);assert.equal(q.events[0].county,'County');assert.match(q.events[0].source_url,/data.texas.gov\/dataset/);
 const tx=q.coverage.find(c=>c.state==='TX');assert.equal(tx.publication_stale,true);assert.equal(q.publication_stale,false);
});
