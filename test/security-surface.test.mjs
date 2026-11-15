import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createPublicGet} from '../native-research.mjs';
import worker,{fetchPublicPage,legacySourceHeaders,salesforceCSV,zoomInfoCandidateCSV} from '../generated/worker.mjs';

function transport(pages=[]){
 const calls=[];
 const client={get(url,options,callback){
  calls.push({url:new URL(url),options});
  const request=new EventEmitter(),page=pages.shift()||{};
  queueMicrotask(()=>{const response=Readable.from([Buffer.from(page.text||'page')]);Object.assign(response,{statusCode:page.status||200,headers:{'content-type':'text/html',...page.headers}});callback(response);});
  return request;
 }};
 return {calls,client};
}

test('legacy crawler rejects private and mixed DNS answers before any HTTP request',async()=>{
 for(const addresses of [['127.0.0.1'],['10.0.0.2'],['169.254.169.254'],['100.64.0.1'],['::1'],['8.8.8.8','192.168.0.1']]){
  const {client,calls}=transport();
  const get=createPublicGet({resolveAddresses:async()=>addresses,httpClient:client,httpsClient:client});
  await assert.rejects(fetchPublicPage('https://apparently-public.example/',10000,get),/Non-public address/);
  assert.equal(calls.length,0);
 }
});

test('public requests pin validated DNS addresses and recheck every redirect destination',async()=>{
 const {client,calls}=transport([{status:302,headers:{location:'https://redirect.example/secret'}}]);
 const names=[];
 const get=createPublicGet({resolveAddresses:async name=>{names.push(name);return names.length===1?['8.8.8.8']:['169.254.169.254'];},httpClient:client,httpsClient:client});
 await assert.rejects(fetchPublicPage('https://public.example/',10000,get),/Non-public address/);
 assert.deepEqual(names,['public.example','redirect.example']);assert.equal(calls.length,1);
 const lookup=calls[0].options.lookup;
 lookup('public.example',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
 lookup('public.example',{all:true},(error,addresses)=>{assert.equal(error,null);assert.deepEqual(addresses,[{address:'8.8.8.8',family:4}]);});
 assert.equal(names.length,2,'lookup must not perform another unvalidated resolution');
});

test('public transport refuses alternate ports/credentials and enforces streamed byte bounds',async()=>{
 const {client,calls}=transport([{text:'too large'}]);
 const get=createPublicGet({resolveAddresses:async()=>['8.8.8.8'],httpClient:client,httpsClient:client});
 for(const url of ['http://public.example:8080/','https://user:password@public.example/','file:///etc/passwd'])await assert.rejects(get(url),/Unsupported address/);
 assert.equal(calls.length,0);
 await assert.rejects(get('https://public.example/',{maxBytes:4}),/Source too large/);
});

test('legacy CSV exports neutralize formula prefixes after whitespace',()=>{
 for(const format of [salesforceCSV,zoomInfoCandidateCSV])for(const value of ['=1+1','\t=1+1','\r=1+1',' =1+1','\n+SUM(1,1)','\t@SUM(1,1)']){
  const csv=format([{first_name:value}]),data=csv.slice(csv.indexOf('\r\n')+2);
  assert.ok(data.startsWith("'"+value)||data.startsWith('"\''+value),JSON.stringify({value,data}));
 }
});

test('legacy server errors do not log database payloads, messages, stacks or credentials',async()=>{
 const captured=[],before=console.error;
 const error=Object.assign(Error('synthetic-private-person synthetic-secret'),{code:'23514',detail:'payload: synthetic-private-person'});
 console.error=(...args)=>captured.push(args);
 try{
  const response=await worker.fetch(new Request('https://prospectpilot.io/api/me',{headers:{'oai-authenticated-user-id':'synthetic','oai-authenticated-user-email':'synthetic@example.test'}}),{DB:{prepare(){throw error;}}});
  assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/synthetic-private|synthetic-secret/);
  assert.equal(captured.length,1);assert.deepEqual(JSON.parse(captured[0][0]),{event:'legacy_request_failed',code:'23514'});
  assert.doesNotMatch(JSON.stringify(captured),/synthetic-private|synthetic-secret|payload|stack/);
 }finally{console.error=before;}
});


test('legacy crawler keeps its robots User-Agent, Accept header and missing-robots error contract',async()=>{
 const {client,calls}=transport([{status:404},{text:'<urlset/>'}]);
 const get=createPublicGet({...legacySourceHeaders,resolveAddresses:async()=>['8.8.8.8'],httpClient:client,httpsClient:client});
 await assert.rejects(fetchPublicPage('https://public.example/robots.txt',10000,get),/^Error: HTTP 404$/);
 assert.equal(calls[0].options.headers['user-agent'],'WealthLeadDiscoveryBot/1.0');
 assert.equal(calls[0].options.headers.accept,'text/html,application/xhtml+xml,text/plain;q=0.8');
 assert.equal(calls[0].options.headers['accept-encoding'],'identity');
 assert.equal((await fetchPublicPage('https://public.example/team',10000,get)).html,'<urlset/>');
});
