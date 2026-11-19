import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {selectEmployers} from '../plan-catalog.mjs';

test('former-participant sorting keeps unknown distinct from reported zero',async()=>{
 const db=new PGlite();try{
  for(const file of ['generated/schema.sql','migrations/006-research-lab.sql','migrations/017-forget.sql'])await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const year=new Date().getUTCFullYear()-1;
  // Unknown has more accounts and a name that would win secondary ties.
  for(const [id,count,accounts] of [['A unknown',null,999],['B zero',0,10],['C positive',12,20]]){
   const p={id,ein:id,plan_number:'001',sponsor:id,plan_year:year,participants_with_balances:accounts,separated_future_benefits:count,average_account_balance:10000};
   await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[id,id.toLowerCase(),'NY',year,JSON.stringify(p)]);
  }
  for(const order of ['former_employee_population','former_employees']){
   const rows=await selectEmployers(db,{plan_filter:{order}});
   assert.deepEqual(rows.map(p=>p.id),['C positive','B zero','A unknown']);
   assert.deepEqual(rows.map(p=>p.separated_future_benefits),[12,0,null]);
  }
  assert.equal((await selectEmployers(db)).length,3,'unknown is not excluded from discovery');
  await db.query(`UPDATE employer_plan_catalog SET payload=payload||'{"average_account_balance":null}'::jsonb WHERE id='C positive'`);
  const legacy=await selectEmployers(db,{plan_filter:{order:'former_employees'}});
  assert.equal(legacy[0].id,'B zero','missing average does not fabricate a zero weighted value');
  assert.equal((await selectEmployers(db,{plan_filter:{order:'former_employee_population'}}))[0].id,'C positive','active count ranking ignores account averages');
 }finally{await db.close();}
});

test('existing plan UI renders unknown, zero and positive counts distinctly',()=>{
 const source=readFileSync(new URL('../lab-client.js',import.meta.url),'utf8');
 const assignment=source.slice(source.indexOf("  $('personPlans').innerHTML="),source.indexOf('\n}',source.indexOf("  $('personPlans').innerHTML=")));
 assert.ok(assignment.length>0);
 for(const [count,label] of [[null,'Unknown'],[0,'0'],[12,'12']]){
  const element={};
  vm.runInNewContext(assignment,{$:()=>element,q:{plans:[{sponsor:'Synthetic',separated_future_benefits:count}]},esc:x=>x??'',dollars:()=>'',num:x=>String(x),planType:()=>'',link:()=>''});
  assert.ok(element.innerHTML.includes('Separated participants with future benefits: '+label+'<small>'));
  assert.ok(element.innerHTML.includes('Employer-level figures; not this person’s balance.'));
 }
});
