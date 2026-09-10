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
