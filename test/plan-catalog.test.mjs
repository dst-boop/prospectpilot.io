import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {matchPlans,selectEmployers,importPlanRecords} from '../plan-catalog.mjs';
test('plan matches use exact company identity; discovery rotates recently researched employers',async()=>{
  const db=new PGlite();try{
    await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/006-research-lab.sql',import.meta.url),'utf8'));
    const year=new Date().getUTCFullYear()-1;
    for(const [id,sponsor,balances,separated] of [['a','Example Manufacturing',500,200],['b','Other Manufacturing',100,0]])await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[id,sponsor.toLowerCase(),'NY',year,JSON.stringify({id,sponsor,ein:id,plan_number:'001',plan_year:year,net_assets:5000000,participants_with_balances:balances,separated_future_benefits:separated,scope:'employer_plan'})]);
    assert.equal((await matchPlans(db,{company:'Example'})).length,0);assert.equal((await matchPlans(db,{company:'EXAMPLE MANUFACTURING'})).length,1);
    assert.equal((await selectEmployers(db,{states:['NY'],max_companies:1},'u'))[0].sponsor,'Example Manufacturing');
    await db.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key) VALUES('r','u','u@example.com','discovery','r')");
    await db.query("INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES('t','r','t','public_web',$1::jsonb)",[JSON.stringify({company:'Example Manufacturing'})]);
    assert.equal((await selectEmployers(db,{max_companies:1},'u'))[0].sponsor,'Other Manufacturing');
    assert.equal((await selectEmployers(db,{states:['CA']},'u')).length,0);
  }finally{await db.close();}
});
test('latest filing is chosen before termination and location filters',async()=>{
 const db=new PGlite();try{
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/006-research-lab.sql',import.meta.url),'utf8'));
  const year=new Date().getUTCFullYear();
  const put=async(id,ein,planYear,state,distributed,sponsor='Example Co')=>db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[id,sponsor.toLowerCase(),state,planYear,JSON.stringify({id,ein,plan_number:'001',sponsor,plan_year:planYear,all_assets_distributed:distributed,net_assets:1000,participants_with_balances:10})]);
  await put('closed-old','111111111',year-1,'NY',false);await put('closed-new','111111111',year,'NY',true);
  assert.equal((await selectEmployers(db,{states:['NY']})).length,0);
  await put('moved-old','222222222',year-1,'NY',false,'Moved Co');await put('moved-new','222222222',year,'CA',false,'Moved Co');
  assert.equal((await selectEmployers(db,{states:['NY']})).length,0);assert.equal((await selectEmployers(db,{states:['CA']}))[0].id,'moved-new');
  await put('renamed-old','333333333',year-1,'NY',false,'Old Name');await put('renamed-new','333333333',year,'NY',false,'New Name');
  assert.equal((await selectEmployers(db,{employers:['Old Name']})).length,0);
  assert.equal((await matchPlans(db,{company:'Old Name'})).length,0);
  assert.equal((await matchPlans(db,{company:'New Name'}))[0].id,'renamed-new');
 }finally{await db.close();}
});

test('catalog refresh rolls back every batch on malformed input and rejects older amendments',async()=>{
 const db=new PGlite();try{
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/006-research-lab.sql',import.meta.url),'utf8'));
  const make=(i,ack='b')=>({id:`plan-${i}`,sponsor:'Example Co',state:'NY',plan_year:2025,scope:'employer_plan',individual_balance:null,filed_at:'2026-01-01',ack_id:ack});
  await importPlanRecords(db,[make(0)]);
  await assert.rejects(importPlanRecords(db,[...Array.from({length:500},(_,i)=>make(i+1)),{id:'malformed'}]),/Invalid plan/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM employer_plan_catalog')).rows[0].n,1);
  const result=await importPlanRecords(db,[make(0,'a')]);assert.equal(result.older_filings_skipped,1);
  assert.equal((await db.query('SELECT payload FROM employer_plan_catalog')).rows[0].payload.ack_id,'b');
  await assert.rejects(importPlanRecords(db,[]),/Empty plan catalog/);
 }finally{await db.close();}
});
