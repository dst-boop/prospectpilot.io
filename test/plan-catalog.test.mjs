import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {matchPlans,selectEmployers} from '../plan-catalog.mjs';
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
