import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {PLAYBOOKS,applyPlaybook,findPlaybook,playbookChoices} from '../rollover-playbooks.mjs';
import {selectEmployers,planKinds} from '../plan-catalog.mjs';
import {labConfiguration} from '../research-lab.mjs';

test('every playbook is a valid free-source lab configuration',()=>{
  for(const p of PLAYBOOKS){
    const config=labConfiguration(applyPlaybook({playbook:p.id,states:['NY'],location:'11747',daily_budget_micros:5000000}));
    assert.equal(config.playbook,p.id);
    assert.equal(config.daily_budget_micros,0,'a playbook never spends');
    assert.ok(!config.sources.includes('web_search'),'paid search stays opt-in');
  }
  assert.deepEqual(playbookChoices().map(p=>p.id),PLAYBOOKS.map(p=>p.id));
  assert.ok(playbookChoices().every(p=>!('configuration' in p)));
});

test('a playbook fills in the search; the advisor only says where',()=>{
  const former=applyPlaybook({playbook:'nonprofit_403b',states:['NY','NJ'],employers:['Acme'],websites:['https://acme.test'],location:'11747'});
  assert.deepEqual(former.states,['NY','NJ']);
  assert.deepEqual(former.employers,[]);assert.equal(former.location,'');
  assert.deepEqual(former.plan_filter.kinds,['403b']);assert.equal(former.plan_filter.min_average,100000);
  const owners=applyPlaybook({playbook:'business_owners',location:'Huntington, NY'});
  assert.equal(owners.location,'Huntington, NY');assert.ok(owners.industries.length&&owners.titles.includes('Owner'));
  assert.throws(()=>applyPlaybook({playbook:'business_owners',location:' '}),{status:422});
  const custom={employers:['Acme']};assert.equal(applyPlaybook(custom),custom,'no playbook leaves a custom search alone');
  assert.equal(findPlaybook('nope'),null);
  assert.equal(labConfiguration({playbook:'nope'}).playbook,'');
  assert.throws(()=>labConfiguration({plan_filter:{kinds:['457']}}),{status:422});
});

test('plan filters choose employers by plan type, average and former-employee pool',async()=>{
  const db=new PGlite();try{
    await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../migrations/006-research-lab.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../migrations/017-forget.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../migrations/012-plan-catalog-summary.sql',import.meta.url),'utf8'));
    const year=new Date().getUTCFullYear()-1;
    const plans=[
      ['hospital','Example Hospital',['2L'],250000,10000,false],
      ['university','Example University',['2L','2J'],120000,400,true],
      ['factory','Example Factory',['2J'],180000,3000,true],
      ['small','Small Shop',['2J'],40000,90000,true],
    ];
    for(const [id,sponsor,codes,average,separated,inService] of plans)await db.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[id,sponsor.toLowerCase(),'NY',year,JSON.stringify({id,sponsor,ein:id,plan_number:'001',plan_year:year,benefit_codes:codes,average_account_balance:average,participants_with_balances:1000,separated_future_benefits:separated,in_service_distributions_reported:inService,scope:'employer_plan'})]);
    const pick=async playbook=>(await selectEmployers(db,labConfiguration(applyPlaybook({playbook,states:['NY']})),'u')).map(p=>p.id);
    // Largest left-behind pool first; the $40K-average plan never qualifies the list.
    assert.deepEqual(await pick('former_employees'),['hospital','factory','university']);
    assert.deepEqual(await pick('nonprofit_403b'),['hospital','university']);
    assert.deepEqual((await pick('in_service_595')).sort(),['factory','university']);
    // No filter keeps the earlier behaviour: every employer is a candidate.
    assert.equal((await selectEmployers(db,{states:['NY']},'u')).length,4);
    assert.deepEqual(planKinds({benefit_codes:['2L','2J']}),['401k','403b']);
    assert.deepEqual(planKinds({}),[]);
  }finally{await db.close();}
});
