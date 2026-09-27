import {createHash, randomUUID} from 'node:crypto';

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(Number(n)||0)));
const text=v=>String(v??'').trim();
const lower=v=>text(v).toLowerCase();
const year=v=>{const n=Number(v);return Number.isInteger(n)&&n>=1900&&n<=2200?n:null;};
const arr=v=>Array.isArray(v)?v:[];

export const SOURCE_RELIABILITY=Object.freeze({
  licensed_verified:1.00,
  government_record:0.98,
  sec_filing:0.98,
  dol_form_5500:0.98,
  employer_site:0.94,
  university:0.93,
  professional_registry:0.92,
  association:0.88,
  press_release:0.87,
  news:0.80,
  search_result:0.65,
  user_import:0.60,
  inferred:0.50,
  unknown:0.40
});

export const IMPORTANT_FIELDS=new Set([
  'age','date_of_birth','graduation_year','career_start_year','current_title','company',
  'previous_employer','employment_start_year','employment_end_year','plan_name','plan_type',
  'plan_assets','job_change','retirement_announcement','business_phone','mobile','business_email',
  'personal_email','linkedin_url','city','state','zip'
]);

function stableValue(value){
  if(value===null||value===undefined)return '';
  if(typeof value==='object')return JSON.stringify(value,Object.keys(value).sort());
  return String(value).trim();
}

function evidenceId(input){
  return createHash('sha256').update([
    lower(input.field),stableValue(input.value),lower(input.source_type),text(input.source_url)
  ].join('|')).digest('hex').slice(0,24);
}

export function normalizeEvidence(input={}, {now=new Date()}={}) {
  const field=lower(input.field).replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
  if(!field)throw new Error('Evidence field is required.');
  const source_type=lower(input.source_type||'unknown').replace(/[^a-z0-9_]+/g,'_');
  const sourceReliability=SOURCE_RELIABILITY[source_type]??SOURCE_RELIABILITY.unknown;
  const asserted=input.confidence===undefined?sourceReliability:Number(input.confidence);
  if(!Number.isFinite(asserted)||asserted<0||asserted>1)throw new Error('Evidence confidence must be between 0 and 1.');
  const observedAt=new Date(input.observed_at||input.retrieved_at||now);
  if(Number.isNaN(observedAt.getTime()))throw new Error('Evidence observed_at must be a valid date.');
  const source_url=text(input.source_url);
  if(source_url && !/^https?:\/\//i.test(source_url))throw new Error('Evidence source_url must be http(s).');
  const confidence=Math.min(asserted,sourceReliability);
  const normalized={
    id:text(input.id)||evidenceId({field,value:input.value,source_type,source_url}),
    field,
    value:input.value,
    source_type,
    source_url,
    observed_at:observedAt.toISOString(),
    confidence:Number(confidence.toFixed(4)),
    status:['verified','reported','inferred','conflicting'].includes(input.status)?input.status:(source_type==='inferred'?'inferred':'reported'),
    note:text(input.note).slice(0,1000)
  };
  return normalized;
}

export function createLead(input={}, {now=new Date(), id=randomUUID()}={}) {
  const lead={
    id:text(input.id)||id,
    first_name:text(input.first_name),middle_name:text(input.middle_name),last_name:text(input.last_name),suffix:text(input.suffix),
    current_title:text(input.current_title),company:text(input.company),city:text(input.city),state:text(input.state).toUpperCase(),zip:text(input.zip),
    linkedin_url:text(input.linkedin_url),
    previous_employers:arr(input.previous_employers),previous_titles:arr(input.previous_titles),employment_history:arr(input.employment_history),
    education:arr(input.education),
    exact_age:Number.isFinite(Number(input.exact_age))?Number(input.exact_age):null,
    estimated_age_min:Number.isFinite(Number(input.estimated_age_min))?Number(input.estimated_age_min):null,
    estimated_age_max:Number.isFinite(Number(input.estimated_age_max))?Number(input.estimated_age_max):null,
    age_confidence:Number.isFinite(Number(input.age_confidence))?Number(input.age_confidence):0,
    retirement_plans:arr(input.retirement_plans),signals:arr(input.signals),
    mobile:text(input.mobile),business_phone:text(input.business_phone),personal_email:text(input.personal_email),business_email:text(input.business_email),
    contact_restrictions:arr(input.contact_restrictions),
    evidence:arr(input.evidence).map(e=>normalizeEvidence(e,{now})),
    discovered_at:input.discovered_at?new Date(input.discovered_at).toISOString():now.toISOString(),
    verified_at:input.verified_at?new Date(input.verified_at).toISOString():null,
    owner_user_id:text(input.owner_user_id),owner_email:text(input.owner_email),campaign_id:text(input.campaign_id),
    source_cost_micros:Number.isSafeInteger(Number(input.source_cost_micros))?Number(input.source_cost_micros):0,
    workflow_status:text(input.workflow_status)||'discovered'
  };
  if(!lead.first_name||!lead.last_name)throw new Error('Lead first_name and last_name are required.');
  return lead;
}

const valueKey=v=>lower(typeof v==='object'?JSON.stringify(v):v).replace(/\s+/g,' ');

export function evidenceSummary(evidence=[]) {
  const normalized=evidence.map(e=>normalizeEvidence(e));
  const fields={};
  for(const item of normalized){
    fields[item.field]??=[];
    if(!fields[item.field].some(existing=>existing.id===item.id))fields[item.field].push(item);
  }
  const resolved={};
  for(const [field,items] of Object.entries(fields)){
    const groups=new Map();
    for(const item of items){const key=valueKey(item.value);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
    const ranked=[...groups.entries()].map(([key,group])=>({
      key,value:group[0].value,
      confidence:1-group.reduce((remaining,item)=>remaining*(1-item.confidence),1),
      newest:Math.max(...group.map(item=>Date.parse(item.observed_at))),
      sources:group
    })).sort((a,b)=>b.confidence-a.confidence||b.newest-a.newest);
    const best=ranked[0];
    const conflict=ranked.length>1 && ranked[1].confidence>=Math.max(0.55,best.confidence-0.18);
    resolved[field]={
      value:best?.value,
      confidence:Number((best?.confidence||0).toFixed(4)),
      status:conflict?'conflicting':((best?.confidence||0)>=0.9?'verified':'reported'),
      alternatives:ranked.slice(1).map(x=>({value:x.value,confidence:Number(x.confidence.toFixed(4))})),
      sources:best?.sources||[]
    };
  }
  return {fields,resolved};
}

export function addEvidence(lead,input,{now=new Date()}={}){
  const item=normalizeEvidence(input,{now});
  const evidence=arr(lead.evidence).filter(e=>e.id!==item.id);
  evidence.push(item);
  return {...lead,evidence};
}

export function estimateAge(lead,{asOf=new Date()}={}){
  const currentYear=asOf.getUTCFullYear();
  const {resolved}=evidenceSummary(lead.evidence||[]);
  const exact=Number(resolved.age?.value??lead.exact_age);
  if(Number.isFinite(exact)&&exact>=18&&exact<=110){
    return {min:Math.floor(exact),max:Math.floor(exact),confidence:resolved.age?.confidence||0.98,basis:['verified age']};
  }
  const ranges=[];
  const basis=[];
  const grad=year(resolved.graduation_year?.value ?? lead.graduation_year);
  if(grad){ranges.push({min:currentYear-grad+20,max:currentYear-grad+25,confidence:resolved.graduation_year?.confidence||0.65});basis.push(`graduation year ${grad}`);}
  const career=year(resolved.career_start_year?.value ?? lead.career_start_year);
  if(career){ranges.push({min:currentYear-career+18,max:currentYear-career+27,confidence:resolved.career_start_year?.confidence||0.6});basis.push(`career start ${career}`);}
  for(const job of arr(lead.employment_history)){
    const start=year(job.start_year);
    if(start){ranges.push({min:currentYear-start+18,max:currentYear-start+30,confidence:0.55});basis.push(`employment start ${start}`);break;}
  }
  if(!ranges.length)return {min:null,max:null,confidence:0,basis:[]};
  const intersection={min:Math.max(...ranges.map(r=>r.min)),max:Math.min(...ranges.map(r=>r.max))};
  const min=intersection.min<=intersection.max?intersection.min:Math.min(...ranges.map(r=>r.min));
  const max=intersection.min<=intersection.max?intersection.max:Math.max(...ranges.map(r=>r.max));
  const confidence=Math.min(0.95,ranges.reduce((acc,r)=>acc+r.confidence,0)/ranges.length + (ranges.length>1?0.12:0));
  return {min:Math.max(18,min),max:Math.min(110,max),confidence:Number(confidence.toFixed(2)),basis:[...new Set(basis)]};
}

const seniorRx=/\b(chief|c[a-z]o|president|owner|founder|partner|principal|vice president|vp|director|managing director|head)\b/i;
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(v));
const validPhone=v=>text(v).replace(/\D/g,'').length>=10;

function yearsAtPreviousEmployer(lead){
  let best=0;
  for(const job of arr(lead.employment_history)){
    if(job.current===true)continue;
    const start=year(job.start_year),end=year(job.end_year);
    if(start&&end&&end>=start)best=Math.max(best,end-start);
  }
  return best;
}

export function scoreProspect(lead,{asOf=new Date()}={}){
  const age=estimateAge(lead,{asOf});
  const age55=age.min!==null ? (age.min>=55?1:age.max>=55?0.65:0) : 0;
  const titleScore=seniorRx.test(lead.current_title)?1:0.25;
  const priorTenure=yearsAtPreviousEmployer(lead);
  const formerEmployer=arr(lead.previous_employers).length>0 || arr(lead.employment_history).some(j=>j.current!==true);
  const planEvidence=arr(lead.retirement_plans).some(p=>p.plan_name||p.plan_type||Number(p.plan_assets)>0) || arr(lead.evidence).some(e=>['plan_name','plan_type','plan_assets'].includes(e.field));
  const moneyMotion=arr(lead.signals).some(s=>/job change|retir|layoff|warn|departure|acquisition|closure/i.test(typeof s==='string'?s:JSON.stringify(s)));
  const rollover=clamp(35*age55+25*(formerEmployer?1:0)+20*(planEvidence?1:0)+10*(priorTenure>=10?1:priorTenure/10)+10*(moneyMotion?1:0));
  const qualification=clamp(35*age55+25*titleScore+20*(priorTenure>=10?1:Math.min(1,priorTenure/10))+20*(planEvidence?1:0));
  const {resolved}=evidenceSummary(lead.evidence||[]);
  const important=Object.entries(resolved).filter(([field])=>IMPORTANT_FIELDS.has(field));
  const confidence=clamp(important.length?100*important.reduce((s,[,v])=>s+v.confidence,0)/important.length:20);
  const usableContacts=[validPhone(lead.mobile),validPhone(lead.business_phone),validEmail(lead.personal_email),validEmail(lead.business_email),/^https?:\/\/(www\.)?linkedin\.com\//i.test(lead.linkedin_url)].filter(Boolean).length;
  const restricted=arr(lead.contact_restrictions).some(x=>/do not|dnc|opt.?out|suppression|restricted/i.test(String(x)));
  const contactability=restricted?0:clamp(usableContacts*20 + (validPhone(lead.mobile)?15:0) + (validEmail(lead.business_email)?10:0));
  const priority=clamp(qualification*0.35+rollover*0.30+confidence*0.20+contactability*0.15);
  return {
    qualification,rollover_opportunity:rollover,data_confidence:confidence,contactability,priority,
    age_estimate:age,
    explanation:{age55,title_score:titleScore,previous_tenure_years:priorTenure,former_employer:formerEmployer,plan_evidence:planEvidence,money_in_motion:moneyMotion,contact_methods:usableContacts,restricted}
  };
}

export function qualificationState(scores){
  if(scores.contactability===0&&scores.explanation.restricted)return 'restricted';
  if(scores.qualification>=70&&scores.rollover_opportunity>=65&&scores.data_confidence>=55)return scores.contactability>=40?'contact_ready':'needs_enrichment';
  if(scores.qualification>=55)return 'qualified';
  if(scores.qualification>=35)return 'researching';
  return 'discovered';
}
