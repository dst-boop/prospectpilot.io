import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {assessLead,leadScores,leadIdentity,validateObservation} from '../lead-quality.mjs';

const now=new Date('2026-10-02T12:00:00Z');
const lead={first_name:'Example',last_name:'Prospect',company:'Example Co',email:'example@example.com'};
const transfer={account_type:'401k',route:'separated',assets_confirmed:true,eligible_distribution:true,individual:true,evidence_basis:'participant_disclosure',consent_confirmed:true};
const amount={...transfer,lower_bound_usd:100000,amount_scope:'eligible_retained_assets'};
const review=(field,value)=>validateObservation({field,value,verdict:'confirmed',source:'Participant disclosure',note:'Synthetic reviewed evidence',observed_at:now.toISOString()},{userId:'owner',identity:leadIdentity(lead),now});
const base=()=>[review('residence',{country:'US',scope:'residence'}),review('contact',{channel:'email',address:lead.email,identity_confirmed:true}),review('retirement',transfer)];
const assess=rows=>assessLead(lead,rows,{now,target:'rollover_100k'});

test('movable target needs its own authorized amount, not net worth or demographics',()=>{
  const legacy=review('net_worth',{lower_bound_usd:1000000,excludes_home:true,net_of_liabilities:true,evidence_basis:'participant_disclosure',consent_confirmed:true});
  const missing=assess([...base(),legacy]);
  assert.notEqual(missing.status,'verified');assert.deepEqual(missing.gaps,['movable_assets']);
  assert.equal(assess([...base(),review('movable_assets',{...amount,lower_bound_usd:99999})]).gates.movable_assets.state,'unknown');
  const complete=assess([...base(),review('movable_assets',amount)]);
  assert.equal(complete.status,'verified');assert.equal(complete.score,100);
  const scores=leadScores(lead,complete,{now});
  assert.equal(scores.qualification.score,100);assert.equal(scores.opportunity.score,100);
  assert.doesNotMatch(JSON.stringify(scores.opportunity),/Net worth|45–73/);
  assert.equal(assess([...base(),review('movable_assets',amount),review('age',{min:80,max:80})]).status,'verified','age is context, not a rollover exclusion');
  assert.notEqual(assessLead(lead,[...base(),review('movable_assets',amount)],{now}).status,'verified','legacy mode is not silently converted');
});

test('movable evidence requires retained eligible assets, consent and a reviewed route',()=>{
  for(const change of [{lower_bound_usd:null},{lower_bound_usd:true},{lower_bound_usd:''},{lower_bound_usd:' '},{lower_bound_usd:-1},{amount_scope:'net_worth'},{evidence_basis:'provider_estimate'},{consent_confirmed:false},{assets_confirmed:false},{eligible_distribution:false},{individual:false},{route:'in_service',plan_permission:false}]) assert.throws(()=>review('movable_assets',{...amount,...change}));
  const valid=review('movable_assets',amount);
  for(const change of [{observed_at:'2025-01-01'},{observed_at:'2027-01-01'},{identity_signature:'another person'}]) assert.notEqual(assess([...base(),{...valid,...change}]).status,'verified');
  assert.notEqual(assess([...base(),review('movable_assets',{...amount,account_type:'403b'})]).status,'verified','different account reviews need reconciliation');
  assert.equal(assessLead({...lead,suppressed:true},[...base(),valid],{now,target:'rollover_100k'}).status,'excluded');
});

test('movable-assets migration preserves legacy observations',async()=>{
  const db=new PGlite();
  try {
    await db.exec("CREATE TABLE lab_observations(field text CONSTRAINT lab_observations_field_check CHECK(field IN ('net_worth')),payload jsonb); INSERT INTO lab_observations VALUES('net_worth','{\"lower_bound_usd\":250000}')");
    await db.exec(readFileSync(new URL('../migrations/026-movable-assets.sql',import.meta.url),'utf8'));
    await db.exec("INSERT INTO lab_observations VALUES('movable_assets','{\"lower_bound_usd\":100000}')");
    const rows=(await db.query('SELECT field,payload FROM lab_observations ORDER BY field')).rows;
    assert.deepEqual(rows.map(r=>r.field),['movable_assets','net_worth']);
    assert.equal(rows[1].payload.lower_bound_usd,250000);
  } finally {await db.close();}
});
