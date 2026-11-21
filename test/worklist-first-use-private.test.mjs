import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8'),html=readFileSync(new URL('../lab.html',import.meta.url),'utf8');
test('Worklist exposes two first-use choices before advanced research, preserves separate live recipes',()=>{
 for(const [id,label] of [['quickImport','Import a CSV'],['buildSearchPlan','Build a search plan']]){assert.match(html,new RegExp('<button id="'+id+'"[^>]*>'+label+'</button>'));assert.ok(html.indexOf('id="'+id+'"')<html.indexOf('id="researchTools"'));}
 assert.ok(html.indexOf('id="findProspects"')>html.indexOf('id="researchTools"'));
 assert.match(html,/Open discovery recipes \(live research\)/);assert.match(html,/Opening recipes does not start a search/);
});
test('first-use clicks navigate only; neither queues or loads discovery recipes',()=>{
 const nodes={},visits=[];let recipes=0;const context=vm.createContext({$:id=>nodes[id]??=( {} ),location:{assign:url=>visits.push(url)},openPlaybooks:()=>recipes++,request:()=>assert.fail('Unexpected API call')});
 for(const id of ['quickImport','buildSearchPlan','findProspects']){const line=source.split('\n').find(l=>l.startsWith("$('"+id+"').onclick="));assert.ok(line);vm.runInContext(line,context);}
 nodes.quickImport.onclick();nodes.buildSearchPlan.onclick();assert.deepEqual(visits,['/prospect?import=1','/audience']);assert.equal(recipes,0);
 nodes.findProspects.onclick();assert.equal(recipes,1);
});
