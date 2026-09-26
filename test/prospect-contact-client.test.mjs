import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function client(){
 const elements=new Map(),pending=[];
 const create=id=>{const value={textContent:'',innerHTML:'',disabled:false,open:false,value:'Reviewed source',dataset:{},
  insertAdjacentHTML(){},append(element){this.lastChild=element;},scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;},querySelector(){return elements.get('firstField');},showModal(){this.open=true;},addEventListener(event,fn){this[event+'Handler']=fn;},close(){this.open=false;this.closeHandler?.();}};elements.set(id,value);return value;};
 for(const id of ['contactTitle','contactBody','contactError','toggleSuppression','deletePerson','closeContact','correctionForm','conflictReason0','contactHistory','contactHistoryBody','editContact','reviewContactConflicts','contactConflicts','correctionPanel','firstField','retryContact'])create(id);
 const conflict=create('conflict');conflict.dataset={conflict:'0',decision:'keep'};
 const context=vm.createContext({selected:new Set(),$:id=>elements.get(id),esc:String,notice(){},load:async()=>{},
  FormData:class{constructor(){return [['first_name','A'],['last_name','Example'],['reason','Reviewed source']];}},
  document:{body:{insertAdjacentHTML(){create('contactDialog');}},querySelectorAll:()=>[conflict]},
  api:(url,body,method)=>new Promise((resolve,reject)=>pending.push({url,body,method,resolve,reject}))});
 const source=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('let contactViewVersion=0;'),source.indexOf("$('importFormat').onchange")),context);
 return {elements,pending,open:id=>vm.runInContext(`showContact(${JSON.stringify(id)})`,context)};
}
const record=name=>({contact:{first_name:name,last_name:'Example',edit_revision:name,source_history:[{source:'Fixture',proposed_values:{title:'Manager'}}]},lists:[]});

test('failed contact details retry in place and restore current review actions',async()=>{
 const c=client(),failed=c.open('A');c.pending[0].reject(Error('Temporary failure'));await failed;
 assert.match(c.elements.get('contactBody').innerHTML,/Retry contact details/);
 assert.equal(c.elements.get('toggleSuppression').disabled,true);
 const retry=c.elements.get('retryContact').onclick();
 assert.equal(c.pending[1].url,'contacts/A');assert.equal(c.pending[1].body,undefined);
 c.pending[1].resolve(record('A'));await retry;
 assert.equal(c.elements.get('contactTitle').textContent,'A Example');
 assert.equal(c.elements.get('contactError').textContent,'');
 assert.equal(c.elements.get('toggleSuppression').disabled,false);
});

test('contact retry cannot affect a newer contact or reopen a closed dialog',async()=>{
 const c=client(),failed=c.open('A');c.pending[0].reject(Error('Temporary failure'));await failed;
 const oldRetry=c.elements.get('retryContact').onclick;
 const retry=oldRetry();c.elements.get('contactDialog').close();
 const newer=c.open('B');c.pending[2].resolve(record('B'));await newer;
 c.pending[1].resolve(record('A'));await retry;
 assert.equal(c.elements.get('contactTitle').textContent,'B Example');
 await oldRetry();assert.equal(c.pending.length,3);
 const failedAgain=c.open('C');c.pending[3].reject(Error('Temporary failure'));await failedAgain;
 const closedRetry=c.elements.get('retryContact').onclick;c.elements.get('contactDialog').close();
 await closedRetry();assert.equal(c.pending.length,4);assert.equal(c.elements.get('contactDialog').open,false);
});

test('contact actions open and focus the relevant review while history follows the workflow',async()=>{
 const c=client(),a=c.open('A');c.pending[0].resolve(record('A'));await a;
 c.elements.get('editContact').onclick();
 assert.equal(c.elements.get('correctionPanel').open,true);
 assert.equal(c.elements.get('firstField').focused,true);
 c.elements.get('reviewContactConflicts').onclick();
 assert.equal(c.elements.get('contactConflicts').scrolled,true);
 assert.equal(c.elements.get('contactConflicts').focused,true);
 assert.equal(c.elements.get('contactBody').lastChild,c.elements.get('contactHistory'));
});

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

test('delete this person takes a second click, then deletes and closes the dialog',async()=>{
 const c=client(),a=c.open('A');c.pending[0].resolve(record('A'));await a;
 const remove=c.elements.get('deletePerson');
 await remove.onclick();
 assert.equal(c.pending.length,1,'the first click only arms the button');
 assert.match(c.elements.get('contactError').textContent,/do-not-call block keeps the number/);
 const done=remove.onclick();
 assert.equal(c.pending[1].url,'contacts/A');assert.equal(c.pending[1].method,'DELETE');
 c.pending[1].resolve({deleted:true,contacts:1,leads:1});await done;
 assert.equal(c.elements.get('contactDialog').open,false);
});

test('reopening a contact disarms the delete button',async()=>{
 const c=client(),a=c.open('A');c.pending[0].resolve(record('A'));await a;
 await c.elements.get('deletePerson').onclick();
 const b=c.open('B');c.pending[1].resolve(record('B'));await b;
 assert.equal(c.elements.get('deletePerson').dataset.armed,'');
 await c.elements.get('deletePerson').onclick();
 assert.equal(c.pending.length,2);
});
