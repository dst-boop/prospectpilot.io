import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../networking-client.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../networking.html',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const nodes=new Map(),fields=new Map(),calls=[],navigation=[],windowEvents=new Map();let focused=null,nextUUID=0;
 const element=(id='')=>({id,value:'',textContent:'',dataset:{},hidden:false,disabled:false,open:false,required:false,children:[],attributes:{},events:new Map(),
  addEventListener(name,fn){this.events.set(name,fn);},
  async fire(name,event={}){await this.events.get(name)?.({preventDefault(){},...event});},
  focus(){focused=this;},setAttribute(name,value){this.attributes[name]=value;},
  append(child){this.children.push(child);},replaceChildren(){this.children=[];}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);};
 for(const match of html.matchAll(/\bid="([^"]+)"/g))node(match[1]);
 for(const match of html.matchAll(/<(?:input|select|textarea)\s+name="([^"]+)"/g))fields.set(match[1],element(match[1]));
 const form=node('captureForm');form.elements={namedItem:name=>fields.get(name)};
 form.reportValidity=()=>true;
 form.reset=()=>{for(const field of fields.values())field.value='';fields.get('kind').value='in_person';fields.get('introduction_status').value='unknown';};
 form.reset();node('clearConfirmation').hidden=true;
 const response=data=>({ok:true,status:200,json:async()=>data});
 let send=async()=>response({capture:{id:'capture-1'},added:1});
 let history=async()=>response({captures:[],has_more:false});
 const context=vm.createContext({Date,console,crypto:{randomUUID:()=>`synthetic-key-${++nextUUID}`},
  document:{getElementById:node,createElement:()=>element()},
  location:{assign:url=>navigation.push(url)},window:{addEventListener:(name,fn)=>windowEvents.set(name,fn)},
  fetch:async(path,options)=>{calls.push({path,...options});return options.method==='POST'?send(path,options):history(path,options);}});
 vm.runInContext(source,context);
 return {node,fields,form,calls,navigation,response,focused:()=>focused,
  send:fn=>{send=fn;},history:fn=>{history=fn;},windowEvents,
  fill(){for(const [key,value] of Object.entries({first_name:'Jordan',last_name:'Example',company:'Fictional Company',context:'Synthetic conference'}))fields.get(key).value=value;return form.fire('input');},
  requestKey:()=>vm.runInContext('requestKey',context)};
}

test('clear uses a labeled inline confirmation, defaults to keep, and preserves details on cancel or Escape',async()=>{
 const f=fixture();await tick();await f.fill();const key=f.requestKey();
 assert.doesNotMatch(source,/\bconfirm\s*\(/);
 assert.match(html,/id="clearConfirmation"[^>]*role="group"[^>]*aria-labelledby="clearConfirmationTitle"[^>]*aria-describedby="clearConfirmationHint"[^>]*hidden/);
 assert.match(html,/id="clearCapture"[^>]*aria-expanded="false"[^>]*aria-controls="clearConfirmation"/);
 await f.node('clearCapture').fire('click');
 assert.equal(f.node('clearConfirmation').hidden,false);assert.equal(f.node('clearCapture').attributes['aria-expanded'],'true');
 assert.equal(f.focused(),f.node('keepCapture'));assert.equal(f.fields.get('first_name').value,'Jordan');
 await f.node('keepCapture').fire('click');
 assert.equal(f.node('clearConfirmation').hidden,true);assert.equal(f.focused(),f.node('clearCapture'));assert.equal(f.requestKey(),key);
 await f.node('clearCapture').fire('click');let prevented=false;
 await f.node('clearConfirmation').fire('keydown',{key:'Escape',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(f.node('clearConfirmation').hidden,true);assert.equal(f.fields.get('first_name').value,'Jordan');
 assert.equal(f.focused(),f.node('clearCapture'));assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});

test('confirmed clear resets all unsaved details without any write and repeated clicks are harmless',async()=>{
 const f=fixture();await tick();await f.fill();const key=f.requestKey();
 f.fields.get('kind').value='warm_introduction';f.fields.get('introduction_status').value='granted';await f.form.fire('change');
 f.fields.get('introduction_evidence').value='Synthetic private note';f.node('contactDetails').open=true;
 let prevented=false;f.windowEvents.get('beforeunload')({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 await f.node('clearCapture').fire('click');await f.node('confirmClearCapture').fire('click');
 assert.equal(f.fields.get('first_name').value,'');assert.equal(f.fields.get('introduction_evidence').value,'');
 assert.equal(f.fields.get('kind').value,'in_person');assert.equal(f.node('referralFields').hidden,true);
 assert.equal(f.node('clearConfirmation').hidden,true);assert.equal(f.node('contactDetails').open,false);
 assert.equal(f.focused(),f.fields.get('first_name'));assert.notEqual(f.requestKey(),key);
 assert.equal(f.node('captureResult').textContent,'Form cleared. Nothing was saved.');
 const clearedKey=f.requestKey();await f.node('confirmClearCapture').fire('click');assert.equal(f.requestKey(),clearedKey);
 prevented=false;f.windowEvents.get('beforeunload')({preventDefault(){prevented=true;}});assert.equal(prevented,false);
 assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
});

test('editing input or selection removes stale success and cancels an open clear confirmation',async()=>{
 const f=fixture();await tick();await f.fill();await f.form.fire('submit');
 assert.match(f.node('captureResult').textContent,/Connection and private context saved/);
 await f.fill();assert.equal(f.node('captureResult').textContent,'');
 await f.node('clearCapture').fire('click');await f.form.fire('input');assert.equal(f.node('clearConfirmation').hidden,true);
 f.node('captureResult').textContent='Old success';f.node('captureResult').dataset.error='true';
 f.fields.get('kind').value='referral';await f.form.fire('change');
 assert.equal(f.node('captureResult').textContent,'');assert.equal(f.node('captureResult').dataset.error,'false');
 assert.equal(f.node('referralFields').hidden,false);
});

test('pending saves reject repeated submit and clear, while failed retries retain their request key',async()=>{
 const f=fixture();await tick();await f.fill();const key=f.requestKey();let finish;
 f.send(()=>new Promise(resolve=>{finish=resolve;}));
 const saving=f.form.fire('submit');assert.equal(f.node('captureFields').disabled,true);
 await f.form.fire('submit');await f.node('clearCapture').fire('click');
 assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.node('clearConfirmation').hidden,true);
 assert.equal(f.fields.get('first_name').value,'Jordan');
 finish({ok:false,status:503,json:async()=>({detail:'Synthetic retryable failure'})});await saving;
 assert.equal(f.node('captureFields').disabled,false);assert.equal(f.requestKey(),key);assert.equal(f.fields.get('first_name').value,'Jordan');
 f.send(async()=>f.response({capture:{id:'capture-1'},replayed:true}));await f.form.fire('submit');
 const posted=f.calls.filter(call=>call.method==='POST').map(call=>JSON.parse(call.body));
 assert.equal(posted.length,2);assert.equal(posted[0].request_key,posted[1].request_key);
 assert.match(f.node('captureResult').textContent,/already saved/);assert.equal(f.fields.get('first_name').value,'');assert.notEqual(f.requestKey(),key);
});

test('restored-page history reload ignores stale responses and never treats private notes as markup',async()=>{
 const f=fixture();await tick();const pending=[];
 f.history(()=>new Promise(resolve=>pending.push(resolve)));
 const first=f.node('refreshCaptures').fire('click');f.windowEvents.get('pageshow')({persisted:true});
 assert.equal(pending.length,2);
 pending[1](f.response({captures:[{id:'latest',first_name:'Latest',last_name:'Person',company:'Fictional Company',created_at:'2026-09-01T12:00:00Z',payload:{kind:'manual',context:'<script>doNotRun()</script>',introduction:{status:'unknown'},note:'<img src=x onerror=doNotRun()>'}}]}));await tick();
 const cards=f.node('recentCaptures').children;assert.equal(cards.length,1);assert.equal(cards[0].children[0].textContent,'Latest Person');
 assert.ok(cards[0].children.some(child=>child.textContent==='<img src=x onerror=doNotRun()>'));
 pending[0](f.response({captures:[]}));await first;
 assert.equal(f.node('recentCaptures').children[0],cards[0]);assert.equal(f.node('refreshCaptures').disabled,false);
});
