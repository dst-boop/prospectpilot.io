import test from 'node:test';
import assert from 'node:assert/strict';
import {createLead,addEvidence,evidenceSummary,estimateAge,scoreProspect,qualificationState} from '../prospect-core.mjs';
import {compareIdentity,chooseIdentityMatch} from '../identity-resolution.mjs';
import {normalizeCampaign,companyDiscoveryQueries,personDiscoveryQueries,nextSources,campaignFunnel} from '../campaign-engine.mjs';

const now=new Date('2026-09-27T12:00:00Z');

test('evidence preserves conflicting values instead of overwriting',()=>{
  let lead=createLead({first_name:'Jane',last_name:'Smith'},{now,id:'PP-1'});
  lead=addEvidence(lead,{field:'graduation_year',value:1989,source_type:'university',source_url:'https://example.edu/alumni',confidence:.93},{now});
  lead=addEvidence(lead,{field:'graduation_year',value:1991,source_type:'employer_site',source_url:'https://example.com/bio',confidence:.94},{now});
  const result=evidenceSummary(lead.evidence).resolved.graduation_year;
  assert.equal(result.status,'conflicting');
  assert.equal(result.alternatives.length,1);
});

test('age estimation combines graduation and career signals',()=>{
  let lead=createLead({first_name:'Jane',last_name:'Smith'},{now,id:'PP-2'});
  lead=addEvidence(lead,{field:'graduation_year',value:1989,source_type:'university',confidence:.93},{now});
  lead=addEvidence(lead,{field:'career_start_year',value:1990,source_type:'employer_site',confidence:.9},{now});
  const age=estimateAge(lead,{asOf:now});
  assert.ok(age.min>=55);
  assert.ok(age.max<=65);
  assert.ok(age.confidence>.8);
});

test('scores keep qualification, rollover, confidence and contactability separate',()=>{
  let lead=createLead({first_name:'Jane',last_name:'Smith',current_title:'Vice President',company:'Acme',business_email:'jane@acme.com',mobile:'5165551212',previous_employers:['OldCo'],employment_history:[{company:'OldCo',start_year:1998,end_year:2025,current:false}],retirement_plans:[{plan_name:'OldCo 401(k)',plan_type:'401(k)'}],signals:['job change 2025']},{now,id:'PP-3'});
  lead=addEvidence(lead,{field:'graduation_year',value:1988,source_type:'university',confidence:.93},{now});
  lead=addEvidence(lead,{field:'plan_name',value:'OldCo 401(k)',source_type:'dol_form_5500',confidence:.98},{now});
  const score=scoreProspect(lead,{asOf:now});
  assert.ok(score.qualification>=70);
  assert.ok(score.rollover_opportunity>=80);
  assert.ok(score.contactability>=50);
  assert.notEqual(score.qualification,score.contactability);
  assert.ok(['qualified','contact_ready','needs_enrichment'].includes(qualificationState(score)));
});

test('identity resolution prefers strong cross-source identifiers',()=>{
  const a={first_name:'Jane',last_name:'Smith',company:'Acme Corp',current_title:'Vice President',city:'Huntington',state:'NY',business_email:'jane.smith@acme.com',mobile:'5165551212'};
  const b={first_name:'Jane',last_name:'Smith',company:'Acme Corporation',current_title:'VP',city:'Huntington',state:'NY',business_email:'jane.smith@acme.com',mobile:'(516) 555-1212'};
  const result=compareIdentity(a,b);
  assert.equal(result.outcome,'confirmed');
  assert.ok(result.confidence>=85);
});

test('identity resolution refuses same-name records with conflicting context',()=>{
  const candidate={first_name:'John',last_name:'Smith',company:'Acme',state:'NY'};
  const existing=[{id:'a',first_name:'John',last_name:'Smith',company:'Other Co',state:'MA'},{id:'b',first_name:'John',last_name:'Smith',company:'Third Co',state:'CA'}];
  assert.equal(chooseIdentityMatch(candidate,existing).outcome,'review');
});

test('campaign creates company-first queries and fallback source order',()=>{
  const campaign=normalizeCampaign({name:'LI Electric',zip:'11747',radius_miles:25,industry:['electrical contractor'],company_types:['contractor'],titles:['owner','president']});
  const queries=companyDiscoveryQueries(campaign);
  assert.ok(queries.some(q=>q.includes('11747')));
  const people=personDiscoveryQueries({name:'Acme Electric',domain:'acmeelectric.com'},campaign);
  assert.ok(people.some(q=>q.includes('Acme Electric')));
  const remaining=nextSources({attempted:['search_index'],blocked:['company_site']});
  assert.equal(remaining[0],'press_release');
});

test('campaign funnel measures unit economics',()=>{
  const funnel=campaignFunnel([{stage:'people_discovered',count:100,cost_micros:100000},{stage:'qualified',count:20,cost_micros:200000},{stage:'contact_ready',count:10,cost_micros:200000}]);
  assert.equal(funnel.cost_micros,500000);
  assert.equal(funnel.cost_per_qualified_micros,25000);
  assert.equal(funnel.cost_per_contact_ready_micros,50000);
});
