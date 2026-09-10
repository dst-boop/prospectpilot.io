import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function client(){
  const elements=new Map(),pending=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,open:false,
      classList:{toggle(){}},reset(){},showModal(){this.open=true;},
      addEventListener(event,handler){this[event+'Handler']=handler;},close(){this.open=false;this.closeHandler?.();}});
    return elements.get(id);
  };
  const context=vm.createContext({URL,URLSearchParams,console,setTimeout,clearTimeout,
    document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}},
    fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,respond:(data,status=200)=>resolve({status,ok:status===200,headers:{get:()=> 'application/json'},json:async()=>data})}))});
  vm.runInContext(readFileSync(new URL('../lab-client.js',import.meta.url),'utf8').replace(/init\(\);\s*$/,''),context);
  // Isolate dialog interactions from the independent dashboard refresh.
  vm.runInContext('refresh=async()=>{}',context);
  return {element,pending,run:code=>vm.runInContext(code,context)};
}
const lead=name=>({lead:{id:name,first_name:name,last_name:'Example',evidence:[]},quality:{gates:{},warnings:[],plans:[],identity_signature:name}});
const run=name=>({run:{status:name,created_at:'2026-09-10'},tasks:[],costs:[]});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('lead details ignore stale responses and cannot reopen after closing',async()=>{
  const c=client(),a=c.run("openLead('A')"),b=c.run("openLead('B')");
  c.pending[1].respond(lead('B'));await b;
  c.pending[0].respond(lead('A'));await a;
  assert.equal(c.element('personName').textContent,'B Example');
  const next=c.run("openLead('C')");c.element('detail').close();
  c.pending[2].respond(lead('C'));await next;
  assert.equal(c.element('detail').open,false);assert.equal(c.run('current'),null);
});

test('run details ignore both stale failures and results after close',async()=>{
  const c=client(),a=c.run("openRun('A')"),b=c.run("openRun('B')");
  c.pending[1].respond(run('completed'));await b;
  const shown=c.element('runDetails').innerHTML;
  c.pending[0].respond({detail:'old failure'},500);await a;
  assert.equal(c.element('runDetails').innerHTML,shown);
  const next=c.run("openRun('C')");c.element('runDialog').close();
  c.pending[2].respond(run('failed'));await next;
  assert.equal(c.element('runDetails').innerHTML,shown);
});

test('saving a review stays bound to the reviewed lead when another is opened',async()=>{
  const c=client(),a=c.run("openLead('A')");c.pending[0].respond(lead('A'));await a;
  const save=c.element('reviewForm').onsubmit({preventDefault(){}});
  assert.equal(c.pending[1].url,'/api/lab/leads/A/review');
  assert.equal(JSON.parse(c.pending[1].options.body).identity_signature,'A');
  c.element('detail').close();const b=c.run("openLead('B')");
  c.pending[2].respond(lead('B'));await b;
  c.pending[1].respond({ok:true});await save;
  assert.equal(c.pending.length,3);assert.equal(c.element('personName').textContent,'B Example');
  assert.equal(c.element('reviewError').textContent,'');
});

test('review refresh cannot replace a newer selection after the save succeeds',async()=>{
  const c=client(),a=c.run("openLead('A')");c.pending[0].respond(lead('A'));await a;
  const save=c.element('reviewForm').onsubmit({preventDefault(){}});
  c.pending[1].respond({ok:true});await settle();
  assert.equal(c.pending[2].url,'/api/lab/leads/A');
  c.element('detail').close();const b=c.run("openLead('B')");
  c.pending[3].respond(lead('B'));await b;c.pending[2].respond(lead('A'));await save;
  assert.equal(c.element('personName').textContent,'B Example');
  assert.equal(c.element('reviewError').textContent,'');
});
