// Offline, reviewer-supplied outcomes. No provider calls or personal data needed.
const categories=['provider','subscription','labor','infrastructure','export'];
const requireThat=(condition,message)=>{if(!condition)throw Error(message);};
const opaque=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const amount=value=>Number.isSafeInteger(value)&&value>=0;
const rate=(n,d)=>d?n/d:null;
// Two-sided Wilson score interval; see the NIST reference in WIZA-BENCHMARK.md.
function proportionInterval(successes,total){
 if(!total)return null;
 const z=1.959963984540054,z2=z*z,p=successes/total,denominator=1+z2/total;
 const center=(p+z2/(2*total))/denominator,margin=z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/denominator;
 return {method:'wilson_score',confidence_level:0.95,lower:successes===0?0:Math.max(0,center-margin),upper:successes===total?1:Math.min(1,center+margin)};
}

export function evaluateContactBenchmark(input,{now=Date.now()}={}){
 requireThat(input?.schema_version===1,'Use benchmark schema_version 1.');
 requireThat(opaque(input.cohort_id),'Use an opaque cohort_id, not personal information.');
 const cohort=input.candidate_ids;
 requireThat(Array.isArray(cohort)&&cohort.length>0&&cohort.length<=100000&&cohort.every(opaque),'Provide 1–100,000 opaque candidate IDs.');
 requireThat(new Set(cohort).size===cohort.length,'Candidate IDs must be unique canonical people.');
 requireThat(Array.isArray(input.runs)&&input.runs.length===2,'Provide exactly two comparable runs.');
 const ids=new Set(cohort),seenLabels=new Set();
 const runs=input.runs.map(run=>{
  requireThat(opaque(run?.label)&&!seenLabels.has(run.label),'Run labels must be distinct opaque identifiers.');seenLabels.add(run.label);
  requireThat(Array.isArray(run.outcomes)&&run.outcomes.length===cohort.length,'Every run must include one outcome for every requested candidate.');
  const seen=new Set(),usable=new Set();let returned=0,reviewed=0,identityErrors=0,unknown=0,suppressed=0;
  for(const row of run.outcomes){
   requireThat(ids.has(row?.candidate_id)&&!seen.has(row.candidate_id),'Outcome IDs must match the cohort exactly, without duplicates.');seen.add(row.candidate_id);
   requireThat(typeof row.returned==='boolean','Every outcome needs an explicit returned boolean.');
   if(!row.returned){requireThat(!row.review,'A missing result cannot carry a contact review.');continue;}
   returned++;
   const review=row.review;
   if(!review){unknown++;continue;}
   requireThat(typeof review.evidence_ref==='string'&&review.evidence_ref.trim().length>0&&review.evidence_ref.length<=500,'A review needs an evidence reference.');
   const at=Date.parse(review.reviewed_at);
   requireThat(Number.isFinite(at)&&at<=now&&new Date(at).toISOString()===review.reviewed_at,'Review timestamps must be canonical UTC timestamps, no later than now.');
   requireThat(['match','mismatch','unknown'].includes(review.identity),'Review identity must be match, mismatch or unknown.');
   requireThat(['usable','unusable','unknown'].includes(review.route),'Review route must be usable, unusable or unknown.');
   requireThat([true,false,null].includes(review.in_segment)&&[true,false,null].includes(review.suppressed),'Segment and suppression reviews must be true, false or null.');
   if(review.identity!=='unknown')reviewed++;
   if(review.identity==='mismatch')identityErrors++;
   if(review.suppressed===true)suppressed++;
   if(review.identity==='unknown'||review.route==='unknown'||review.in_segment===null||review.suppressed===null)unknown++;
   if(review.identity==='match'&&review.route==='usable'&&review.in_segment===true&&review.suppressed===false)usable.add(row.candidate_id);
  }
  const costs=run.costs_micros??{};
  requireThat(typeof costs==='object'&&!Array.isArray(costs)&&Object.keys(costs).every(key=>categories.includes(key)),'Use only the documented cost categories.');
  const missing=categories.filter(key=>costs[key]==null);
  for(const key of categories)requireThat(costs[key]==null||amount(costs[key]),'Costs must be nonnegative safe integer microdollars, or null when unknown.');
  const total=missing.length?null:categories.reduce((sum,key)=>sum+costs[key],0);
  requireThat(total===null||Number.isSafeInteger(total),'Total costs exceed safe integer precision.');
  requireThat(run.user_seconds==null||amount(run.user_seconds),'User time must be nonnegative whole seconds or null.');
  return {label:run.label,requested:cohort.length,returned,missing_results:cohort.length-returned,identity_reviewed:reviewed,identity_errors:identityErrors,unknown_reviews:unknown,suppressed,usable_contacts:usable.size,usable_coverage:rate(usable.size,cohort.length),observed_identity_error_rate:rate(identityErrors,reviewed),costs_micros:Object.fromEntries(categories.map(key=>[key,costs[key]??null])),missing_cost_categories:missing,total_cost_micros:total,cost_per_usable_contact_micros:total===null?null:rate(total,usable.size),user_seconds:run.user_seconds??null,usable};
 });
 const [a,b]=runs,paired={both_usable:0,first_only:0,second_only:0,neither_usable:0};
 for(const id of cohort){const first=a.usable.has(id),second=b.usable.has(id);paired[first?(second?'both_usable':'first_only'):(second?'second_only':'neither_usable')]++;}
 for(const run of runs){run.usable_coverage_interval=proportionInterval(run.usable_contacts,run.requested);run.identity_error_rate_interval=proportionInterval(run.identity_errors,run.identity_reviewed);}
 const aCost=a.cost_per_usable_contact_micros,bCost=b.cost_per_usable_contact_micros;
 return {schema_version:1,cohort_id:input.cohort_id,assessment_basis:'Reviewer-supplied evidence; this evaluator does not independently verify claims.',runs:runs.map(({usable,...summary})=>summary),paired_coverage:paired,observed_comparison:{first_minus_second_coverage:a.usable_coverage-b.usable_coverage,first_cost_reduction_fraction:aCost!==null&&bCost!==null&&bCost>0?1-aCost/bCost:null,first_time_reduction_fraction:a.user_seconds!==null&&b.user_seconds>0?1-a.user_seconds/b.user_seconds:null},superiority_established:false,limitations:['Intervals are approximate binomial ranges assuming independent representative candidates; they do not correct biased selection, unknown reviews or clustering.','Per-run intervals do not test the paired difference or establish cost superiority.','Observed differences are not a statistical superiority finding.','Review source evidence, cohort representativeness, comparison timing and uncertainty before making a competitive claim.','All requested candidates remain in coverage denominators; unknown reviews never count as usable.','Missing costs remain unknown; zero usable contacts have undefined unit cost.']};
}
