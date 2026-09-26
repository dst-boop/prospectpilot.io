import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function client(responses){
 const elements=new Map(),requests=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,setAttribute(key,value){this[key]=value;},classList:{toggle(){}}});return elements.get(id);};
 const context=vm.createContext({URLSearchParams,matchMedia:()=>({matches:false}),FormData:class{constructor(){return [];}},
  document:{getElementById:element,querySelectorAll:()=>[]}});
 const source=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('const $='),source.indexOf('async function loadLists()')),context);
 context.reply=async path=>{requests.push(path);assert.ok(responses.length,'Unexpected repeat request');const response=responses.shift();if(response instanceof Error)throw response;return response;};
 vm.runInContext('api=reply',context);
 vm.runInContext(source.slice(source.indexOf('async function initializeDirectory()'),source.indexOf('await initializeDirectory();')),context);
 return {element,requests,run:code=>vm.runInContext(code,context)};
}
const person={id:'1',first_name:'Jamie',last_name:'Example'};
test('a removed last page returns to the final populated contact page',async()=>{
 const c=client([{contacts:[],total:51},{contacts:[person],total:51}]);
 await c.run('offset=100;load()');
 assert.equal(c.requests.length,2);assert.match(c.requests[1],/offset=50/);
 assert.equal(c.element('pageLabel').textContent,'51–51 of 51');assert.equal(c.element('next').disabled,true);
 assert.match(c.element('table').innerHTML,/Jamie Example/);
});
test('empty contacts reset pagination and inconsistent counts cannot cause a retry loop',async()=>{
 const empty=client([{contacts:[],total:0}]);await empty.run('offset=50;load()');
 assert.equal(empty.run('offset'),0);assert.equal(empty.element('previous').disabled,true);
 assert.equal(empty.element('pageLabel').textContent,'0 contacts');
 const inconsistent=client([{contacts:[],total:51}]);await inconsistent.run('offset=50;load()');
 assert.equal(inconsistent.requests.length,1);
});

 test('failed refresh removes stale contacts, disables selection, and offers a working retry',async()=>{
  const c=client([{contacts:[person],total:1},new Error('Connection interrupted'),{contacts:[person],total:1}]);
  await c.run('load()');await c.run("selected.add('1');selection();load()");
  assert.doesNotMatch(c.element('table').innerHTML,/Jamie Example/);assert.match(c.element('table').innerHTML,/Retry contacts/);
  assert.equal(c.run('selected.size'),0);assert.equal(c.element('export').disabled,true);assert.equal(c.element('next').disabled,true);
  c.run("notice('Import saved.')");assert.match(c.element('notice').textContent,/Import saved.*could not refresh/);
  await c.element('retryContacts').onclick();assert.match(c.element('table').innerHTML,/Jamie Example/);
  assert.equal(c.element('notice').textContent,'Contacts updated.');assert.equal(c.element('table')['aria-busy'],'false');
 });

 test('late failed requests cannot replace a newer successful search',async()=>{
  let rejectOld;const old=new Promise((resolve,reject)=>{rejectOld=reject;});
  const c=client([old,{contacts:[person],total:1}]);const pending=c.run('load()');
  assert.equal(c.element('export').disabled,true);assert.equal(c.element('table')['aria-busy'],'true');
  await c.run('load()');rejectOld(Error('Old request failed'));await pending;
  assert.match(c.element('table').innerHTML,/Jamie Example/);assert.equal(c.run('directoryError'),'');
  assert.equal(c.element('table')['aria-busy'],'false');
 });

test('startup list failure offers a retry that initializes the whole directory',async()=>{
 const c=client([{contacts:[person],total:1}]);
 c.run("let attempts=0;function loadLists(){if(attempts++===0)throw Error('Lists unavailable');}function loadSearches(){}");
 await c.run('initializeDirectory()');assert.match(c.element('table').innerHTML,/Lists unavailable/);
 assert.doesNotMatch(c.element('notice').textContent,/workspace is ready/);
 await c.element('retryContacts').onclick();assert.equal(c.run('attempts'),2);
 assert.match(c.element('table').innerHTML,/Jamie Example/);assert.equal(c.element('notice').textContent,'Your contact workspace is ready.');
});
