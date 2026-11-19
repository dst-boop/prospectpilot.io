import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {selectEmployers,matchPlans} from '../plan-catalog.mjs';
import {labConfiguration} from '../research-lab.mjs';
import {applyPlaybook} from '../rollover-playbooks.mjs';
const year=new Date().getUTCFullYear()-1;
async function fixture(run){const db=new PGlite();try{
 for(const f of ['generated/schema.sql','migrations/006-research-lab.sql','migrations/017-forget.sql'])await db.exec(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
 const put=async(id,sponsor,count,assets,extra={})=>{const p={id,ein:sponsor,plan_number:id,sponsor,plan_name:id,state:'NY',plan_year:year,net_assets:assets,separated_future_benefits:count,participants_with_balances:100,average_account_balance:100,benefit_codes:['2L'],...extra};await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5)',[id,sponsor.toLowerCase(),'NY',p.plan_year,JSON.stringify(p)]);return p;};
 await run(db,put);
 }finally{await db.close();}}
const active=()=>labConfiguration(applyPlaybook({playbook:'former_employees',states:['NY']}));

test('multi-plan sponsor selection follows active count signal, not largest assets; plan evidence is not summed',async()=>fixture(async(db,put)=>{
 await put('A assets','Alpha',5,1000000,{average_account_balance:10000});
 await put('A population','Alpha',100,1000);
 await put('B plan','Beta',50,5000);
 const rows=await selectEmployers(db,active());
 assert.deepEqual(rows.map(p=>[p.id,p.separated_future_benefits]),[['A population',100],['B plan',50]]);
 assert.equal((await selectEmployers(db,{...active(),max_companies:1}))[0].id,'A population');
 assert.equal((await selectEmployers(db)).find(p=>p.sponsor==='Alpha').id,'A assets','default asset-based representative unchanged');
 assert.equal((await selectEmployers(db,{plan_filter:{order:'former_employees'}}))[0].id,'A assets','legacy weighted selection uses its own metric');
 const plans=await matchPlans(db,{company:'Alpha'});assert.equal(plans.length,2);
 const src=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8'),start=src.indexOf("  $('personPlans').innerHTML="),assignment=src.slice(start,src.indexOf('\n}',start));const element={};
 vm.runInNewContext(assignment,{$:()=>element,q:{plans},esc:x=>x??'',dollars:x=>String(x),num:x=>String(x),planType:()=>'',link:()=>''});
 for(const p of plans){assert.ok(element.innerHTML.includes(p.plan_name));assert.ok(element.innerHTML.includes('Separated participants with future benefits: '+p.separated_future_benefits+'<small>'));}
 assert.ok(!element.innerHTML.includes('Separated participants with future benefits: 105<small>'));
}));

test('representative selection keeps newest year and latest filing ahead of older high counts',async()=>fixture(async(db,put)=>{
 await put('old plan','Alpha',999,999999,{plan_year:year-1});await put('new plan','Alpha',1,1000);
 await put('old filing','Beta',888,888888,{plan_number:'same',filed_at:'2026-01-01'});
 await put('new filing','Beta',2,1000,{plan_number:'same',filed_at:'2026-02-01'});
 await put('wrong kind','Gamma',999,999999,{benefit_codes:['2J']});await put('right kind','Gamma',3,1000);
 const rows=await selectEmployers(db,labConfiguration(applyPlaybook({playbook:'nonprofit_403b'})));
 assert.deepEqual(rows.map(p=>p.id),['right kind','new filing','new plan']);
}));

test('same-sponsor zero beats unknown, all unknown remains unknown, and equal metrics select deterministically',async()=>fixture(async(db,put)=>{
 await put('unknown rich','Alpha',null,999999);await put('zero small','Alpha',0,1);
 await put('unknown only','Beta',null,1000);
 await put('tie z','Gamma',10,100);await put('tie a','Gamma',10,100);
 const rows=await selectEmployers(db,active());
 assert.deepEqual(rows.map(p=>[p.id,p.separated_future_benefits]),[['tie a',10],['zero small',0],['unknown only',null]]);
 await db.query("DELETE FROM employer_plan_catalog WHERE id='tie a'");await put('tie a','Gamma',10,100);
 assert.equal((await selectEmployers(db,active()))[0].id,'tie a');
}));

test('legacy weighted representative keeps missing average unknown rather than a known zero',async()=>fixture(async(db,put)=>{
 await put('missing average','Alpha',100,999999,{average_account_balance:null});
 await put('known zero','Alpha',0,1,{average_account_balance:100});
 assert.equal((await selectEmployers(db,{plan_filter:{order:'former_employees'}}))[0].id,'known zero');
 assert.equal((await selectEmployers(db,active()))[0].id,'missing average','active population metric does not require an average balance');
}));
