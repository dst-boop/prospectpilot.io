import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateContactBenchmark} from '../contact-benchmark.mjs';
const now=Date.parse('2026-09-09T13:00:00.000Z');
const review={identity:'match',route:'usable',in_segment:true,suppressed:false,evidence_ref:'review-fixture',reviewed_at:'2026-09-09T12:00:00.000Z'};
const costs={provider:1000000,subscription:0,labor:0,infrastructure:0,export:0};
test('predeclared segments preserve missing outcomes and paired coverage without inventing segment costs',()=>{
 const input=fixture();input.candidate_segments={a:'segment_one',b:'segment_one',c:'segment_two'};
 const result=evaluateContactBenchmark(input,{now}),[one,two]=result.segment_coverage;
 assert.equal(one.requested,2);assert.deepEqual(one.runs.map(r=>r.usable_coverage),[0.5,0.5]);
 assert.equal(two.requested,1);assert.deepEqual(two.runs.map(r=>r.usable_coverage),[0,1]);
 assert.deepEqual(two.paired_coverage,{both_usable:0,first_only:0,second_only:1,neither_usable:0});
 assert.equal(one.runs[0].total_cost_micros,undefined);assert.equal(result.superiority_established,false);
 for(const segments of [{a:'one'},{a:'one',b:'one',outsider:'two'},{a:'one',b:'one',c:''},null]){input.candidate_segments=segments;assert.throws(()=>evaluateContactBenchmark(input,{now}),/Segment assignments/);}
});
test('benchmark intervals retain uncertainty at zero and full coverage and omit unreviewed identity rates',()=>{
 for(const [successes,lower,upper] of [[0,0,0.2775327998628892],[5,0.236593090512564,0.763406909487436],[10,0.7224672001371107,1]]){
  const input=fixture();input.candidate_ids=Array.from({length:10},(_,i)=>'id_'+i);
  for(const run of input.runs)run.outcomes=input.candidate_ids.map((candidate_id,i)=>({candidate_id,returned:i<successes,...i<successes?{review:{...review}}:{}}));
  const result=evaluateContactBenchmark(input,{now}),interval=result.runs[0].usable_coverage_interval;
  assert.equal(interval.method,'wilson_score');assert.equal(interval.confidence_level,0.95);assert.ok(Math.abs(interval.lower-lower)<1e-12);assert.ok(Math.abs(interval.upper-upper)<1e-12);
  if(successes===0)assert.equal(result.runs[0].identity_error_rate_interval,null);
  else assert.ok(result.runs[0].identity_error_rate_interval.upper>0);
  assert.equal(result.superiority_established,false);
 }
});
const fixture=()=>({schema_version:1,cohort_id:'fictional',candidate_ids:['a','b','c'],runs:[{label:'first',outcomes:[{candidate_id:'a',returned:true,review:{...review}},{candidate_id:'b',returned:true},{candidate_id:'c',returned:false}],costs_micros:{...costs},user_seconds:60},{label:'second',outcomes:[{candidate_id:'a',returned:false},{candidate_id:'b',returned:true,review:{...review}},{candidate_id:'c',returned:true,review:{...review}}],costs_micros:{...costs,provider:4000000},user_seconds:120}]});

test('paired benchmark uses every requested candidate and actual all-in costs without declaring a winner',()=>{
 const result=evaluateContactBenchmark(fixture(),{now});
 assert.equal(result.runs[0].usable_contacts,1);assert.equal(result.runs[0].unknown_reviews,1);assert.equal(result.runs[0].usable_coverage,1/3);
 assert.equal(result.runs[1].cost_per_usable_contact_micros,2000000);
 assert.deepEqual(result.paired_coverage,{both_usable:0,first_only:1,second_only:2,neither_usable:0});
 assert.equal(result.observed_comparison.first_cost_reduction_fraction,0.5);assert.equal(result.superiority_established,false);
 assert.ok(!JSON.stringify(result).includes('review-fixture'));
});
test('missing costs and zero usable contacts stay undefined instead of looking free',()=>{
 const input=fixture();delete input.runs[0].costs_micros.labor;input.runs[1].outcomes.forEach(row=>{row.returned=false;delete row.review;});
 const result=evaluateContactBenchmark(input,{now});assert.equal(result.runs[0].total_cost_micros,null);assert.deepEqual(result.runs[0].missing_cost_categories,['labor']);
 assert.equal(result.runs[1].cost_per_usable_contact_micros,null);assert.equal(result.observed_comparison.first_cost_reduction_fraction,null);
});
test('suppression, mismatched identity and unknown evidence cannot become usable contacts',()=>{
 for(const change of [{suppressed:true},{suppressed:null},{identity:'mismatch'},{identity:'unknown'},{in_segment:false},{in_segment:null},{route:'unknown'},{route:'unusable'}]){
  const input=fixture();Object.assign(input.runs[0].outcomes[0].review,change);assert.equal(evaluateContactBenchmark(input,{now}).runs[0].usable_contacts,0);
 }
});
test('benchmark rejects incomparable cohorts, invented future evidence and malformed costs',()=>{
 for(const mutate of [x=>x.candidate_ids.push('a'),x=>x.runs[0].outcomes.pop(),x=>x.runs[0].outcomes[0].candidate_id='b',x=>x.runs[0].outcomes[0].review.reviewed_at='2999-01-01T00:00:00.000Z',x=>x.runs[0].outcomes[0].review.evidence_ref='',x=>x.runs[0].costs_micros.provider=-1,x=>x.runs[0].costs_micros.subscription='0',x=>x.runs[0].costs_micros.labour=0]){
  const input=fixture();mutate(input);assert.throws(()=>evaluateContactBenchmark(input,{now}));
 }
});
