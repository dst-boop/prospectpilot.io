import {randomUUID} from 'node:crypto';
import {hash,nameKey,linkedinURL} from './lead-quality.mjs';
import {normalizeContact,contactIdentities,identityLookupKeys,searchFilters} from './prospect-workspace.mjs';
import {CONTACT_ALIASES,contactEmail} from './prospect-data-quality.mjs';
import {DOMAIN_CHECK_STATUSES,DOMAIN_CHECK_LABELS,recentDomainFailure,isNonPublicMailDomain} from './prospect-domain-check.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const sig=contact=>hash(JSON.stringify(['first_name','last_name','company','email','linkedin_url'].map(k=>contact[k]||'')));
const terminal=['completed','failed','skipped','needs_attention'];
const validObservationTime=value=>{const time=Date.parse(value);return typeof value==='string'&&Number.isFinite(time)&&time<=Date.now()&&new Date(time).toISOString()===value;};
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw fail(422,'Invalid '+label+'.');return v;};
async function tx(pool,fn){const c=await pool.connect();let broken;try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){try{await c.query('ROLLBACK');}catch(b){broken=b;}throw e;}finally{c.release(broken);}}
export function providerJobConfig(env=process.env){
 const read=(key,fallback=null)=>{const value=env[key];if(value===undefined||value==='')return fallback;const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw Error('Invalid '+key);return n;};
 return {dailyBudgetMicros:read('PROSPECT_DAILY_BUDGET_MICROS',0),prices:{search:read('PDL_SEARCH_RECORD_COST_MICROS'),enrich:read('PDL_ENRICH_COST_MICROS'),verify:read('HUNTER_VERIFY_COST_MICROS')}};
}
export function createProspectJobs({pool,providers,config={dailyBudgetMicros:0,prices:{}},dispatch=async()=>false,pacingMs={pdl:6100,hunter:250,dns:100}}){
 const capabilities={search:'search',enrich:'enrichment',verify:'email_verification',check_domain:'domain_check'};
 const quote=(action,size=1)=>{if(action==='check_domain')return 0;const price=config.prices[action];if(!Number.isSafeInteger(price)||price<0)throw fail(503,'Configure a per-request or per-record price before using this provider.');return price*size;};
 const ready=action=>providers.readiness[capabilities[action]]===true&&(action==='check_domain'||Number.isSafeInteger(config.prices[action])&&config.prices[action]>=0);
 async function summary(user){const charges=(await pool.query(`SELECT COALESCE(sum(reserved_micros),0) AS reserved FROM prospect_charges WHERE user_id=$1 AND reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,[user.uid])).rows[0];return {providers:providers.readiness,prices:{...config.prices,check_domain:0},daily_budget_micros:config.dailyBudgetMicros,reserved_today_micros:Number(charges.reserved),actions:Object.fromEntries(Object.keys(capabilities).map(a=>[a,ready(a)])),cost_basis:'Reserved maximum at configured prices, not actual provider billing. The daily cap is shared by this deployment.'};}
 async function enqueue(user,input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail(422,'Provide a provider job object.');
  const action=input.action;if(!Object.hasOwn(capabilities,action))throw fail(422,'Choose search, enrich, verify or check_domain.');
  const key=String(input.idempotency_key||'');if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key))throw fail(422,'A stable request key is required.');
  let payloads=[];
  if(action==='search'){
   if(input.filters!==undefined&&(!input.filters||typeof input.filters!=='object'||Array.isArray(input.filters)))throw fail(422,'Provide a search filter object.');
   const supported=['title','company','country','state','city','industry','seniority','has_email','has_phone'];
   if(Object.entries(input.filters||{}).some(([key,value])=>value!=null&&String(value).trim()!==''&&!supported.includes(key)))throw fail(422,'Unsupported provider search filter. Use professional filters, email/phone presence, and a separate destination list.');
   const filters=searchFilters(input.filters);if(!['title','company','country','state','city','industry','seniority'].some(k=>filters[k]))throw fail(422,'Set at least one professional search filter.');
   const size=integer(Number(input.size??10),1,100,'search size');
   const scroll_token=input.scroll_token??'';if(typeof scroll_token!=='string'||scroll_token.length>5000)throw fail(422,'Invalid provider pagination token.');
   payloads=[{filters:{...filters,scroll_token,size},list_id:input.list_id||null,quote:ready(action)?quote(action,size):0}];
  }else{
   if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>500||input.ids.some(x=>typeof x!=='string'||x.length>100))throw fail(422,'Select 1–500 contacts.');
   payloads=[...new Set(input.ids)].sort().map(contact_id=>({contact_id,quote:ready(action)?quote(action):0}));
  }
  const ceiling=integer(Number(input.max_cost_micros),0,1000000000,'maximum cost'),inputHash=hash(JSON.stringify({action,payloads,ceiling}));
  const result=await tx(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect-jobs:${user.uid}`]);
   const prior=(await c.query('SELECT * FROM prospect_jobs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows[0];if(prior){if(prior.input_hash!==inputHash)throw fail(409,'This request key was already used for different inputs.');return {id:prior.id,replayed:true};}
   if(!ready(action))throw fail(503,'Provider credentials and pricing must be configured before this action.');
   if(payloads.reduce((n,p)=>n+p.quote,0)>ceiling)throw fail(422,'Maximum cost is below this batch’s quoted cost.');
   if(action==='search'&&input.list_id&&!(await c.query('SELECT id FROM prospect_lists WHERE user_id=$1 AND id=$2',[user.uid,input.list_id])).rows.length)throw fail(404,'List not found.');
   if(action!=='search'){const contacts=(await c.query('SELECT id,payload FROM prospect_contacts WHERE user_id=$1 AND id=ANY($2::text[])',[user.uid,payloads.map(p=>p.contact_id)])).rows;if(contacts.length!==payloads.length)throw fail(404,'One or more contacts are unavailable.');for(const p of payloads){const contact=contacts.find(r=>r.id===p.contact_id).payload;p.signature=sig(contact);}}
   const id=randomUUID();await c.query('INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES($1,$2,$3,$4,$5,$6)',[id,user.uid,action,key,inputHash,ceiling]);
   for(const payload of payloads){
    const active=payload.contact_id&&(await c.query("SELECT id FROM prospect_tasks WHERE user_id=$1 AND contact_id=$2 AND action=$3 AND status IN ('pending','running','waiting')",[user.uid,payload.contact_id,action])).rows.length;
    await c.query('INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,contact_id,payload,status,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb)',[randomUUID(),id,user.uid,action,action==='check_domain'?'dns':action==='verify'?'hunter':'pdl',payload.contact_id||null,JSON.stringify(payload),active?'skipped':'pending',JSON.stringify(active?{message:'A matching operation is already active for this contact.'}:{})]);
   }
   return {id,replayed:false};
  });
  let dispatched=false;try{dispatched=await dispatch();}catch{}return {...result,dispatched};
 }
 async function finish(c,task,status,result){await c.query('UPDATE prospect_tasks SET status=$1,result=$2::jsonb,lease_token=NULL,lease_until=NULL,completed_at=now() WHERE id=$3 AND lease_token=$4',[status,JSON.stringify(result),task.id,task.lease_token]);}
 async function claim(){return tx(pool,async c=>{
  // Lost processes cannot safely retry a request that may have been charged.
  await c.query("UPDATE prospect_tasks SET status='needs_attention',result=jsonb_build_object('message','Worker stopped during a provider request. Cost retained; automatic retry disabled.'),lease_token=NULL,lease_until=NULL,completed_at=now() WHERE status='running' AND lease_until<now()");
  await c.query('SELECT pg_advisory_xact_lock(505009)');
  const task=(await c.query("SELECT t.* FROM prospect_tasks t LEFT JOIN prospect_provider_pacing p ON p.provider=t.provider WHERE t.status IN ('pending','waiting') AND t.next_attempt_at<=now() AND (p.next_call_at IS NULL OR p.next_call_at<=now()) ORDER BY t.created_at,t.id LIMIT 1 FOR UPDATE OF t SKIP LOCKED")).rows[0];if(!task)return null;
  task.lease_token=randomUUID();await c.query("UPDATE prospect_tasks SET status='running',lease_token=$1,lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE id=$2",[task.lease_token,task.id]);
  let contact;if(task.contact_id){contact=(await c.query('SELECT payload FROM prospect_contacts WHERE id=$1 AND user_id=$2',[task.contact_id,task.user_id])).rows[0]?.payload;}
  const skip=!ready(task.action)?'Provider is no longer configured.':quote(task.action,task.action==='search'?task.payload.filters.size:1)>task.payload.quote?'Configured price increased; launch a new job with a current quote.':task.action!=='search'&&(!contact||contact.suppressed||sig(contact)!==task.payload.signature)?'Contact is missing, suppressed, or changed.':task.action==='verify'&&!contact.email?'This contact has no email to verify.':task.action==='enrich'&&!contact.email&&!contact.linkedin_url?'An email or LinkedIn profile is needed for identity matching.':null;
  if(skip){await finish(c,task,'skipped',{message:skip});return {skipped:true};}
  if((task.action==='verify'||task.action==='enrich'&&!linkedinURL(contact.linkedin_url))&&!contactEmail(contact.email)){
   await finish(c,task,'skipped',{message:'Invalid email address. No new paid provider request or cost reservation was made.'});return {skipped:true};
  }
  if(task.action==='check_domain'&&!contact.email){await finish(c,task,'skipped',{message:'This contact has no email domain to check.'});return {skipped:true};}
  if((task.action==='verify'||task.action==='enrich'&&!linkedinURL(contact.linkedin_url))&&isNonPublicMailDomain(String(contact.email||'').split('@')[1])){
   await finish(c,task,'skipped',{message:'This email uses a non-public domain. No new paid provider request or cost reservation was made.'});return {skipped:true};
  }
  if(task.action==='verify'&&recentDomainFailure(contact)){await finish(c,task,'skipped',{message:'A recent domain check found no mail route. Review the email domain before paying for verification; no provider request was sent.'});return {skipped:true};}
  if(task.action==='verify'&&contact.email_status==='valid'&&contact.email_verification?.email===contact.email){
   const checked=Date.parse(contact.email_verification.checked_at),age=Date.now()-checked;
   if(Number.isFinite(checked)&&age>=0&&age<30*86400000){await finish(c,task,'skipped',{message:'A current valid email check already exists. No provider request or new reservation was made.'});return {skipped:true};}
  }
  const charge=(await c.query('SELECT * FROM prospect_charges WHERE task_id=$1',[task.id])).rows[0];
  if(!charge){
   const spent=Number((await c.query("SELECT COALESCE(sum(reserved_micros),0) AS n FROM prospect_charges WHERE reserved_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")).rows[0].n);
   if(task.payload.quote>0&&spent+task.payload.quote>config.dailyBudgetMicros){await finish(c,task,'skipped',{message:'The shared daily provider budget is exhausted. No request was sent.'});return {skipped:true};}
   await c.query('INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES($1,$2,$3,$4)',[task.id,task.user_id,task.provider,task.payload.quote]);
  }
  await c.query("INSERT INTO prospect_provider_pacing(provider,next_call_at) VALUES($1,now()+($2*interval '1 millisecond')) ON CONFLICT(provider) DO UPDATE SET next_call_at=EXCLUDED.next_call_at",[task.provider,pacingMs[task.provider]??6100]);
  return {...task,contact,attempts:task.attempts+1};
 });}
 async function saveSearch(c,task,result){
  if(result.checked_at!==undefined&&!validObservationTime(result.checked_at))throw fail(502,'Invalid search observation time.');
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect:${task.user_id}`]);
  let added=0,duplicates=0,conflicts=0,rejected=result.rejected||0;const contact_ids=[];
  // A list deleted while the request ran cannot make paid results disappear.
  const listId=task.payload.list_id&&(await c.query('SELECT id FROM prospect_lists WHERE id=$1 AND user_id=$2',[task.payload.list_id,task.user_id])).rows[0]?.id;
  for(const raw of result.contacts){let contact;try{contact=normalizeContact(raw,'People Data Labs');}catch{rejected++;continue;}const keys=contactIdentities(contact);if(!keys.length){rejected++;continue;}
   const matches=(await c.query('SELECT id,payload FROM prospect_contacts WHERE user_id=$1 AND identity_keys ?| $2::text[] FOR UPDATE',[task.user_id,identityLookupKeys(contact)])).rows;
   if(matches.length>1||matches.some(r=>['first_name','last_name'].some(k=>nameKey(r.payload[k])!==nameKey(contact[k]))||['email','linkedin_url'].some(k=>r.payload[k]&&contact[k]&&r.payload[k]!==contact[k]))){conflicts++;continue;}
   if(matches.length){
    const old=matches[0].payload,oldKeys=contactIdentities(old);
    const strong=keys.some(key=>(key.startsWith('email:')||key.startsWith('linkedin:'))&&oldKeys.includes(key));
    const newIdentifier=['email','linkedin_url','phone','mobile_phone'].some(key=>contact[key]&&contact[key]!==old[key]);
    // A provider result must meet the same namesake safeguard as a CSV import
    // before we attribute its source history or list membership to this person.
    if(!strong&&newIdentifier){conflicts++;continue;}
   }
   const evidence={source:'People Data Labs',kind:'provider',job_id:task.job_id,imported_at:result.checked_at||new Date().toISOString(),observed_at:null,provider_id:raw.provider_id||null};
   let id=matches[0]?.id;if(id){duplicates++;
    const old=matches[0].payload,differing=['title','company','country','state','city','phone'].filter(key=>old[key]&&contact[key]&&nameKey(old[key])!==nameKey(contact[key]));
    const updated={...old,last_seen_at:evidence.imported_at,source_history:[...(old.source_history||[]),{...evidence,differing_fields:differing,...differing.length?{proposed_values:Object.fromEntries(differing.map(key=>[key,contact[key]]))}:{}}].slice(-20)};
    await c.query('UPDATE prospect_contacts SET payload=$1::jsonb,updated_at=now() WHERE id=$2 AND user_id=$3',[JSON.stringify(updated),id,task.user_id]);
   }else{id=randomUUID();contact={...contact,source_kind:'provider',provider_id:raw.provider_id,source_observed_at:null,last_seen_at:evidence.imported_at,source_history:[evidence],field_sources:Object.fromEntries(Object.keys(CONTACT_ALIASES).filter(key=>contact[key]).map(key=>[key,evidence]))};await c.query('INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES($1,$2,$3::jsonb,$4::jsonb)',[id,task.user_id,JSON.stringify(contact),JSON.stringify(keys)]);added++;}
   contact_ids.push(id);if(listId)await c.query('INSERT INTO prospect_list_members(list_id,contact_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[listId,id]);
  }return {added,duplicates,conflicts,rejected,contact_ids,total:result.total,retrieved:result.retrieved,scroll_token:result.scroll_token||'',filters:task.payload.filters,message:result.errors?.join(' ')||''};
 }
 async function apply(task,result){return tx(pool,async c=>{
  const live=(await c.query('SELECT status,lease_token FROM prospect_tasks WHERE id=$1 FOR UPDATE',[task.id])).rows[0];if(live?.status!=='running'||live.lease_token!==task.lease_token)return;
  if(result.pending){if(task.attempts>=5)return finish(c,task,'needs_attention',{message:'Verification is still pending after five polls. No further automatic requests will be made.'});await c.query("UPDATE prospect_tasks SET status='waiting',lease_token=NULL,lease_until=NULL,next_attempt_at=now()+interval '30 seconds',result=jsonb_build_object('message','Provider acknowledged verification; awaiting its result.') WHERE id=$1",[task.id]);return;}
  if(task.action==='search'){const saved=await saveSearch(c,task,result);await finish(c,task,saved.conflicts||saved.rejected?'failed':'completed',saved);return;}
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect:${task.user_id}`]);
  const row=(await c.query('SELECT payload FROM prospect_contacts WHERE id=$1 AND user_id=$2 FOR UPDATE',[task.contact_id,task.user_id])).rows[0];
  if(!row||row.payload.suppressed||sig(row.payload)!==task.payload.signature){await finish(c,task,'skipped',{message:'Contact changed or was suppressed while the provider was working. Results were not applied.'});return;}
  const contact={...row.payload};
  if(result.suppressed){contact.suppressed=true;await c.query('UPDATE prospect_contacts SET payload=$1::jsonb,updated_at=now() WHERE id=$2',[JSON.stringify(contact),task.contact_id]);await finish(c,task,'skipped',{message:'Provider reported a suppression; the contact is now suppressed.'});return;}
  if(result.not_found||result.conflict){await finish(c,task,'skipped',{message:result.conflict?'Provider identity conflict; existing data preserved.':'No matching provider record.'});return;}
  if(task.action==='check_domain'){
   if(result.email!==contact.email||result.domain!==contact.email.split('@')[1]||!DOMAIN_CHECK_STATUSES.includes(result.status)||!validObservationTime(result.checked_at))throw fail(502,'Invalid domain-check result.');
   contact.email_domain_check={domain:result.domain,status:result.status,checked_at:result.checked_at,provider:'dns',label:DOMAIN_CHECK_LABELS[result.status],mx_hosts:result.mx_hosts||[]};
   if(contact.email_status==='valid'&&recentDomainFailure(contact)&&Date.parse(result.checked_at)>Date.parse(contact.email_verification?.checked_at))contact.email_status='unverified';
  }else if(task.action==='verify'){
   if(result.email!==contact.email||!['valid','invalid','catch_all','unknown'].includes(result.status)||!validObservationTime(result.checked_at))throw fail(502,'Invalid verifier result.');
   contact.email_status=result.status;contact.email_verification={provider:result.provider,provider_status:result.provider_status,checked_at:result.checked_at,email:result.email};
   if(contact.email_status==='valid'&&recentDomainFailure(contact)&&Date.parse(contact.email_domain_check.checked_at)>Date.parse(result.checked_at))contact.email_status='unverified';
  }else{
   if(result.checked_at!==undefined&&!validObservationTime(result.checked_at))throw fail(502,'Invalid enrichment observation time.');
   const candidate=normalizeContact(result.contact,'People Data Labs');
   if(['first_name','last_name'].some(k=>nameKey(candidate[k])!==nameKey(contact[k]))||['email','linkedin_url'].some(k=>candidate[k]&&contact[k]&&candidate[k]!==contact[k])){await finish(c,task,'skipped',{message:'Enrichment conflicts with current identifiers. Existing contact preserved.'});return;}
   const prospective={...contact};for(const [key,value] of Object.entries(candidate))if(!prospective[key]&&value)prospective[key]=value;
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect:${task.user_id}`]);
   const collision=(await c.query('SELECT id FROM prospect_contacts WHERE user_id=$1 AND id<>$2 AND identity_keys ?| $3::text[]',[task.user_id,task.contact_id,contactIdentities(prospective)])).rows;
   if(collision.length){await finish(c,task,'skipped',{message:'Enriched identifiers match another contact. Review the identity before merging.'});return;}
   const evidence={source:'People Data Labs',kind:'provider',job_id:task.job_id,imported_at:result.checked_at||new Date().toISOString(),observed_at:null,match_likelihood:result.match_likelihood||null};
   const differing=['title','company','country','state','city','phone'].filter(key=>contact[key]&&candidate[key]&&nameKey(contact[key])!==nameKey(candidate[key]));
   prospective.field_sources={...(contact.field_sources||{})};for(const key of Object.keys(CONTACT_ALIASES))if(!contact[key]&&candidate[key])prospective.field_sources[key]=evidence;
   prospective.source_history=[...(contact.source_history||[]),{...evidence,differing_fields:differing,...differing.length?{proposed_values:Object.fromEntries(differing.map(key=>[key,candidate[key]]))}:{}}].slice(-20);prospective.last_seen_at=evidence.imported_at;
   Object.assign(contact,prospective);if(!row.payload.email&&contact.email)contact.email_status='unverified';if(!row.payload.phone&&contact.phone)contact.phone_status='unverified';contact.enrichment={provider:'pdl',checked_at:result.checked_at,match_likelihood:result.match_likelihood||null};
  }
  await c.query('UPDATE prospect_contacts SET payload=$1::jsonb,identity_keys=$2::jsonb,updated_at=now() WHERE id=$3',[JSON.stringify(contact),JSON.stringify(contactIdentities(contact)),task.contact_id]);
  await finish(c,task,'completed',{message:task.action==='check_domain'?`Domain check: ${DOMAIN_CHECK_LABELS[result.status]}. This does not verify the individual mailbox.`:task.action==='verify'?(contact.email_status!==result.status?'Verification saved as historical evidence; a newer domain check found no mail route. Email remains unverified.':`Email verification: ${result.status}.`):'Provider enrichment saved; imported phone information remains unverified.'});
 });}
 async function tick(){const task=await claim();if(!task)return false;if(task.skipped)return true;try{const result=await(task.action==='search'?providers.search(task.payload.filters):task.action==='enrich'?providers.enrich(task.contact):task.action==='check_domain'?providers.checkDomain(task.contact):providers.verifyEmail(task.contact));await apply(task,result);}catch{await tx(pool,c=>finish(c,task,'needs_attention',{message:'Provider request or result processing failed. Reserved cost retained; automatic retry disabled. Review provider billing before launching another job.'}));}return true;}
 async function jobs(user,id){const rows=(await pool.query(`SELECT j.*,count(t.id)::int AS total,count(t.id) FILTER(WHERE t.status=ANY($2::text[]))::int AS finished,COALESCE(sum(c.reserved_micros),0) AS reserved_micros FROM prospect_jobs j LEFT JOIN prospect_tasks t ON t.job_id=j.id LEFT JOIN prospect_charges c ON c.task_id=t.id WHERE j.user_id=$1 AND ($3::text IS NULL OR j.id=$3) GROUP BY j.id ORDER BY j.created_at DESC LIMIT 30`,[user.uid,terminal,id||null])).rows;
  if(id&&!rows.length)throw fail(404,'Job not found.');if(id)return {job:rows[0],tasks:(await pool.query('SELECT id,contact_id,action,status,attempts,result,completed_at FROM prospect_tasks WHERE job_id=$1 ORDER BY created_at,id',[id])).rows};return {jobs:rows};
 }
 async function route(request,user){const url=new URL(request.url),path=url.pathname,method=request.method;if(!user?.uid)throw fail(401,'Sign in.');if(path==='/api/prospect/providers'&&method==='GET')return summary(user);if(path==='/api/prospect/jobs'&&method==='GET')return jobs(user);if(path==='/api/prospect/jobs'&&method==='POST'){let input;try{input=await request.json();}catch{throw fail(422,'Invalid JSON.');}return enqueue(user,input);}const match=path.match(/^\/api\/prospect\/jobs\/([^/]+)$/);if(match&&method==='GET')return jobs(user,match[1]);throw fail(404,'Job endpoint not found.');}
 return {route,enqueue,tick,summary,jobs};
}
