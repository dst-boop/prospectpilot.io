import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabSources} from '../lab-sources.mjs';

const response=(text,url,type='application/json')=>({text:typeof text==='string'?text:JSON.stringify(text),url:String(url),type});
const company='Harbor Electrical';
const biography='<title>Harbor Electrical</title><script type="application/ld+json">{"@type":"Person","name":"Robin Hale","jobTitle":"President","worksFor":{"name":"Harbor Electrical"}}</script>';
const article='<p>Robin Hale is the president of Harbor Electrical.</p>';
// Keep the event loop alive until the actual cancellation arrives. The guard
// fails quickly if the adapter forgets to pass or combine its request signal.
const stalled=signal=>new Promise((resolve,reject)=>{
  const guard=setTimeout(()=>{signal.removeEventListener('abort',abort);reject(Error('Request was not cancelled'));},2000);
  function abort(){clearTimeout(guard);reject(signal.reason);}
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
});
const noPaidCalls=async()=>{assert.fail('No paid provider should be called');};

test('a stalled linked biography times out without discarding later company pages',async()=>{
  const seen=[];let cancelled=false;
  const sources=createLabSources({requestTimeoutMs:20,websiteTimeoutMs:60000,apiFetch:noPaidCalls,get:async(url,{signal})=>{
    url=String(url);seen.push(url);
    if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
    if(url==='https://harbor.example/')return response('<title>Harbor Electrical</title><a href="/leadership">Leaders</a><a href="/team">Team</a>',url,'text/html');
    if(url==='https://harbor.example/leadership'){try{return await stalled(signal);}finally{cancelled=signal.aborted;}}
    assert.equal(url,'https://harbor.example/team');
    assert.equal(signal.aborted,false);
    return response(biography,url,'text/html');
  }});
  const result=await sources.run('public_web',{company,website:'https://harbor.example/'});
  assert.equal(cancelled,true);
  assert.deepEqual(result.candidates.map(c=>c.name),['Robin Hale']);
  assert.equal(result.candidates[0].evidence[0].source_url,'https://harbor.example/team');
  assert.equal(result.status,'partial','the unavailable page remains a visible gap');
  assert.ok(!seen.some(url=>url.includes('gdelt')),'news is unnecessary once people were found');
});

test('a stalled official-site index leaves time for the independent free news source',async()=>{
  let cancelled=false;
  const sources=createLabSources({requestTimeoutMs:20,websiteTimeoutMs:60000,apiFetch:noPaidCalls,get:async(url,{signal})=>{
    url=String(url);
    if(url.includes('wikidata.org')){try{return await stalled(signal);}finally{cancelled=signal.aborted;}}
    assert.equal(signal.aborted,false,'the request cancellation must not cancel the entire source');
    if(url.includes('gdeltproject.org'))return response({articles:[{url:'https://news.example/story'}]},url);
    if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
    assert.equal(url,'https://news.example/story');return response(article,url,'text/html');
  }});
  const result=await sources.run('public_web',{company});
  assert.equal(cancelled,true);
  assert.deepEqual(result.fallbacks,['news']);
  assert.deepEqual(result.candidates.map(c=>c.name),['Robin Hale']);
  assert.equal(result.candidates[0].company_website,'');
  assert.deepEqual(result.candidates[0].source_names,['News article']);
  assert.equal(result.status,'partial');
});

test('the company-page stage cannot consume the time reserved for news fallback',async()=>{
  const seen=[];
  const sources=createLabSources({requestTimeoutMs:60000,websiteTimeoutMs:20,apiFetch:noPaidCalls,get:async(url,{signal})=>{
    url=String(url);seen.push(url);
    if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
    if(url==='https://harbor.example/')return response('<title>Harbor Electrical</title><a href="/leadership">Leaders</a><a href="/team">Team</a>',url,'text/html');
    if(url==='https://harbor.example/leadership')return stalled(signal);
    assert.equal(signal.aborted,false,'news receives the live total deadline, not the exhausted website deadline');
    if(url.includes('gdeltproject.org'))return response({articles:[{url:'https://news.example/story'}]},url);
    assert.equal(url,'https://news.example/story');return response(article,url,'text/html');
  }});
  const result=await sources.run('public_web',{company,website:'https://harbor.example/'});
  assert.ok(!seen.includes('https://harbor.example/team'),'do not continue an exhausted company-page stage');
  assert.deepEqual(result.fallbacks,['news']);
  assert.deepEqual(result.candidates.map(c=>c.name),['Robin Hale']);
  assert.match(result.errors.join(' '),/website research timed out/);
  assert.equal(result.status,'partial');
});

test('a temporary HTML response from a JSON index is not cached for the next run',async()=>{
  let searches=0;
  const sources=createLabSources({apiFetch:noPaidCalls,get:async url=>{
    url=String(url);
    if(url.includes('wikidata.org')){
      if(new URL(url).searchParams.get('action')==='wbsearchentities')return response(++searches===1?'<html>Temporary outage</html>':{search:[{id:'Q1',label:company}]},url);
      return response({entities:{Q1:{claims:{P856:[{mainsnak:{datavalue:{value:'https://harbor.example/'}}}]}}}},url);
    }
    if(url.includes('gdeltproject.org'))return response({articles:[]},url);
    if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
    assert.equal(url,'https://harbor.example/');return response(biography,url,'text/html');
  }});
  const first=await sources.run('public_web',{company});
  assert.equal(first.candidates.length,0);assert.equal(first.status,'partial');
  const recovered=await sources.run('public_web',{company});
  assert.equal(searches,2);
  assert.equal(recovered.status,'completed');
  assert.deepEqual(recovered.candidates.map(c=>c.name),['Robin Hale']);
});

test('source deadlines reject invalid values rather than silently disabling cancellation',()=>{
  for(const value of [0,-1,NaN,Infinity,1.5,70001])assert.throws(()=>createLabSources({requestTimeoutMs:value}),/deadlines/);
  for(const value of [0,-1,NaN,Infinity,1.5,70000])assert.throws(()=>createLabSources({websiteTimeoutMs:value}),/deadlines/);
});

test('a guessed path timeout remains a gap when the next guessed path finds a person',async()=>{
  let cancelled=false;
  const sources=createLabSources({requestTimeoutMs:20,websiteTimeoutMs:60000,apiFetch:noPaidCalls,get:async(url,{signal})=>{
    url=String(url);
    if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
    if(url==='https://harbor.example/')return response('<title>Harbor Electrical</title>',url,'text/html');
    if(url==='https://harbor.example/leadership'){try{return await stalled(signal);}finally{cancelled=signal.aborted;}}
    if(url==='https://harbor.example/our-team')return response(biography,url,'text/html');
    throw Error(url.endsWith('/staff')?'Source HTTP 410':'Source HTTP 404');
  }});
  const result=await sources.run('public_web',{company,website:'https://harbor.example/'});
  assert.equal(cancelled,true);
  assert.deepEqual(result.candidates.map(c=>c.name),['Robin Hale']);
  assert.equal(result.status,'partial');
  assert.deepEqual(result.errors,['Public page unavailable.'],'only the timeout, not missing guessed paths, is a coverage gap');
});

test('a news timeout remains a gap even when another article finds a person',async()=>{
  let cancelled=false;
  const sources=createLabSources({requestTimeoutMs:20,websiteTimeoutMs:60000,apiFetch:noPaidCalls,get:async(url,{signal})=>{
    url=String(url);
    if(url.endsWith('/robots.txt'))return response('',url,'text/plain');
    if(url==='https://harbor.example/')return response('<title>Harbor Electrical</title>',url,'text/html');
    if(url.startsWith('https://harbor.example/'))throw Error('Source HTTP 404');
    if(url.includes('gdeltproject.org'))return response({articles:[{url:'https://news.example/story'},{url:'https://news.example/slow'}]},url);
    if(url==='https://news.example/story')return response(article,url,'text/html');
    assert.equal(url,'https://news.example/slow');
    try{return await stalled(signal);}finally{cancelled=signal.aborted;}
  }});
  const result=await sources.run('public_web',{company,website:'https://harbor.example/'});
  assert.equal(cancelled,true);
  assert.deepEqual(result.candidates.map(c=>c.name),['Robin Hale']);
  assert.equal(result.status,'partial');
  assert.deepEqual(result.errors,['A news page was unavailable or timed out.']);
});
