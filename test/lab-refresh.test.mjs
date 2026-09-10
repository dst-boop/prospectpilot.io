import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Exercise the shipped refresh coordinator with independently controlled HTTP results.
const client=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
const refresh=client.slice(client.indexOf('async function refresh('),client.indexOf('\nasync function openLead'));
test('summary failure does not discard successful results or stop active-run polling',async()=>{
  let rejectSummary,loaded=0,rendered=0,scheduled=0,notice='';
  const button={disabled:false};
  const context=vm.createContext({busy:false,pollTimer:null,runs:[],document:{hidden:false},
    $:()=>button,clearTimeout(){},setTimeout:()=>{scheduled++;return 1;},
    request:path=>path.endsWith('/summary')?new Promise((_,reject)=>{rejectSummary=reject;}):Promise.resolve({runs:[{status:'running'}]}),
    renderSummary(){throw Error('Failed summary must not render.');},
    renderRuns:data=>{rendered++;context.runs=data.runs;},loadLeads:async()=>{loaded++;},
    notice:text=>{notice=text;}});
  vm.runInContext(refresh,context);
  const work=context.refresh();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loaded,1);assert.equal(rendered,1);assert.equal(button.disabled,true);
  await context.refresh();assert.equal(loaded,1,'overlapping refresh must not start another request');
  rejectSummary(Error('Timed out'));await work;
  assert.match(notice,/Summary: Timed out/);assert.equal(button.disabled,false);assert.equal(scheduled,1);
});

test('older search successes and failures cannot replace newer results',async()=>{
 const calls=[],rendered=[],fields={search:{value:'old'},qualityFilter:{value:''}};
 const context=vm.createContext({offset:0,leadLoadVersion:0,URLSearchParams,$:id=>fields[id],renderLeads:data=>rendered.push(data),request:url=>new Promise((resolve,reject)=>calls.push({url,resolve,reject}))});
 vm.runInContext(client.slice(client.indexOf('async function loadLeads('),client.indexOf('\nfunction sourceIssues')),context);
 const old=context.loadLeads();fields.search.value='new';const fresh=context.loadLeads();
 calls[1].resolve({total:1,label:'new'});await fresh;calls[0].resolve({total:0,label:'old'});await old;
 assert.deepEqual(rendered,[{total:1,label:'new'}]);
 const staleError=context.loadLeads();const newest=context.loadLeads();calls[3].resolve({total:2});await newest;calls[2].reject(Error('Old failure'));await staleError;
 assert.equal(rendered.length,2);assert.equal(rendered[1].total,2);
 const currentError=context.loadLeads();calls[4].reject(Error('Current failure'));await assert.rejects(currentError,/Current failure/);
});
