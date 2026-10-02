import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabSources,proxyCandidates,newsRoleLinks} from '../lab-sources.mjs';
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
  const blocked=await createLabSources({get,fallbacks:false}).run('public_web',{company:'Example',website:'https://example.org/team'});assert.equal(pageRead,false);assert.equal(blocked.status,'partial');assert.equal(blocked.candidates.length,0);
  const missing=createLabSources({get});assert.equal(missing.quote('web_search'),null);
  const paid=createLabSources({searchKey:'fixture',searchCostMicros:5000,apiFetch:async()=>new Response('',{status:503})});await assert.rejects(paid.run('web_search',{company:'Example'}),/503/);
});
test('WARN results always remain employer-level context and never emit individual layoffs',async()=>{
  const sources=createLabSources({warn:{research:async()=>({status:'matched',records:[{scope:'company',excerpt:'Employer notice'}]})}});const r=await sources.run('warn',{company:'Example'});assert.deepEqual(r.candidates,[]);assert.equal(r.scope,'employer');
});

test('public pages use applicable robots groups and query restrictions',async()=>{
 let reads=0;const get=async url=>String(url).endsWith('/robots.txt')?response('User-agent: OtherBot\nDisallow: /\nUser-agent: *\nDisallow: /*?private=',url,'text/plain'):(reads++,response('<title>Example Company</title>',url,'text/html'));
 const sources=createLabSources({get,fallbacks:false});await sources.run('public_web',{company:'Example Company',website:'https://example.org/team'});assert.equal(reads,1);
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

test('biography redirects check destination rules before fetching the page and retain final provenance',async()=>{
 const seen=[];
 const get=async(url,options)=>{
  url=String(url);seen.push(url);
  if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
  assert.equal(options.followRedirects,false);
  if(url==='https://example.org/')return {url,redirect:'https://www.example.org/team'};
  return response('<title>Example Manufacturing</title><script type="application/ld+json">{"@type":"Person","name":"Jamie Rivera","jobTitle":"Director","worksFor":{"name":"Example Manufacturing"}}</script>',url,'text/html');
 };
 const result=await createLabSources({get}).run('public_web',{company:'Example Manufacturing',website:'https://example.org/'});
 assert.equal(result.candidates.length,1);
 assert.equal(result.documents[0].url,'https://www.example.org/team');
 assert.deepEqual(seen.slice(0,4),['https://example.org/robots.txt','https://example.org/','https://www.example.org/robots.txt','https://www.example.org/team']);
});

test('redirects cannot bypass same-origin robots paths or restricted destination hosts',async()=>{
 for(const target of ['https://example.org/private/team','https://www.linkedin.com/in/example','https://blocked.example.org/team']){
  const seen=[];const get=async(url)=>{
   url=String(url);seen.push(url);
   if(url.endsWith('/robots.txt'))return response(url.includes('blocked.')?'User-agent: *\nDisallow: /':'User-agent: *\nDisallow: /private/',url,'text/plain');
   if(url==='https://example.org/')return {url,redirect:target};
   throw Error('Forbidden destination must not be fetched');
  };
  const result=await createLabSources({get}).run('public_web',{company:'Example Manufacturing',website:'https://example.org/'});
  assert.equal(result.candidates.length,0);assert.equal(result.status,'partial');assert.ok(!seen.includes(target));
 }
});

test('redirect loops terminate with a visible source gap',async()=>{
 const get=async url=>String(url).endsWith('/robots.txt')?response('',url,'text/plain'):{url:String(url),redirect:String(url)};
 const result=await createLabSources({get}).run('public_web',{company:'Example Manufacturing',website:'https://example.org/'});
 assert.equal(result.candidates.length,0);assert.match(result.errors.join(' '),/redirect limit/);
});

test('leadership pages outrank earlier general navigation within the crawl budget',async()=>{
 const seen=[];const get=async(url)=>{
  url=String(url);if(url.endsWith('/robots.txt'))return response('',url,'text/plain');seen.push(url);
  if(url==='https://example.org/')return response('<title>Example Manufacturing</title>'+Array.from({length:12},(_,i)=>`<a href="/about/news-${i}">News</a>`).join('')+'<a href="/about/leadership#top">Leadership</a><a href="/about/leadership#people">Leadership again</a>',url,'text/html');
  if(url==='https://example.org/about/leadership')return response('<title>Example Manufacturing</title><script type="application/ld+json">{"@type":"Person","name":"Jamie Rivera","jobTitle":"Director","worksFor":{"name":"Example Manufacturing"}}</script>',url,'text/html');
  return response('<title>Example Manufacturing</title>',url,'text/html');
 };
 const result=await createLabSources({get}).run('public_web',{company:'Example Manufacturing',website:'https://example.org/'});
 assert.equal(seen[1],'https://example.org/about/leadership');assert.equal(seen.filter(u=>u.includes('/leadership')).length,1);
 assert.equal(result.candidates.length,1);assert.equal(seen.length,5);
});

// When a company's own links lead to nobody, the usual addresses and then the
// free news index are tried, each under the same robots rules.
const person=(name,title,company)=>`<title>${company}</title><script type="application/ld+json">{"@type":"Person","name":"${name}","jobTitle":"${title}","worksFor":{"name":"${company}"}}</script>`;
test('the usual team addresses are tried only when the site\'s own links found nobody, and a missing one is not a failure',async()=>{
 const seen=[];const get=async url=>{url=String(url);if(url.endsWith('/robots.txt'))return response('User-agent: *\nDisallow: /staff',url,'text/plain');seen.push(url);
  if(url==='https://smallco.example/')return response('<title>Small Co Electric</title><div id="menu"></div>',url,'text/html');
  if(url==='https://smallco.example/our-team')return response(person('Pat Owens','Owner','Small Co Electric'),url,'text/html');
  throw Error('HTTP 404');};
 const result=await createLabSources({get}).run('public_web',{company:'Small Co Electric',website:'https://smallco.example/'});
 assert.deepEqual(result.candidates.map(c=>c.name),['Pat Owens']);
 assert.equal(result.candidates[0].company_website,'https://smallco.example');
 assert.ok(!seen.includes('https://smallco.example/staff'),'robots still decides');
 assert.deepEqual(result.fallbacks,['common_paths']);
 assert.ok(!result.errors.some(e=>/unavailable/.test(e)),'a guessed address that 404s is not reported');
 assert.ok(!seen.some(u=>u.includes('gdelt')),'people were found, so no news lookup');
 // A site whose own pages list people is not probed at all.
 const direct=[];await createLabSources({get:async url=>{url=String(url);if(url.endsWith('/robots.txt'))return response('',url,'text/plain');direct.push(url);return response(person('Sam Lee','President','Direct Co'),url,'text/html');}}).run('public_web',{company:'Direct Co',website:'https://direct.example/'});
 assert.deepEqual(direct,['https://direct.example/']);
});
test('a blocked site falls back to news articles that name the company, and the article site is never the company website',async()=>{
 const seen=[];const get=async url=>{url=String(url);
  if(url==='https://blocked.example/robots.txt')return response('User-agent: *\nDisallow: /',url,'text/plain');
  if(url.endsWith('/robots.txt'))return response(url.includes('refuses')?'User-agent: *\nDisallow: /':'',url,'text/plain');
  seen.push(url);
  if(url.startsWith('https://api.gdeltproject.org/')){const q=new URL(url).searchParams.get('query');assert.match(q,/^"Harbor Electrical" \(owner OR president/);
   return response({articles:[{url:'https://news.example/a'},{url:'https://refuses.example/b'},{url:'https://news.example/c'}]},url);}
  if(url==='https://news.example/a')return response('<p>Harbor Electrical acquired Other Firm. Kim Doe is the owner of Other Firm.</p><p>Robin Hale is the president of Harbor Electrical.</p><p>Lee Park is the owner of a bakery across town.</p>',url,'text/html');
  if(url==='https://news.example/c')return response('<p>Unrelated story about Kim Doe, owner of Other Firm.</p>',url,'text/html');
  throw Error('unexpected '+url);};
 const result=await createLabSources({get}).run('public_web',{company:'Harbor Electrical',website:'https://blocked.example/'});
 assert.ok(!seen.some(u=>u.startsWith('https://blocked.example/')),'the blocked site is never read');
 assert.ok(!seen.includes('https://refuses.example/b'),'a news site that refuses is not read');
 assert.deepEqual(result.candidates.map(c=>[c.name,c.current_title]),[['Robin Hale','President']],'someone whose role sentence names another company is not credited to this one');
 assert.equal(result.candidates[0].company_website,'https://blocked.example','the company site, not the news site');
 assert.deepEqual(result.candidates[0].source_names,['News article']);assert.equal(result.candidates[0].evidence[0].source,'News article');
 assert.ok(result.errors.includes('A news site blocks automated reading.'));
 assert.deepEqual(result.fallbacks,['common_paths','news']);
 assert.equal(result.pages_checked,2,'two articles read');
 const off=await createLabSources({get,fallbacks:false}).run('public_web',{company:'Harbor Electrical',website:'https://blocked.example/'});
 assert.equal(off.candidates.length,0);assert.deepEqual(off.fallbacks,[]);
});
test('no website and no news is reported plainly',async()=>{
 const get=async url=>{url=String(url);if(url.includes('wikidata'))return response({search:[]},url);if(url.includes('gdelt'))return response({articles:[]},url);throw Error('unexpected '+url);};
 const result=await createLabSources({get}).run('public_web',{company:'Quiet Firm'});
 assert.equal(result.status,'partial');assert.equal(result.candidates.length,0);
 assert.ok(result.errors.some(e=>/No official website/.test(e)));assert.ok(result.errors.includes('No recent news articles named this company.'));
});

test('a news sentence credits a person only when it ties their role to this company',()=>{
 const yes=[['Robin Hale is the president of Harbor Electrical.','President'],["Harbor Electrical's CEO Robin Hale said the firm will grow.",'CEO'],
  ['Harbor Electrical president Robin Hale said.','President'],['Robin Hale, vice president of operations at Harbor Electrical, said.','Vice President of Operations']];
 for(const [text,title] of yes)assert.equal(newsRoleLinks(text,'Robin Hale',title,'Harbor Electrical'),true,text);
 const no=['Harbor Electrical acquired Other Firm. Kim Doe is the owner of Other Firm.','Kim Doe, owner of Other Firm, which Harbor Electrical acquired, spoke.',
  'Kim Doe, owner of Other Firm at Harbor Electrical plaza, said.','Other Firm owner Kim Doe met Harbor Electrical staff.','Kim Doe spoke. Harbor Electrical owner search continues.'];
 for(const text of no)assert.equal(newsRoleLinks(text,'Kim Doe','Owner','Harbor Electrical'),false,text);
});


test('broad search does not turn an article into an employer website or borrow unrelated people',async()=>{
  for(const website of ['', 'https://harbor.example']) {
    const sources=createLabSources({searchKey:'synthetic',searchCostMicros:0,fallbacks:false,
      apiFetch:async()=>new Response(JSON.stringify({web:{results:[{url:'https://news.example/story'}]}})),
      get:async url=>String(url).endsWith('/robots.txt')?response('',url,'text/plain'):response('<p>Harbor Electrical acquired Other Firm. Kim Doe is the owner of Other Firm.</p><p>Robin Hale is the president of Harbor Electrical.</p>',url,'text/html')});
    const result=await sources.run('web_search',{company:'Harbor Electrical',website});
    assert.deepEqual(result.candidates.map(c=>c.name),['Robin Hale']);
    assert.equal(result.candidates[0].company_website,website);
    assert.deepEqual(result.candidates[0].source_names,['Web search page']);
    assert.equal(result.candidates[0].evidence[0].source_url,'https://news.example/story');
    assert.equal(result.documents[0].scope,'external');
  }
});

test('broad search keeps supplied official-site biographies but checks redirected destinations',async()=>{
  for(const redirected of [false,true]) {
    const sources=createLabSources({searchKey:'synthetic',searchCostMicros:0,fallbacks:false,
      apiFetch:async()=>new Response(JSON.stringify({web:{results:[{url:'https://www.harbor.example/team'}]}})),
      get:async url=>{
        url=String(url);
        if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
        if(redirected&&url==='https://www.harbor.example/team')return {url,redirect:'https://news.example/story'};
        return response(person('Robin Hale','President','Harbor Electrical'),url,'text/html');
      }});
    const result=await sources.run('web_search',{company:'Harbor Electrical',website:'https://harbor.example'});
    assert.equal(result.candidates.length,redirected?0:1,'third-party structured page alone does not establish employment');
    if(!redirected)assert.equal(result.candidates[0].company_website,'https://www.harbor.example');
  }
});
