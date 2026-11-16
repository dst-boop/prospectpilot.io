import test from 'node:test';
import assert from 'node:assert/strict';
import {createWarnService} from '../warn.mjs';

const base='https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/';
const at=Date.UTC(2026,10,16,12);
const feed=state=>({state,format:'csv',url:base+state.toLowerCase()+'.csv'});
const result=value=>({text:typeof value==='string'?value:JSON.stringify(value)});
const texas='job_site_name,notice_date,layoff_date,total_layoff_number,city_name\nExample Manufacturing,2026-11-01,2026-12-01,23,Austin';
function official(url){
  if(url.startsWith('https://data.texas.gov/resource/'))return result(texas);
  if(url.startsWith('https://data.texas.gov/api/views/'))return result({rowsUpdatedAt:at/1000});
  throw Error('Unexpected URL: '+url);
}

test('a missing mirror does not disable the independent Texas source or claim absent states have zero notices',async()=>{
  const calls=[];
  const service=createWarnService({now:()=>at,get:async url=>{
    calls.push(url);if(url===base+'warn_feeds.json')throw Error('HTTP 404');return official(url);
  }});
  const data=await service.query();
  assert.equal(data.manifest_available,false);assert.equal(data.retryable,true);
  assert.equal(data.coverage.length,51);assert.equal(data.total,1);
  assert.ok(!calls.includes(base+'updated_at.txt'),'an unvalidated mirror cannot supply a publication date');
  assert.equal(data.coverage.find(c=>c.state==='TX').publication_stale,false);
  assert.equal(data.coverage.find(c=>c.state==='TX').publication_basis,'official_dataset');
  for(const state of data.coverage.filter(c=>c.state!=='TX'))assert.deepEqual(state,{state:state.state,status:'unavailable',rows:null});
  const research=await service.research({company:'Example Manufacturing',first_name:'Synthetic',last_name:'Person',state:'NY'});
  assert.equal(research.status,'matched');assert.equal(research.records[0].scope,'company');
  assert.equal(research.records[0].event.state,'TX','the notice keeps its own worksite, not the person\'s location');
  assert.match(research.limitations.join(' '),/person or their workplace/);
  assert.match(research.limitations.join(' '),/manifest unavailable/);
  assert.equal((await service.research({company:'Other Company'})).status,'partial');
});

test('invalid mirror manifests are rejected atomically while only the configured official source runs',async()=>{
  for(const manifest of [[feed('NY'),{...feed('NJ'),url:'https://untrusted.example/private.csv'}],[feed('NY'),feed('NY')],[null],[]]){
    const calls=[];
    const data=await createWarnService({now:()=>at,get:async url=>{calls.push(url);return url===base+'warn_feeds.json'?result(manifest):official(url);}}).load();
    assert.equal(data.manifest_available,false);assert.equal(data.events.length,1);
    assert.deepEqual(calls,[base+'warn_feeds.json','https://data.texas.gov/resource/8w53-c4f6.csv?$limit=50000','https://data.texas.gov/api/views/8w53-c4f6.json']);
  }
});

test('a stalled mirror request is cancelled before it can exhaust the independent source budget',async()=>{
  let cancelled=false;
  const data=await createWarnService({now:()=>at,requestTimeoutMs:20,get:async(url,{signal})=>{
    if(url!==base+'warn_feeds.json'){assert.equal(signal.aborted,false);return official(url);}
    return new Promise((resolve,reject)=>{
      const guard=setTimeout(()=>reject(Error('Request was not cancelled')),2000);
      signal.addEventListener('abort',()=>{clearTimeout(guard);cancelled=true;reject(signal.reason);},{once:true});
    });
  }}).load();
  assert.equal(cancelled,true);assert.equal(data.events.length,1);assert.equal(data.manifest_available,false);
});

test('a transient mirror outage is retried after one minute, not cached for an hour',async()=>{
  let clock=at,attempts=0;
  const service=createWarnService({now:()=>clock,get:async url=>{
    if(url===base+'warn_feeds.json'){if(++attempts===1)throw Error('HTTP 503');return result([feed('NY')]);}
    if(url===base+'updated_at.txt')return result(new Date(clock).toISOString());
    if(url===base+'ny.csv')return result('Company,Notice Date\nNew York Example,2026-11-01');
    return official(url);
  }});
  assert.equal((await service.load()).manifest_available,false);
  clock+=59000;assert.equal((await service.load()).manifest_available,false);assert.equal(attempts,1);
  clock+=1001;const recovered=await service.load();
  assert.equal(recovered.manifest_available,true);assert.equal(attempts,2);assert.equal(recovered.events.length,2);
  assert.equal(recovered.coverage.find(c=>c.state==='NY').status,'loaded');
  assert.equal(recovered.coverage.find(c=>c.state==='CA').status,'not_published');
});

test('loaded empty, unavailable, and not published are distinct, and no match is never an individual no-layoff finding',async()=>{
  const service=createWarnService({officialTexas:false,now:()=>at,get:async url=>{
    if(url===base+'warn_feeds.json')return result([feed('NY'),feed('NJ')]);
    if(url===base+'updated_at.txt')return result(new Date(at).toISOString());
    if(url===base+'ny.csv')return result('Company,Notice Date\n');
    throw Error('HTTP 503');
  }});
  const data=await service.query();assert.equal(data.total,0);
  assert.deepEqual([data.coverage.find(c=>c.state==='NY').status,data.coverage.find(c=>c.state==='NY').rows],['loaded',0]);
  assert.deepEqual(data.coverage.find(c=>c.state==='NJ'),{state:'NJ',status:'unavailable',rows:null});
  assert.deepEqual(data.coverage.find(c=>c.state==='CA'),{state:'CA',status:'not_published',rows:null});
  const research=await service.research({company:'Example Manufacturing'});
  assert.equal(research.status,'partial');assert.equal(research.retryable,true);assert.deepEqual(research.records,[]);
});

test('an individual feed failure is retryable and recovers independently of an already valid manifest',async()=>{
  let clock=at,attempts=0;
  const service=createWarnService({officialTexas:false,now:()=>clock,get:async url=>{
    if(url===base+'warn_feeds.json')return result([feed('NY')]);
    if(url===base+'updated_at.txt')return result(new Date(clock).toISOString());
    if(++attempts===1)throw Error('HTTP 503');return result('Company,Notice Date\nExample Manufacturing,2026-11-01');
  }});
  assert.equal((await service.research({company:'Example Manufacturing'})).retryable,true);
  clock+=60001;
  const recovered=await service.research({company:'Example Manufacturing'});
  assert.equal(recovered.status,'matched');assert.equal(recovered.retryable,false);assert.equal(recovered.records.length,1);
});

test('mirror freshness cannot replace an official source date, and absent metadata stays unknown',async()=>{
  for(const updatedAt of [undefined,at/1000+600,(at-72*3600000)/1000]){
    const data=await createWarnService({now:()=>at,get:async url=>{
      if(url===base+'warn_feeds.json')return result([feed('NY')]);
      if(url===base+'updated_at.txt')return result(new Date(at).toISOString());
      if(url===base+'ny.csv')return result('Company,Notice Date\n');
      if(url.startsWith('https://data.texas.gov/api/views/'))return result({rowsUpdatedAt:updatedAt});
      return official(url);
    }}).load();
    const tx=data.coverage.find(c=>c.state==='TX');
    assert.equal(data.publication_stale,false);
    assert.equal(tx.publication_stale,updatedAt<at/1000?true:null);
    if(!tx.publication_stale)assert.equal(tx.published_at,null);
  }
});

test('request deadlines cannot be missing or consume the full WARN source budget',()=>{
  for(const requestTimeoutMs of [0,-1,NaN,Infinity,45000])assert.throws(()=>createWarnService({get:()=>{},requestTimeoutMs}),/deadline/);
});


test('fresh mirror publication does not imply state observation freshness or fill unknown notice dates',async()=>{
  const service=createWarnService({now:()=>at,get:async url=>{
    if(url===base+'warn_feeds.json')return result([feed('NY')]);
    if(url===base+'updated_at.txt')return result(new Date(at).toISOString());
    if(url===base+'ny.csv')return result('Company,Notice Date,Effective Date\nExample Manufacturing,,2026-12-01\nExample Manufacturing,11/1/26,Winter 2026');
    if(url.startsWith('https://data.texas.gov/api/views/'))return result({rowsUpdatedAt:Date.UTC(2026,6,7,18,15,59)/1000});
    return official(url);
  }});
  const data=await service.query();
  assert.equal(data.publication_basis,'mirror');assert.equal(data.publication_stale,false);
  const ny=data.coverage.find(c=>c.state==='NY'),tx=data.coverage.find(c=>c.state==='TX');
  assert.equal(ny.publication_basis,'mirror');assert.equal(ny.unknown_notice_dates,2);assert.equal(ny.unknown_effective_dates,1);
  assert.equal(ny.latest_notice_date,null);assert.equal(tx.publication_basis,'official_dataset');assert.equal(tx.publication_stale,true);
  assert.deepEqual(data.coverage.find(c=>c.state==='CA'),{state:'CA',status:'not_published',rows:null});
  const research=await service.research({company:'Example Manufacturing'});
  assert.equal(research.publication_basis,'mirror');
  assert.match(research.limitations.join(' '),/NY: underlying state-source observation date is unknown; mirror publication does not establish source freshness/);
  assert.match(research.limitations.join(' '),/TX: official dataset update is over 48 hours old/);
  assert.match(research.limitations.join(' '),/NY: 2 unknown notice dates; 1 unknown effective dates/);
  assert.match(research.limitations.join(' '),/CA: not published in the mirror manifest/);
  assert.equal(research.records.filter(r=>r.event.state==='NY').every(r=>r.source_date===null&&r.event.notice_date===null),true);
});
