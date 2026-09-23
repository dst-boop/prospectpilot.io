import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function client(){
 const elements=new Map(),pending=[];
 const create=id=>{const value={textContent:'',innerHTML:'',disabled:false,open:false,value:'Reviewed source',dataset:{},
  insertAdjacentHTML(){},showModal(){this.open=true;},addEventListener(event,fn){this[event+'Handler']=fn;},close(){this.open=false;this.closeHandler?.();}};elements.set(id,value);return value;};
 for(const id of ['contactTitle','contactBody','contactError','toggleSuppression','closeContact','correctionForm','conflictReason0'])create(id);
 const conflict=create('conflict');conflict.dataset={conflict:'0',decision:'keep'};
 const context=vm.createContext({$:id=>elements.get(id),esc:String,notice(){},load:async()=>{},
  FormData:class{constructor(){return [['first_name','A'],['last_name','Example'],['reason','Reviewed source']];}},
  document:{body:{insertAdjacentHTML(){create('contactDialog');}},querySelectorAll:()=>[conflict]},
  api:(url,body,method)=>new Promise((resolve,reject)=>pending.push({url,body,method,resolve,reject}))});
 const source=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('let contactViewVersion=0;'),source.indexOf("$('importFormat').onchange")),context);
 return {elements,pending,open:id=>vm.runInContext(`showContact(${JSON.stringify(id)})`,context)};
}
const record=name=>({contact:{first_name:name,last_name:'Example',edit_revision:name,source_history:[{source:'Fixture',proposed_values:{title:'Manager'}}]},lists:[]});

test('contact dialog ignores stale failures and does not reopen after closing during a request',async()=>{
 const c=client(),a=c.open('A'),b=c.open('B');c.pending[1].resolve(record('B'));await b;
 c.pending[0].reject(Error('Old failure'));await a;assert.equal(c.elements.get('contactTitle').textContent,'B Example');
 assert.equal(c.elements.get('contactError').textContent,'');
 const next=c.open('C');c.elements.get('contactDialog').close();c.pending[2].resolve(record('C'));await next;
 assert.equal(c.elements.get('contactDialog').open,false);assert.equal(c.elements.get('toggleSuppression').disabled,true);
});

for(const operation of ['correction','conflict','suppression'])test(`${operation} completion cannot reopen an older contact`,async()=>{
 const c=client(),a=c.open('A');c.pending[0].resolve(record('A'));await a;
 const save=operation==='correction'?c.elements.get('correctionForm').onsubmit({preventDefault(){},submitter:{disabled:false},target:{}}):c.elements.get(operation==='conflict'?'conflict':'toggleSuppression').onclick();
 assert.equal(c.pending[1].url,'contacts/A');assert.equal(c.pending[1].method,'PATCH');
 c.elements.get('contactDialog').close();const b=c.open('B');c.pending[2].resolve(record('B'));await b;
 c.pending[1].resolve({ok:true});await save;
 assert.equal(c.pending.length,3);assert.equal(c.elements.get('contactTitle').textContent,'B Example');
 assert.equal(c.elements.get('contactError').textContent,'');
});

test('an earlier suppression failure cannot alter the newly opened contact',async()=>{
 const c=client(),a=c.open('A');c.pending[0].resolve(record('A'));await a;
 const save=c.elements.get('toggleSuppression').onclick();c.elements.get('contactDialog').close();const b=c.open('B');
 c.pending[2].resolve(record('B'));await b;c.pending[1].reject(Error('Old failure'));await save;
 assert.equal(c.elements.get('contactError').textContent,'');assert.equal(c.elements.get('contactTitle').textContent,'B Example');
});
