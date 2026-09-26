import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function client(){
  const elements=new Map(),pending=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,open:false,
      setAttribute(name,value){this[name]=value;},classList:{toggle(){}},reset(){},replaceChildren(){},showModal(){this.open=true;},
      addEventListener(event,handler){this[event+'Handler']=handler;},close(){this.open=false;this.closeHandler?.();}});
    return elements.get(id);
  };
  const context=vm.createContext({URL,URLSearchParams,console,setTimeout,clearTimeout,
    document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}},
    fetch:(url,options)=>new Promise(resolve=>pending.push({url,options,respond:(data,status=200)=>resolve({status,ok:status===200,headers:{get:()=> 'application/json'},json:async()=>data})}))});
  vm.runInContext(readFileSync(new URL('../lab-client.js',import.meta.url),'utf8').replace(/init\(\);\s*$/,''),context);
  // Isolate dialog interactions from the independent dashboard refresh.
  vm.runInContext('refresh=async()=>{};loadActivity=async()=>{}',context);
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

test('saving an outcome cannot close a different prospect opened while the save is pending',async()=>{
 const c=client();c.run("current={lead:{id:'A'}};currentWorkflow={action:{signature:'A'}};activityKey='one-save';leadDetailVersion=1");
 c.element('activityOutcome').value='connected';c.element('activityNext').value='';c.element('detail').open=true;
 const save=c.element('activityForm').onsubmit({preventDefault(){}});
 assert.equal(c.pending[0].url,'/api/lab/leads/A/activity');
 await c.element('activityForm').onsubmit({preventDefault(){}});assert.equal(c.pending.length,1);
 c.run("leadDetailVersion=2;current={lead:{id:'B'}}");
 c.pending[0].respond({saved:true});await save;
 assert.equal(c.element('detail').open,true);assert.equal(c.run('current.lead.id'),'B');
});

// A figure with no defensible target still has to render. The scoreboard used
// to print "target " and whatever sat in the field, and to mark anything it
// could not compare as met, so a count arriving without a benchmark would have
// claimed one.
test('the scoreboard omits a target it does not have rather than inventing one',async()=>{
  const c=client(),loaded=c.run('loadScoreboard()');
  c.pending[0].respond({window_days:30,since:'2026-08-13T00:00:00Z',added:4,worked:2,untouched:0,
    scopes:{cohort:'Prospects added in this window',conversions:'Clients recorded in this window, whenever they were first met'},
    measured:[
      {id:'reply_rate',scope:'cohort',label:'Prospects who responded',value:50,unit:'%',basis:'1 of 2 prospects touched',target:12},
      {id:'below_target',scope:'cohort',label:'First touch within one business day',value:80,unit:'%',basis:'4 of 5',target:95},
      {id:'clients_recorded',scope:'conversions',label:'Clients recorded',value:0,unit:'count',basis:'0 prospects recorded as a client, counted once each',target:null},
    ],
    meetings:{held:0,no_shows:0,awaiting_outcome:0,note:''},
    basis:'Counted from manually logged outcomes.'});
  await loaded;
  const html=c.element('scoreboard').innerHTML;
  assert.doesNotMatch(html,/target null|target undefined|target <|target \b(?!\d)/);
  // The count renders as a plain number, with its scope, and without a target.
  assert.match(html,/Clients recorded<\/span><strong>0<\/strong>/);
  assert.match(html,/whenever they were first met/);
  // A metric that met its target keeps the highlight; one that missed does not;
  // one with no target is neither.
  const tiles=html.split('<article');
  assert.match(tiles[1],/^ class="highlight"/,'50% against a target of 12 is met');
  assert.doesNotMatch(tiles[2],/^ class="highlight"/,'80% against a target of 95 is not met');
  assert.doesNotMatch(tiles[3],/^ class="highlight"/,'a count with no target claims nothing');
  // Percentages keep their sign; a count does not acquire one.
  assert.match(tiles[1],/<strong>50%<\/strong>/);
  assert.doesNotMatch(tiles[3],/0%/);
});

test('an inbound row is labelled by the channel it arrived on',()=>{
  // The record stores the channel, so the history must not say they called when
  // they sent an email.
  const c=client();
  assert.equal(c.run("inboundLabel('phone')"),'they called');
  assert.equal(c.run("inboundLabel('email')"),'they emailed');
  assert.equal(c.run("inboundLabel('linkedin')"),'they replied on LinkedIn');
  // A row written before the channel was recorded claims nothing about how.
  assert.equal(c.run("inboundLabel(null)"),'they contacted me');
  assert.equal(c.run("inboundLabel('carrier pigeon')"),'they contacted me');
});

const emptyQueue={total:0,items:[],counts:{all:0,due:0,ready:0},activity:{conversations:0,meetings:0}};
test('queue loading clears old cards and failure provides a working retry',async()=>{
  const c=client();c.element('workView').value='today';
  c.element('workList').innerHTML='Old prospect';c.run("workSelected.add('old');loadScoreboard=async()=>{}");
  const loading=c.run('loadWorklist()');
  assert.match(c.element('workList').innerHTML,/Loading prospects/);
  assert.equal(c.element('startNext').disabled,true);
  assert.equal(c.element('enrichExport').disabled,true);
  assert.equal(c.element('workNext').disabled,true);
  c.pending[0].respond({detail:'Queue temporarily unavailable'},503);
  await assert.rejects(loading,/Queue temporarily unavailable/);
  assert.match(c.element('workList').innerHTML,/Retry/);
  assert.equal(c.run('workSelected.size'),0);
  assert.equal(c.element('workList')['aria-busy'],'false');
  const retry=c.element('retryWorklist').onclick();c.pending[1].respond(emptyQueue);await retry;
  assert.match(c.element('workList').innerHTML,/Your next actions/);
  assert.equal(c.element('startNext').disabled,false);
  assert.equal(c.element('notice').textContent,'Worklist updated.');
});
test('stale queue failure cannot replace a newer successful search',async()=>{
  const c=client();c.element('workView').value='today';c.run('loadScoreboard=async()=>{}');
  const old=c.run('loadWorklist()'),fresh=c.run('loadWorklist()');
  c.pending[1].respond(emptyQueue);await fresh;
  const shown=c.element('workList').innerHTML;
  c.pending[0].respond({detail:'Old failure'},503);await old;
  assert.equal(c.element('workList').innerHTML,shown);
  assert.equal(c.element('startNext').disabled,false);
});
test('typing disables the old next prospect during search debounce',()=>{
  const c=client();c.element('startNext').onclick=()=>{};
  c.element('workSearch').oninput();
  assert.equal(c.element('startNext').disabled,true);
  assert.equal(c.element('startNext').onclick,null);
  assert.match(c.element('workList').innerHTML,/Loading prospects/);
  c.run('clearTimeout(workSearchTimer)');
});

test('an empty search does not imply the workspace has no imported contacts',async()=>{
  const c=client();c.element('workView').value='today';c.element('workSearch').value='no-match';c.run('loadScoreboard=async()=>{}');
  const loading=c.run('loadWorklist()');c.pending[0].respond(emptyQueue);await loading;
  assert.equal(c.element('dailyTitle').textContent,'You’re caught up in this view.');
  assert.match(c.element('workList').innerHTML,/No matching prospects/);
});
