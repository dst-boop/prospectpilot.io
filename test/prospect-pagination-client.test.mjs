import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function client(responses){
 const elements=new Map(),requests=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,classList:{toggle(){}}});return elements.get(id);};
 const context=vm.createContext({URLSearchParams,FormData:class{constructor(){return [];}},
  document:{getElementById:element,querySelectorAll:()=>[]}});
 const source=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('const $='),source.indexOf('async function loadLists()')),context);
 context.reply=async path=>{requests.push(path);assert.ok(responses.length,'Unexpected repeat request');return responses.shift();};
 vm.runInContext('api=reply',context);
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
