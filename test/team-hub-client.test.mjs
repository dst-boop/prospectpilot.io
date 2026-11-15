import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {previewAdvisorReassignment} from '../advisor-reassignment-preview.mjs';
import {createSyntheticTeamHubAdapters} from '../scripts/team-hub-demo.mjs';
const options=createSyntheticTeamHubAdapters(), actor={uid:'synthetic-demo'};
const result=await previewAdvisorReassignment({actor,sourceUid:'demo-departing',targetUid:'demo-receiver'},options.plannerAdapters);
const contextData={mode:'preview_only',can_execute:false,synthetic:true,team:'synthetic-firm',advisors:(await options.listAdvisors()).map(row=>({...row,email_verified:row.emailVerified}))};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness() {
  const elements=new Map(), events={}, requests=[], replies=[contextData]; let focused;
  class Element {
    constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.value='';this.disabled=false;this.hidden=false;this.textContent='';this.open=false;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;this.textContent='';}
    get firstChild(){return this.children[0];}
    setAttribute(key,value){this[key]=value;}
    addEventListener(key,fn){this.listeners[key]=fn;}
    querySelectorAll(){return [];}
    focus(){focused=this;}
  }
  const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const sandbox={AbortController, document:{getElementById:element,createElement:tag=>new Element(tag)},window:{addEventListener:(key,fn)=>{events[key]=fn;}},
    fetch:async(path,init)=>{requests.push({path,init});const reply=await replies.shift();if(reply instanceof Error)throw reply;if(reply?.status)return {ok:false,status:reply.status,json:async()=>reply};return {ok:true,json:async()=>reply};}};
  vm.runInContext(readFileSync(new URL('../team-hub-client.js',import.meta.url),'utf8'),vm.createContext(sandbox));
  const change=(id,value)=>{element(id).value=value;return element(id).listeners.change();};
  const select=()=>{change('sourceAdvisor','demo-departing');change('targetAdvisor','demo-receiver');};
  const submit=()=>element('previewForm').listeners.submit({preventDefault(){}});
  return {element,events,requests,replies,select,change,submit,focused:()=>focused};
}
const text=element=>element.textContent+element.children.map(text).join('');
test('only a valid different active recipient enables preview; render includes all review gates',async()=>{
  const c=harness();await settle();assert.equal(c.element('previewButton').disabled,true);c.select();assert.equal(c.element('previewButton').disabled,false);
  c.change('targetAdvisor','demo-unverified');assert.equal(c.element('previewButton').disabled,true);
  c.change('targetAdvisor','demo-departing');assert.equal(c.element('previewButton').disabled,true);c.select();c.replies.push(result);await c.submit();
  assert.equal(c.element('results').hidden,false);assert.equal(c.focused(),c.element('resultTitle'));assert.match(text(c.element('blockers')),/Transfer is not available|Unfinished work/);
  const post=c.requests[1];assert.equal(post.path,'/api/team-hub/preview');assert.deepEqual(JSON.parse(post.init.body),{source_uid:'demo-departing',target_uid:'demo-receiver'});
});
test('repeated clicks make one request and close removes all old record IDs',async()=>{
  const c=harness();await settle();c.select();let resolve;c.replies.push(new Promise(r=>resolve=r));const pending=c.submit();await c.submit();assert.equal(c.requests.length,2);
  resolve(result);await pending;c.element('closePreview').listeners.click();assert.equal(c.element('results').hidden,true);assert.equal(text(c.element('recordIds')),'');assert.equal(c.focused(),c.element('previewButton'));
  c.replies.push(result);await c.submit();assert.equal(c.element('results').hidden,false);
});
for(const action of ['cancel','selection','history','pagehide'])test('late preview cannot repopulate after '+action,async()=>{
  const c=harness();await settle();c.select();let resolve;c.replies.push(new Promise(r=>resolve=r));const pending=c.submit();
  if(action==='cancel')c.element('cancelPreview').listeners.click();
  if(action==='selection')c.change('targetAdvisor','demo-unverified');
  if(action==='history')c.events.popstate();
  if(action==='pagehide')c.events.pagehide();
  resolve(result);await pending;assert.equal(c.element('results').hidden,true);assert.equal(text(c.element('recordIds')),'');assert.equal(c.requests[1].init.signal.aborted,true);
});
test('older response cannot replace a newer preview',async()=>{
  const c=harness();await settle();c.select();let resolve;c.replies.push(new Promise(r=>resolve=r));const old=c.submit();c.element('cancelPreview').listeners.click();
  c.replies.push({...result,fingerprint:'new-fingerprint'});await c.submit();resolve(result);await old;assert.equal(c.element('fingerprint').textContent,'new-fingerprint');
});
test('access loss removes roster and preview and offers sign-in only for 401',async()=>{
  for(const status of [401,403]){const c=harness();await settle();c.select();c.replies.push(result);await c.submit();c.replies.push({status,detail:'Access expired'});await c.submit();assert.equal(c.element('results').hidden,true);assert.equal(c.element('sourceAdvisor').disabled,true);assert.equal(c.element('sourceAdvisor').value,'');assert.equal(c.element('signIn').hidden,status!==401);}
});
test('network failure can retry without stale records',async()=>{
  const c=harness();await settle();c.select();c.replies.push(Error('Network interrupted'));await c.submit();assert.equal(c.element('results').hidden,true);assert.equal(c.element('previewButton').disabled,false);
  c.replies.push(result);await c.submit();assert.equal(c.element('results').hidden,false);
});
test('unsafe or wrong-pair response is never displayed',async()=>{
  for(const data of [{...result,can_execute:true},{...result,target_uid:'another'}]){const c=harness();await settle();c.select();c.replies.push(data);await c.submit();assert.equal(c.element('results').hidden,true);assert.equal(text(c.element('recordIds')),'');}
});
test('bfcache restore clears and reauthorizes the directory without automatic preview',async()=>{
  const c=harness();await settle();c.select();c.replies.push(result);await c.submit();c.events.pagehide();c.replies.push(contextData);c.events.pageshow({persisted:true});await settle();assert.equal(c.element('results').hidden,true);assert.equal(c.requests.at(-1).path,'/api/team-hub/context');assert.equal(c.element('previewButton').disabled,true);
});
test('server strings are rendered as text, not HTML',async()=>{
  const c=harness();await settle();c.select();c.replies.push({...result,blockers:[{code:'unknown',count:1,message:'<img src=x onerror=alert(1)>'}]});await c.submit();assert.match(text(c.element('blockers')),/<img/);assert.equal(c.element('blockers').children[0].children[1].tag,'p');
});
test('Back during a directory refresh leaves a usable recovery control',async()=>{
  const c=harness();await settle();let resolve;c.replies.push(new Promise(r=>resolve=r));const loading=c.element('refreshAdvisors').listeners.click();
  assert.equal(c.element('refreshAdvisors').disabled,true);c.events.popstate();resolve(contextData);await loading;
  assert.equal(c.element('refreshAdvisors').disabled,false);assert.equal(c.element('sourceAdvisor').disabled,true);
  c.replies.push(contextData);await c.element('refreshAdvisors').listeners.click();assert.equal(c.element('sourceAdvisor').disabled,false);
});
