import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {PGlite} from '@electric-sql/pglite';import {selectEmployers} from '../plan-catalog.mjs';
test('local worksite does not make an out-of-state plan sponsor match the state filter',async()=>{
 const db=new PGlite();try{
  for(const file of ['generated/schema.sql','migrations/006-research-lab.sql','migrations/017-forget.sql'])await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const year=new Date().getUTCFullYear()-1;const p={id:'synthetic-plan',ein:'synthetic',plan_number:'001',sponsor:'Fictional Multistate Employer',state:'CA',worksite_state:'NY',plan_year:year,participants_with_balances:100,separated_future_benefits:20};
  await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5)',[p.id,'fictional multistate employer','CA',year,JSON.stringify(p)]);
  assert.equal((await selectEmployers(db,{states:['NY']})).length,0);
  const broad=await selectEmployers(db,{states:[]});assert.equal(broad.length,1);assert.equal(broad[0].state,'CA');assert.equal(broad[0].worksite_state,'NY');
 }finally{await db.close();}
});
test('plan-state help is explicit and broadening only edits the proposed filter',()=>{
 const html=readFileSync(new URL('../lab.html',import.meta.url),'utf8');const js=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
 assert.match(html,/Plan sponsor mailing states/);assert.match(html,/not local worksites or where participants live/);assert.match(html,/id="playbookAllStates"[^>]*type="button"/);
 const match=js.match(/\$\('playbookAllStates'\)\.onclick=\(\)=>\{[^\n]+\};/);assert.ok(match);
 const nodes={playbookAllStates:{},playbookStates:{value:'NY',focus(){this.focused=true;}}};vm.runInNewContext(match[0],{$:id=>nodes[id]});nodes.playbookAllStates.onclick();assert.equal(nodes.playbookStates.value,'');assert.equal(nodes.playbookStates.focused,true);
 const needs=js.match(/function playbookNeeds\(\)\{[^\n]+\}/)[0];Object.assign(nodes,{playbookPlaceLabel:{},playbookStatesLabel:{},playbookPlace:{}});
 for(const place of [true,false]){vm.runInNewContext(needs+';playbookNeeds()',{$:id=>nodes[id],selectedPlaybook:()=>({needs:place?'place':'states'})});assert.equal(nodes.playbookStatesLabel.hidden,place);assert.equal(nodes.playbookPlace.required,place);}
});
