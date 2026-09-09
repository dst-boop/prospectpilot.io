import {emailAddress,phoneNumber,linkedinURL,nameKey} from './lead-quality.mjs';
import {normalizeContact,stateName} from './prospect-data-quality.mjs';
import {createDomainChecker,isNonPublicMailDomain} from './prospect-domain-check.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const fields='id,first_name,last_name,job_title,job_company_name,job_company_website,job_company_industry,job_title_levels,location_country,location_region,location_locality,linkedin_url,work_email,phone_numbers';
const normalizeProfile=value=>linkedinURL(value&&!/^https?:/.test(value)?'https://'+value:value);
const clean=v=>typeof v==='string'?v:'';
const scrollToken=v=>{if(v==null||v==='')return '';if(typeof v!=='string'||v.length>5000)throw fail(422,'Invalid provider pagination token.');return v;};
export function professionalRecord(raw){
 if(!raw||typeof raw!=='object'||!raw.first_name||!raw.last_name)throw fail(502,'Provider returned an incomplete identity.');
 const contact=normalizeContact({first_name:clean(raw.first_name),last_name:clean(raw.last_name),title:clean(raw.job_title),company:clean(raw.job_company_name),company_domain:clean(raw.job_company_website),industry:clean(raw.job_company_industry),seniority:Array.isArray(raw.job_title_levels)?raw.job_title_levels.map(clean).join(', '):'',country:clean(raw.location_country),state:clean(raw.location_region),city:clean(raw.location_locality),linkedin_url:clean(raw.linkedin_url),email:clean(raw.work_email),phone:(Array.isArray(raw.phone_numbers)?raw.phone_numbers:[]).filter(v=>typeof v==='string'&&!/[^0-9()+.\s-]/.test(v)).map(phoneNumber).find(Boolean)||''},'People Data Labs');
 return {...contact,provider_id:clean(raw.id).slice(0,250),source_kind:'provider'};
}
// Retain only professional fields. Financial, household, birth and demographic
// fields are neither requested nor persisted, even if a provider sends extras.
export function createProspectProviders({pdlKey='',hunterKey='',fetcher=fetch,now=()=>new Date(),domainChecker=createDomainChecker()}={}){
 async function request(url,options={}){
  let response;try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw fail(502,'Provider request could not be completed; billing outcome may be unknown.');}
  if(response.status===202){await response.body?.cancel();return {pending:true};}
  if(response.status===404){await response.body?.cancel();return {not_found:true};}
  if(response.status===451){await response.body?.cancel();return {suppressed:true};}
  if(!response.ok){await response.body?.cancel();throw fail(response.status===429?429:502,`Provider returned HTTP ${response.status}.`);}
  const declared=Number(response.headers.get('content-length')||0);if(declared>2000000){await response.body?.cancel();throw fail(502,'Provider response exceeded the size limit.');}
  const reader=response.body?.getReader();if(!reader)throw fail(502,'Provider returned no response.');let bytes=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000)throw fail(502,'Provider response exceeded the size limit.');chunks.push(value);}}catch(e){await reader.cancel();throw e;}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(502,'Provider returned invalid JSON.');}
 }
 async function search(input={}){
  if(!pdlKey)throw fail(503,'Contact search is not configured.');
  const size=Number(input.size??10);if(!Number.isInteger(size)||size<1||size>100)throw fail(422,'Choose 1–100 provider results.');
  const must=[],must_not=[];
  const mapping={title:'job_title',company:'job_company_name',country:'location_country',state:'location_region',city:'location_locality',industry:'job_company_industry',seniority:'job_title_levels'};
  for(const [key,field] of Object.entries(mapping)){let value=clean(input[key]).trim().toLowerCase();if(!value)continue;if(key==='country'&&['us','usa'].includes(value))value='united states';if(key==='state'&&(!input.country||['us','usa','united states'].includes(input.country.toLowerCase())))value=stateName(value).toLowerCase();must.push({match:{[field]:{query:value,operator:'and'}}});}
  if(!must.length)throw fail(422,'Set at least one professional search filter.');
  if(input.has_email==='true')must.push({exists:{field:'work_email'}});
  if(input.has_phone==='true')must.push({exists:{field:'phone_numbers'}});
  if(input.has_email==='false')must_not.push({exists:{field:'work_email'}});
  if(input.has_phone==='false')must_not.push({exists:{field:'phone_numbers'}});
  const body={size,query:{bool:{must,...(must_not.length?{must_not}:{})}},data_include:fields,...(input.scroll_token?{scroll_token:scrollToken(input.scroll_token)}:{})};
  const response=await request('https://api.peopledatalabs.com/v5/person/search',{method:'POST',headers:{'Content-Type':'application/json','X-Api-Key':pdlKey},body:JSON.stringify(body)});
  if(!Array.isArray(response.data)||!Number.isSafeInteger(response.total)||response.total<0||response.data.length>size||response.total<response.data.length)throw fail(502,'Provider returned an invalid search response.');
  const contacts=[],errors=[];for(const row of response.data){try{contacts.push(professionalRecord(row));}catch{errors.push('An incomplete provider identity was omitted.');}}
  return {contacts,total:response.total,scroll_token:scrollToken(response.scroll_token),retrieved:response.data.length,rejected:errors.length,errors,provider:'pdl',checked_at:now().toISOString()};
 }
 async function enrich(contact){
  if(!pdlKey)throw fail(503,'Contact enrichment is not configured.');
  if(contact.suppressed)throw fail(422,'Suppressed contacts cannot be enriched.');
  const profile=normalizeProfile(contact.linkedin_url),email=emailAddress(contact.email);
  if(!profile&&!email)throw fail(422,'A LinkedIn profile or known email is required for identity matching.');
  if(!profile&&isNonPublicMailDomain(email.split('@')[1]))throw fail(422,'A non-public email domain cannot be used for paid enrichment.');
  const url=new URL('https://api.peopledatalabs.com/v5/person/enrich');
  for(const [key,value] of Object.entries({...profile?{profile}:{email},min_likelihood:8,data_include:fields}))url.searchParams.set(key,String(value));
  const response=await request(url,{headers:{'X-Api-Key':pdlKey}});
  if(response.not_found||response.suppressed)return response;
  if(!response.data||!Number.isInteger(response.likelihood)||response.likelihood<8||response.likelihood>10)throw fail(502,'Provider identity confidence is insufficient.');
  const candidate=professionalRecord(response.data);
  const sameName=nameKey(candidate.first_name)===nameKey(contact.first_name)&&nameKey(candidate.last_name)===nameKey(contact.last_name);
  const matched=profile?candidate.linkedin_url===profile:candidate.email===email;
  if(!sameName||!matched)return {conflict:true,message:'Provider identity does not match the supplied contact.'};
  return {contact:candidate,provider:'pdl',match_likelihood:response.likelihood,checked_at:now().toISOString()};
 }
 async function verifyEmail(contact){
  if(!hunterKey)throw fail(503,'Email verification is not configured.');
  if(contact.suppressed)throw fail(422,'Suppressed contacts cannot be verified.');
  const email=emailAddress(contact.email);if(!email)throw fail(422,'A valid email is required.');
  if(isNonPublicMailDomain(email.split('@')[1]))throw fail(422,'A non-public email domain cannot be sent for paid verification.');
  const url=new URL('https://api.hunter.io/v2/email-verifier');url.searchParams.set('email',email);url.searchParams.set('api_key',hunterKey);
  const response=await request(url);if(response.pending||response.suppressed)return response;
  const data=response.data;if(!data||emailAddress(data.email)!==email)throw fail(502,'Verifier response does not match this email.');
  if(data.status==='pending')return {pending:true};
  const status=data.disposable===true?'invalid':data.accept_all===true?'catch_all':({valid:'valid',invalid:'invalid',accept_all:'catch_all',unknown:'unknown',webmail:'unknown',disposable:'invalid'})[data.status];
  if(!status)throw fail(502,'Verifier returned an unsupported status.');
  return {email,status,provider_status:data.status,provider:'hunter',checked_at:now().toISOString()};
 }
 return {readiness:{search:!!pdlKey,enrichment:!!pdlKey,email_verification:!!hunterKey,domain_check:true},search,enrich,verifyEmail,checkDomain:domainChecker};
}
