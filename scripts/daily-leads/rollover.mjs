import {FINANCIAL_EVIDENCE_DAYS} from '../../lead-quality.mjs';
// Evidence-backed targeting. A search signal is never a financial disclosure.
export const ROLLOVER_TARGET = Object.freeze({minimum_movable_usd:100000, alumni_from:1977, alumni_to:1990,
  account_types:['401k','403b','governmental_457b','traditional_ira','rollover_ira','roth_ira','sep_ira','simple_ira']});
const DAY=86400000;
const dated=(date,today,days=365)=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=Date.parse(today)&&Date.parse(today)-Date.parse(date)<=days*DAY;
const evidence=(e,id,today)=>e&&e.person_id===id&&e.source_ref&&dated(e.observed_at,today)&&e.conflict!==true;

export function assessRollover(person,{today,target=ROLLOVER_TARGET}={}){
 const id=String(person.person_id||''),signals=[],questions=[];
 if(!id||person.suppressed||person.identity_conflict)return {status:'excluded',score:0,signals:[],questions:['Resolve identity and contact restrictions before sourcing.']};
 const raw=Array.isArray(person.rollover_evidence)?person.rollover_evidence:[];
 const rows=raw.filter(e=>evidence(e,id,today));
 const add=(kind,points,label,e)=>signals.push({kind,points,label,source_ref:e.source_ref,observed_at:e.observed_at});
 for(const kind of ['job_change','former_employer','layoff','acquisition']){
  const e=rows.find(e=>e.kind===kind);
  if(e)add(kind,{job_change:35,former_employer:30,layoff:20,acquisition:15}[kind],{
   job_change:'Reported job change: ask about the previous employer plan.',former_employer:'Former employer reported: ask whether an account remains.',
   layoff:'Layoff context: confirm whether this person was affected.',acquisition:'Acquisition context: confirm whether this person’s plan changed.'}[kind],e);
 }
 const age=rows.find(e=>e.kind==='age'&&Number.isFinite(e.minimum_years)&&e.minimum_years>=59.5);
 if(age)add('in_service',15,'Age range supports reviewing in-service options; plan permission is still required.',age);
 const alumni=rows.find(e=>e.kind==='graduation'&&Number.isInteger(e.year)&&e.year>=target.alumni_from&&e.year<=target.alumni_to&&typeof e.school==='string'&&e.school.trim());
 if(alumni)add('alumni',5,`Preferred alumni audience: graduation reported in ${alumni.year}.`,alumni);
 const accounts=rows.filter(e=>e.kind==='account'&&target.account_types.includes(e.account_type));
 if(accounts.length)add('account',20,'Retirement account reported; confirm retained assets, amount and transfer route.',accounts[0]);
 // Only an authorized, current disclosure/document can establish movable money.
 // The lower bound covers the disclosed eligible assets as a whole; never sum
 // potentially duplicated accounts, plan averages, or provider wealth estimates.
 const financial=rows.filter(e=>e.kind==='movable_assets'&&dated(e.observed_at,today,FINANCIAL_EVIDENCE_DAYS)&&e.authorized===true&&['participant_disclosure','authorized_document'].includes(e.source_type));
 const valid=financial.filter(e=>Number.isFinite(e.lower_bound_usd)&&e.lower_bound_usd>=0&&e.eligibility_confirmed===true&&
   target.account_types.includes(e.account_type)&&e.assets_retained===true&&
   (e.route!=='in_service'||e.plan_permission===true)&&
   (e.account_type!=='simple_ira'||e.two_year_rule_reviewed===true)&&
   ['direct_rollover','trustee_transfer','in_service'].includes(e.route));
 // Equal amounts do not reconcile different accounts or transfer eligibility.
 // Include authorized negative/incomplete evidence so a positive row cannot
 // silently hide a retained-assets or eligibility contradiction.
 const disclosures=new Set(financial.map(e=>JSON.stringify([
   e.lower_bound_usd,e.account_type,e.route,e.destination_type??null,
   e.assets_retained,e.eligibility_confirmed,e.plan_permission??null,
   e.two_year_rule_reviewed??null
 ])));
 const conflict=raw.some(e=>e?.person_id===id&&e.kind==='movable_assets'&&e.conflict===true&&e.source_ref&&dated(e.observed_at,today,FINANCIAL_EVIDENCE_DAYS))||disclosures.size>1;
 const confirmed=!conflict&&valid.length>0&&valid[0].lower_bound_usd>=target.minimum_movable_usd;
 if(confirmed)add('confirmed_assets',60,'Authorized evidence reports at least $100,000 eligible to move.',valid[0]);
 if(!confirmed)questions.push('Confirm whether at least $100,000 remains available to move; do not infer a balance from job history.');
 if(conflict)questions.push('Resolve conflicting financial evidence.');
 if(!valid.length)questions.push('Confirm account type, ownership and eligible transfer route.');
 if(age)questions.push('Check the current plan’s in-service distribution rules.');
 if(accounts.some(e=>e.account_type==='simple_ira'))questions.push('Review SIMPLE IRA participation dates and transfer restrictions.');
 return {status:confirmed?'confirmed_target':signals.length?'research_candidate':'insufficient_evidence',
   score:Math.min(100,signals.reduce((n,s)=>n+s.points,0)),alumni_preference:!!alumni,
   financial_status:confirmed?'confirmed_100k_plus':conflict?'conflict':'unconfirmed',signals,questions};
}

// Search instructions are explicit about source and scope; no credential access,
// purchases, outreach, or unsupported provider filters happen in this module.
export function sourcingPlan({employers=[],schools=[],today,target=ROLLOVER_TARGET}={}){
 const clean=values=>[...new Set(values.filter(v=>typeof v==='string').map(v=>v.replace(/["\r\n]/g,' ').trim()).filter(Boolean))].slice(0,20);
 const tasks=[];
 for(const employer of clean(employers)){
  for(const [lane,query] of [['job_change',`"${employer}" (departed OR retired OR "joins" OR "former")`],['layoff',`"${employer}" (WARN OR layoffs)`],['acquisition',`"${employer}" (acquisition OR merger) retirement plan`]])
   tasks.push({lane,scope:'company_first',employer,query,sources:['official_company','WARN','SEC'],person_match:'Provider ID or independently corroborated identity; never name alone',financial_status:'unknown'});
 }
 for(const school of clean(schools))tasks.push({lane:'alumni',scope:'public_alumni',school,query:`"${school}" alumni biography graduation`,graduation_year_min:target.alumni_from,graduation_year_max:target.alumni_to,sources:['official_university','authorized_alumni_export'],infer_age:false,financial_status:'unknown'});
 tasks.push({lane:'ira_transfer',scope:'authorized_existing_contacts',account_types:['traditional_ira','rollover_ira','roth_ira','sep_ira','simple_ira'],source:'participant_disclosure_or_authorized_document',minimum_movable_usd:target.minimum_movable_usd});
 tasks.push({lane:'in_service',scope:'authorized_existing_contacts',minimum_documented_age:59.5,requires_plan_permission:true});
 return {date:today,target,tasks,unconfigured:schools.length?[]:['No institutions supplied; alumni preference can still rank documented graduation years.'],
   execution:'Plan only. Use existing authorized source adapters and spending limits; unavailable sources are skipped.'};
}
