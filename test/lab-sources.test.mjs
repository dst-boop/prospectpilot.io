import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabSources,proxyCandidates} from '../lab-sources.mjs';
const response=(text,url,type='application/json')=>({text:typeof text==='string'?text:JSON.stringify(text),url:String(url),type});
test('SEC proxy rows pair age with the named person, never an unrelated numeric table',()=>{
  const html='<table><tr><th>Name</th><th>Age</th><th>Position</th></tr><tr><td>Jamie Rivera</td><td>62</td><td>Director</td></tr><tr><td>Total Employees</td><td>60</td><td>Revenue</td></tr></table>';
  const people=proxyCandidates(html,'https://www.sec.gov/Archives/example.html','Example','2026-04-01');assert.equal(people.length,1);assert.equal(people[0].estimated_age_range,'62');assert.equal(people[0].evidence[0].source_date,'2026-04-01');assert.equal(people[0].email,undefined);
});
test('company biographies preserve source links and never use employer address as residence',async()=>{
  const get=async(url)=>{url=String(url);if(url.endsWith('/robots.txt'))return response('',url,'text/plain');return response('<title>Example Manufacturing</title><script type="application/ld+json">{"@type":"Person","name":"Jamie Rivera","jobTitle":"Director","worksFor":{"name":"Example Manufacturing"},"sameAs":["https://www.linkedin.com/in/jamie-rivera"]}</script>',url,'text/html');};
  const sources=createLabSources({get});const result=await sources.run('public_web',{company:'Example Manufacturing',website:'https://example.org/team',city:'Albany',state:'NY'});assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].state,undefined);assert.equal(result.candidates[0].company_location,'Albany, NY');assert.equal(result.candidates[0].linkedin_url,'https://www.linkedin.com/in/jamie-rivera');
});
test('robots denials, unrelated search pages and provider failures remain visible gaps',async()=>{
  let pageRead=false;const get=async url=>{if(String(url).endsWith('/robots.txt'))return response('User-agent: *\nDisallow: /',url,'text/plain');pageRead=true;return response('',url,'text/html');};
  const blocked=await createLabSources({get}).run('public_web',{company:'Example',website:'https://example.org/team'});assert.equal(pageRead,false);assert.equal(blocked.status,'partial');assert.equal(blocked.candidates.length,0);
  const missing=createLabSources({get});assert.equal(missing.quote('web_search'),null);
  const paid=createLabSources({searchKey:'fixture',searchCostMicros:5000,apiFetch:async()=>new Response('',{status:503})});await assert.rejects(paid.run('web_search',{company:'Example'}),/503/);
});
test('WARN results always remain employer-level context and never emit individual layoffs',async()=>{
  const sources=createLabSources({warn:{research:async()=>({status:'matched',records:[{scope:'company',excerpt:'Employer notice'}]})}});const r=await sources.run('warn',{company:'Example'});assert.deepEqual(r.candidates,[]);assert.equal(r.scope,'employer');
});

test('public pages use applicable robots groups and query restrictions',async()=>{
 let reads=0;const get=async url=>String(url).endsWith('/robots.txt')?response('User-agent: OtherBot\nDisallow: /\nUser-agent: *\nDisallow: /*?private=',url,'text/plain'):(reads++,response('<title>Example Company</title>',url,'text/html'));
 const sources=createLabSources({get});await sources.run('public_web',{company:'Example Company',website:'https://example.org/team'});assert.equal(reads,1);
 const blocked=await sources.run('public_web',{company:'Example Company',website:'https://example.org/team?private=yes'});assert.equal(reads,1);assert.equal(blocked.status,'partial');
});

test('SEC short employer names offer legal-name suggestions without assigning another entity',async()=>{
 const sources=createLabSources({get:async url=>{
  assert.equal(String(url),'https://www.sec.gov/files/company_tickers.json');
  return response({0:{title:'EXAMPLE COMMUNICATIONS INC',cik_str:123},1:{title:'UNRELATED INC',cik_str:456}},url);
 }});
 const result=await sources.run('sec',{company:'Example'});
 assert.equal(result.status,'no_match');assert.equal(result.candidates.length,0);
 assert.match(result.errors[0],/EXAMPLE COMMUNICATIONS INC/);
 assert.doesNotMatch(result.errors[0],/UNRELATED/);
});
