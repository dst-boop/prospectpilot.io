import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeResearch,identityMatch,publicIPv4,publicGet} from '../native-research.mjs';
const lead={id:'one',first_name:'Jane',last_name:'Smith',company:'Example Consulting',city:'Albany',location:'Albany',company_website:'https://example.com/'};
test('native matching refuses unrelated people, companies and unknown location; egress blocks private addresses',()=>{
 assert.equal(identityMatch(lead,'Jane Smith at Other Boards in New York','person'),false);
 assert.equal(identityMatch(lead,'Example Consultinghouse Albany','company'),false);
 assert.equal(identityMatch(lead,'Example Consulting in Albany','company'),true);
 assert.equal(identityMatch({...lead,city:'',location:''},'Example Consulting','company'),false);
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','100.64.1.1','::1','198.18.0.1'])assert.equal(publicIPv4(ip),false);
 assert.equal(publicIPv4('8.8.8.8'),true);
});
test('all categories run without credentials; unrelated search snippets are not saved',async()=>{
 const seen=[];
 const engine=createNativeResearch({get:async value=>{
 const url=String(value);seen.push(url);
 if(url.includes('gdelt'))return {text:JSON.stringify({articles:[{url:'https://example.com/page',title:'Jane Smith Example Consulting Albany'}]})};
 if(url.includes('wikidata'))return {text:JSON.stringify({search:[]})};
 if(url.includes('cityofnewyork'))return {text:JSON.stringify([{vendor_formal_name:'Wrong Company',city:'Albany'}])};
 if(url.includes('crossref'))return {text:JSON.stringify({message:{items:[]}})};
 if(url.includes('cms.hhs'))return {text:JSON.stringify({results:[]})};
 if(url.endsWith('/robots.txt'))return {text:'User-agent: *\nAllow: /'};
 return {url,text:'<p>Other Boards at an unrelated company.</p>',type:'text/html'};
 }});
 for(const source of ['website','registry','license','professional','announcement','news','association','maps','sec','expertise','warn','mwbe']){
 const result=await engine(lead,source);assert.equal(result.records.length,0);assert.equal(result.source,source);assert.ok(result.coverage);
 }
 assert.ok(seen.some(u=>u.includes('crossref')));assert.ok(seen.some(u=>u.includes('cityofnewyork')));assert.ok(seen.some(u=>u.includes('cms.hhs')));
});
test('matching public evidence is brief, marked machine matched, deduplicated and robots are respected',async()=>{
 let blocked=false;
 const engine=createNativeResearch({get:async value=>{
 const url=String(value);
 if(url.includes('gdelt'))return {text:'{"articles":[]}'};
 if(url.includes('wikidata'))return {text:'{"search":[]}'};
 if(url.endsWith('/robots.txt'))return {text:blocked?'User-agent: *\nDisallow: /':'User-agent: *\nAllow: /'};
 return {url,type:'text/html',text:'<p>Jane Smith leads Example Consulting in Albany. '+('Expert business services. '.repeat(100))+'</p>'};
 }});
 let result=await engine(lead,'website');assert.equal(result.records.length,1);assert.equal(result.records[0].status,'machine_matched');assert.ok(result.records[0].excerpt.split(/\s+/).length<=20);assert.equal(result.records[0].priority_score,undefined);
 blocked=true;result=await engine(lead,'website');assert.equal(result.records.length,0);assert.equal(result.status,'partial');
});
test('provider outages produce honest partial results and no invented records',async()=>{
 const engine=createNativeResearch({get:async()=>{throw Error('offline');}});
 const r=await engine(lead,'mwbe');assert.equal(r.status,'partial');assert.equal(r.records.length,0);assert.ok(r.limitations.length);
});

test('public source cache reuses successful responses and respects entry limits',async()=>{
 const {createCachedGet}=await import('../native-research.mjs');let calls=0;
 const get=createCachedGet(async u=>{calls++;if(u==='bad')throw Error('unavailable');return {text:u,type:'text/plain',url:u};},{maxEntries:1,maxBytes:100});
 await get('a');await get('a');assert.equal(calls,1);
 await get('b');await get('a');assert.equal(calls,3);
 await assert.rejects(get('bad'));await assert.rejects(get('bad'));assert.equal(calls,5);
 await assert.rejects(get('a',{signal:AbortSignal.abort()}));
});

test('cache expiry refreshes content and recently used entries survive eviction',async()=>{const {createCachedGet}=await import('../native-research.mjs');let time=0,calls=0;const get=createCachedGet(async u=>({text:u+' '+(++calls)}),{ttl:10,maxEntries:2,maxBytes:100,now:()=>time});await get('a');await get('b');await get('a');await get('c');assert.equal(calls,3);await get('a');assert.equal(calls,3);time=11;await get('a');assert.equal(calls,4);assert.throws(()=>createCachedGet(async()=>{}, {maxEntries:0}),/limits/);});

test('malformed API success responses are not cached across retries',async()=>{const {createCachedGet}=await import('../native-research.mjs');let calls=0;const get=createCachedGet(async()=>({text:++calls===1?'temporarily unavailable':'{\"data\":[]}'}));await assert.rejects(get('api',{format:'json'}),SyntaxError);assert.deepEqual(JSON.parse((await get('api',{format:'json'})).text),{data:[]});await get('api',{format:'json'});assert.equal(calls,2);});
