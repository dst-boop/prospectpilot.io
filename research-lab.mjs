import {createAdvisorWorkflow,withDirectoryRestrictions} from './advisor-workflow.mjs';
import {randomUUID} from 'node:crypto';
import {normalizeLead, mergeLead, isUsableStoredLead} from './generated/worker.mjs';
import {assessLead, candidateKeys, leadIdentity, validateObservation, nameKey, US_STATES, researchCSV, hash, qualificationVersion, sourceStrength, fieldKey, leadScores, scoreWeights} from './lead-quality.mjs';
export {sourceStrength};
import {matchPlans, selectEmployers, catalogSummary} from './plan-catalog.mjs';
import {applyPlaybook, findPlaybook, playbookChoices, belowAgeFloor} from './rollover-playbooks.mjs';
import {SOURCE_CATALOG} from './source-catalog.mjs';
import {LEAD_TEAM,LEAD_VISIBLE_SQL,forgetPerson,forgottenKeys} from './forget.mjs';
import {identityLookupKeys} from './prospect-workspace.mjs';
import {csvRows} from './warn.mjs';

const TEAM=LEAD_TEAM;
const fail=(status,message)=>Object.assign(Error(message),{status});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const integer=(value,min,max,fallback)=>{const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw fail(422,'A setting is outside its allowed range.');return n;};
const publicWebsite=value=>{try{const url=new URL(String(value||''));return url.protocol==='https:'||url.protocol==='http:'?url.href.slice(0,500):'';}catch{return '';}};
const cleanList=(values,max=100)=>[...new Set((Array.isArray(values)?values:[]).map(v=>String(v).trim().slice(0,200)).filter(Boolean))].slice(0,max);
export function mapResearchRow(raw) {
  const columns=new Map(Object.entries(raw).map(([k,v])=>[nameKey(k).replaceAll(' ',''),v]));
  const pick=(...keys)=>keys.map(k=>columns.get(nameKey(k).replaceAll(' ',''))).find(v=>v!==undefined&&v!=='');
  return {...raw,company:pick('Company','Company Name','Current Company','Employer')||raw.company,
    estimated_age_range:pick('Estimated Age Range','Est. Age Range','Age Range','Age Estimate','Age')||raw.estimated_age_range,
    former_employers:pick('Former Employers','Previous Company','Previous Employer')||raw.former_employers,
    signals:pick('401(k) Rollover Signal','401(k) Rollover Opportunity','Life Event Signal','Signals')||raw.signals};
}
export function labConfiguration(input={}) {
  if(input.qualification_target!==undefined&&!['legacy','rollover_100k'].includes(input.qualification_target))throw fail(422,'Choose a supported qualification target.');
  const states=cleanList(input.states,51).map(v=>v.toUpperCase());
  if(states.some(v=>!US_STATES.has(v)))throw fail(422,'Use two-letter US state codes.');
  const sources=cleanList(input.sources||['public_web','sec','warn'],4);
  if(sources.some(v=>!['public_web','sec','warn','web_search'].includes(v)))throw fail(422,'Unsupported discovery source.');
  // A campaign by place: a ZIP or town, a radius and business types find the
  // companies; titles decide which people found there are kept.
  const location=String(input.location??'').replace(/\s+/g,' ').trim().slice(0,120),industries=cleanList(input.industries,20);
  if(Boolean(location)!==Boolean(industries.length))throw fail(422,'A campaign by place needs both a place and at least one business type.');
  return {states,employers:cleanList(input.employers,50),sources,max_companies:integer(input.max_companies,1,50,10),
    websites:(Array.isArray(input.websites)?input.websites:[]).slice(0,50).map(v=>String(v).trim().slice(0,500)),daily_budget_micros:integer(input.daily_budget_micros,0,100000000,0),
    location,radius_miles:integer(input.radius_miles,1,100,25),industries,titles:cleanList(input.titles,30).map(v=>v.slice(0,80)),
    // How the four scores combine into priority: the advisor's formula, not code.
    score_weights:scoreWeights(input.score_weights),qualification_target:input.qualification_target||'legacy',
    // Set by a rollover playbook: which plans' employers to research first.
    playbook:findPlaybook(input.playbook)?.id||'',plan_filter:planFilter(input.plan_filter),minimum_age:integer(input.minimum_age,0,100,0)};
}
function planFilter(input={}) {
  const kinds=cleanList(input?.kinds,2);
  if(kinds.some(v=>!['401k','403b'].includes(v)))throw fail(422,'Unsupported plan type.');
  return {kinds,min_average:integer(input?.min_average,0,10000000,0),in_service:input?.in_service===true,order:input?.order==='former_employees'?'former_employees':''};
}
// Title terms match whole words, with the common abbreviations read both ways,
// so "VP" keeps a Vice President and "Owner" does not keep an Ownership Analyst.
// Expansions are whole titles, so "CFO" never keeps a Chief Financial Analyst.
const TITLE_ALIASES=[['vp','vice president'],['svp','senior vice president'],['evp','executive vice president'],['ceo','chief executive officer'],['cfo','chief financial officer'],['coo','chief operating officer'],['cto','chief technology officer'],['md','managing director'],['gm','general manager']];
const titleWords=value=>` ${nameKey(value).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()} `;
export function titleMatches(title,terms) {
  if(!terms?.length)return true;
  const text=titleWords(title);if(!text.trim())return false;
  return terms.some(term=>{
    const t=titleWords(term).trim();if(!t)return false;
    const forms=[t,...TITLE_ALIASES.filter(pair=>pair.includes(t)).flat()];
    // "President" asks for a president, not every Vice President.
    return forms.some(form=>text.replaceAll(` vice ${form} `,' ').includes(` ${form} `)||(form.startsWith('vice ')&&text.includes(` ${form} `)));
  });
}
async function transaction(pool,fn) {
  const client=await pool.connect();let broken;
  try {await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}
  catch(error){try{await client.query('ROLLBACK');}catch(e){broken=e;}throw error;}
  finally{client.release(broken);}
}
const visibleSQL=LEAD_VISIBLE_SQL;

// Why a source task came back short, in words an advisor can act on. Each task
// counts once per reason, however many of its pages hit the same wall.
const LOSS_REASONS=[
  [/budget/i,'Daily provider budget reached'],[/not configured/i,'Source not configured'],
  [/disallows/i,'Site blocks automated reading'],[/No official website/i,'No company website found'],
  [/did not establish the employer/i,'Page did not name the employer'],
  [/SEC registrant|proxy filing|proxy is older/i,'No usable SEC proxy filing'],
  [/format requires/i,'Page format not readable (PDF or similar)'],
  [/unavailable|timed out|exhausted|interrupted/i,'Page or source unavailable']];
// An unrecognised reason is shown as recorded (these are the app's own messages) rather than as "Other".
const lossReason=message=>LOSS_REASONS.find(([pattern])=>pattern.test(message))?.[1]||String(message||'').replace(/\s+/g,' ').trim().slice(0,120)||'Reason not recorded';
const tally=pairs=>Object.entries(pairs.reduce((all,[reason,n])=>{if(n)all[reason]=(all[reason]||0)+n;return all;},{})).map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count);
// A campaign read as a funnel: how many made it through each stage and what
// stopped the rest. Counts come from what the run recorded; nothing is estimated.
export function runFunnel({tasks=[],companies=[],statuses={}}={}) {
  const research=tasks.filter(t=>!['market','inventory'].includes(t.source));
  const byCompany=new Map();
  for(const t of research){const key=nameKey((typeof t.payload==='string'?JSON.parse(t.payload):t.payload||{}).company||'');if(!key)continue;if(!byCompany.has(key))byCompany.set(key,[]);byCompany.get(key).push(t);}
  const found=companies.length||byCompany.size;
  const researched=[...byCompany.values()].filter(list=>list.some(t=>['completed','partial'].includes(t.status))).length;
  const result=t=>t.result||{};
  const sum=field=>research.reduce((n,t)=>n+(Number(result(t)[field])||0),0);
  const pages=sum('pages_checked'),kept=sum('discovered'),offTarget=sum('off_target'),belowAge=sum('below_age'),added=sum('added'),known=sum('duplicates'),rejected=sum('rejected'),ambiguous=sum('ambiguous');
  const status=name=>Number(statuses[name]||0);
  // Saved means linked to this run and visible to this user; a match that
  // belongs to another advisor is counted by the task but never linked.
  const saved=Object.values(statuses).reduce((n,v)=>n+Number(v||0),0);
  const onFile=Math.max(0,saved-added),heldElsewhere=Math.max(0,known-onFile);
  const promising=status('promising')+status('verified');
  const notResearched=[...companies.filter(c=>!c.queued).map(c=>[c.skip_reason||'Not researched',1]),
    ...[...byCompany.values()].filter(list=>!list.some(t=>['completed','partial'].includes(t.status))).map(list=>[list.every(t=>['pending','running'].includes(t.status))?'Still waiting to run':lossReason((result(list[0]).errors||[])[0]||''),1])];
  // Only tasks that read pages can lose anything at the page stage.
  // Grouped by company, so two sources failing one company for the same reason count once.
  const companyOf=t=>nameKey((typeof t.payload==='string'?JSON.parse(t.payload):t.payload||{}).company||'');
  const pageLosses=[...new Set(research.filter(t=>['completed','partial'].includes(t.status)).flatMap(t=>(result(t).errors||[]).map(e=>`${companyOf(t)}\u0000${lossReason(e)}`)))].map(key=>[key.split('\u0000')[1],1]);
  return {stages:[
    {key:'companies_found',label:'Companies found',count:found},
    {key:'companies_researched',label:'Companies researched',count:researched,lost:tally(notResearched)},
    {key:'pages_read',label:'Pages read',count:pages,lost:tally(pageLosses),note:'Losses count companies, once per reason.'},
    {key:'people_found',label:'People found',count:kept+offTarget+belowAge},
    {key:'people_kept',label:'Matched the titles',count:kept,lost:tally([['Other titles, not kept',offTarget],['Reported age below the search, not kept',belowAge]])},
    {key:'people_saved',label:'Saved to your records',count:saved,detail:`${Math.min(added,saved)} new · ${onFile} already on file`,lost:tally([['Missing a full name, Equitable, or previously deleted',rejected],['Matched more than one record · held in Possible duplicates',ambiguous],['Already held by another advisor',heldElsewhere]])},
    {key:'promising',label:'Promising or better',count:promising,lost:tally([['Excluded by a qualification check',status('excluded')],['Conflicting identifiers to resolve',status('identity_review')],['Evidence still needed',status('incomplete')+status('unassessed')]])},
    {key:'qualified',label:'All five checks confirmed',count:status('verified'),lost:tally([['Promising, evidence still to review',status('promising')]])}]};
}
// Every value a source reported for these fields is kept with its source and
// when it was seen, so a second source never silently erases the first. The
// working value is the strongest source's, the newest among equals; when
// sources disagree the record says so and keeps both.
export const TRACKED_FIELDS=['current_title','company','city','state','country','estimated_age_range','email','phone','mobile_phone','linkedin_url','company_website'];
function recordValues(history,record,source,seenAt) {
  const out={...(history||{})};
  for(const field of TRACKED_FIELDS){
    const value=record[field],key=fieldKey(field,value);if(!key)continue;
    const list=[...(out[field]||[])],at=list.findIndex(v=>fieldKey(field,v.value)===key&&v.source===source);
    if(at>=0)list[at]={...list[at],last_seen:seenAt};else list.push({value:String(value).slice(0,300),source:String(source||'Unknown source').slice(0,100),first_seen:seenAt,last_seen:seenAt});
    out[field]=bounded(field,list);
  }
  return out;
}
// A size bound for the record, never a way to lose the answer: the strongest
// source's entries and the working value are never evicted; the oldest of the
// weaker, superseded reports go first.
const HISTORY_LIMIT=20;
function bounded(field,list){
  const out=[...list],top=Math.max(...out.map(v=>sourceStrength(v.source).rank)),working=workingValue(field,out);
  while(out.length>HISTORY_LIMIT){
    const drop=out.findIndex(v=>sourceStrength(v.source).rank<top&&fieldKey(field,v.value)!==fieldKey(field,working));
    if(drop<0)break;out.splice(drop,1);
  }
  // A hard ceiling for equally strong reports; the working value's entries stay.
  while(out.length>HISTORY_LIMIT*2){const drop=out.findIndex(v=>fieldKey(field,v.value)!==fieldKey(field,working));if(drop<0)break;out.splice(drop,1);}
  return out;
}
// Only what the source itself supplied is recorded. The importer fills in
// defaults (country US) and infers age from graduation dates; neither is a
// source's report.
export function reportedFields(raw,lead){
  const out={...lead},keys=Object.entries(raw||{}).filter(([,v])=>v!==undefined&&v!==null&&String(v).trim()!=='').map(([k])=>nameKey(k).replace(/[^a-z]/g,''));
  if(!keys.some(k=>k.includes('country')))delete out.country;
  if(!String(mapResearchRow(raw||{}).estimated_age_range??'').trim())delete out.estimated_age_range;
  return out;
}
function workingValue(field,list){
  return [...list].sort((a,b)=>sourceStrength(b.source).rank-sourceStrength(a.source).rank||String(b.last_seen).localeCompare(String(a.last_seen)))[0]?.value;
}
export function fieldConflicts(lead){
  return Object.entries(lead.field_values||{}).map(([field,list])=>{const distinct=[...new Map(list.map(v=>[fieldKey(field,v.value),v])).values()];return distinct.length>1?{field,working:lead[field]??'',values:list.map(v=>({...v,strength:sourceStrength(v.source).label}))}:null;}).filter(Boolean);
}
export function withFieldHistory(lead,seenAt,reported=lead){
  return {...lead,field_values:recordValues(lead.field_values,reported,lead.source_names?.[0],seenAt)};
}
// A record written without history (saved before this change, or by the
// owner-only legacy tool) keeps any value it holds that the history lacks,
// credited to that record's own source, so no working value is ever
// unexplained and none is lost by the next merge.
export function reconciled(lead,seenAt){
  const at=lead.updated_at||lead.created_at||seenAt,source=lead.source_names?.at?.(-1)||'Earlier record';
  const history=recordValues(lead.field_values,Object.fromEntries(TRACKED_FIELDS.filter(f=>{const k=fieldKey(f,lead[f]);return k&&!(lead.field_values?.[f]||[]).some(v=>fieldKey(f,v.value)===k);}).map(f=>[f,lead[f]])),source,at);
  return {...lead,field_values:history};
}
// The legacy merge still decides workflow fields, evidence and flags; the
// tracked fields it receives are already the strongest reported values.
export function mergeWithHistory(existing,incoming,seenAt,reported=incoming) {
  const seeded=reconciled(existing,seenAt);
  const history=recordValues(seeded.field_values,reported,incoming.source_names?.[0],seenAt),chosen={...incoming};
  // Choose first, then merge, so everything the merge derives uses the working values.
  for(const field of TRACKED_FIELDS){const list=history[field];if(list?.length)chosen[field]=workingValue(field,list);}
  const merged=mergeLead(seeded,chosen);merged.field_values=history;
  return merged;
}
// First name, last name and company: the same person unless proved otherwise,
// but not proof, so a match on this alone is put to the advisor.
export const personKey=lead=>{const parts=[lead.first_name,lead.last_name,lead.company].map(v=>nameKey(v||'').replace(/[^a-z0-9 ]/g,'').trim());return parts.every(Boolean)?parts.join('|'):'';};
// Folds one stored record into another when the advisor says they are the
// same person: every report keeps its own source and date, and the working
// values are chosen again from the combined history.
export function absorbRecord(existing,incoming,seenAt) {
  const seeded=reconciled(existing,seenAt);let history=seeded.field_values;
  for(const [field,list] of Object.entries(reconciled(incoming,seenAt).field_values||{}))
    for(const v of list)history=recordValues(history,{[field]:v.value},v.source,v.last_seen||seenAt);
  const chosen={...incoming};
  for(const field of TRACKED_FIELDS){const list=history[field];if(list?.length)chosen[field]=workingValue(field,list);}
  const merged=mergeLead(seeded,chosen);merged.field_values=history;
  return merged;
}
export async function assessInventory(ids,assess,{clock=()=>performance.now(),budgetMs=60000}={}) {
  const started=clock();let assessed=0,failed=0,skipped=0;
  for(const id of ids){
    // Stop starting new work well before the two-minute task lease expires.
    if(clock()-started>=budgetMs)break;
    try{await assess(id);assessed++;}catch(error){if(error.status===404)skipped++;else failed++;}
  }
  const remaining=ids.length-assessed-failed-skipped,errors=[];
  if(failed)errors.push(`${failed} records could not be assessed. Run Assess saved leads again to retry.`);
  if(remaining)errors.push(`The batch time limit left ${remaining} records unattempted. Run Assess saved leads again to continue.`);
  return {status:failed||remaining?'partial':'completed',assessed,failed,skipped,remaining,errors,candidates:[]};
}

export function createResearchLab({pool,sources,dispatch=async()=>false,now=()=>new Date()}={}) {
  async function targetFor(user,client=pool) {
    const config=parse((await client.query('SELECT configuration FROM lab_settings WHERE user_id=$1',[user.uid])).rows[0]?.configuration)||{};
    return config.qualification_target==='rollover_100k'?'rollover_100k':'legacy';
  }
  async function accessible(user,id,client=pool,lock=false) {
    const row=(await client.query(`SELECT discovery_leads.*,(SELECT jsonb_agg(pc.payload) FROM advisor_contact_links acl JOIN prospect_contacts pc ON pc.id=acl.contact_id AND pc.user_id=acl.user_id WHERE acl.lead_id=discovery_leads.id) AS linked_contacts FROM discovery_leads WHERE ${visibleSQL} AND id=$4${lock?' FOR UPDATE':''}`,[TEAM,user.uid,user.email,id])).rows[0];
    if(!row)throw fail(404,'Lead not found or unavailable to this account.');
    return {...row,lead:withDirectoryRestrictions({...parse(row.payload),id:row.id},row.linked_contacts)};
  }
  async function observations(user,id,client=pool) {return (await client.query('SELECT payload FROM lab_observations WHERE lead_id=$1 AND user_id=$2',[id,user.uid])).rows.map(r=>parse(r.payload));}
  async function evaluate(user,lead,client=pool) {
    const quality=assessLead(lead,await observations(user,lead.id,client),{now:now(),plans:await matchPlans(client,lead),target:await targetFor(user,client)});
    await client.query(`INSERT INTO lab_qualification(lead_id,user_id,status,score,identity_signature,first_verified_at,rule_version)
      VALUES($1,$2,$3,$4,$5,CASE WHEN $3='verified' THEN $6::timestamptz ELSE NULL END,$7)
      ON CONFLICT(lead_id,user_id) DO UPDATE SET status=EXCLUDED.status,score=EXCLUDED.score,identity_signature=EXCLUDED.identity_signature,
      first_verified_at=CASE WHEN lab_qualification.rule_version=EXCLUDED.rule_version THEN COALESCE(lab_qualification.first_verified_at,EXCLUDED.first_verified_at) ELSE EXCLUDED.first_verified_at END,rule_version=EXCLUDED.rule_version,evaluated_at=now()`,[lead.id,user.uid,quality.status,quality.score,quality.identity_signature,now().toISOString(),quality.version]);
    return quality;
  }
  async function detail(user,id,task=null) {
    return transaction(pool,async client=>{
      if(task){
        const owned=(await client.query("SELECT id FROM lab_tasks WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() FOR UPDATE",[task.id,task.lease_token])).rows[0];
        if(!owned)throw fail(409,'Assessment lease is no longer current.');
      }
      // Serialize persisted assessments with evidence reviews and lead edits.
      const {lead}=await accessible(user,id,client,true);
      const quality=await evaluate(user,lead,client);
      const weights=(await client.query('SELECT configuration FROM lab_settings WHERE user_id=$1',[user.uid])).rows[0]?.configuration?.score_weights;
      return {lead:{...lead,field_conflicts:fieldConflicts(reconciled(lead,now().toISOString()))},quality,scores:leadScores(lead,quality,{now:now(),weights}),observations:await observations(user,id,client)};
    });
  }
  async function review(user,id,input) {
    return transaction(pool,async client=>{
      const {lead}=await accessible(user,id,client,true),identity=leadIdentity(lead);
      if(input.identity_signature!==identity)throw fail(409,'This lead changed. Reload it before saving evidence.');
      const observation=validateObservation(input,{userId:user.uid,identity,now:now()});
      await client.query(`INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES($1,$2,$3,$4::jsonb)
        ON CONFLICT(lead_id,user_id,field) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,[id,user.uid,observation.field,JSON.stringify(observation)]);
      return {quality:await evaluate(user,lead,client)};
    });
  }
  async function list(user,{offset=0,limit=50,status='',search='',compact=false}={}) {
    const target=await targetFor(user);
    offset=integer(offset,0,1000000,0);limit=integer(limit,1,100,50);
    if(status&&!['verified','promising','incomplete','excluded','identity_review','unassessed'].includes(status))throw fail(422,'Invalid quality filter.');
    if(![true,false,'true','false'].includes(compact))throw fail(422,'Invalid compact result setting.');
    const needle=String(search).trim().replace(/\s+/g,' ').slice(0,100),params=[TEAM,user.uid,user.email,status,needle];
    const scope=`FROM discovery_leads d LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2 AND q.rule_version='${qualificationVersion(target)}'
      WHERE ${visibleSQL} AND ($4='' OR COALESCE(q.status,'unassessed')=$4)
      AND ($5='' OR strpos(lower(concat_ws(' ',d.payload::jsonb->>'first_name',d.payload::jsonb->>'last_name')),lower($5))>0
        OR strpos(lower(d.payload::jsonb->>'company'),lower($5))>0)`;
    const rows=(await pool.query(`SELECT d.id,d.payload,q.status AS recorded_status,count(*) OVER()::int AS total ${scope}
      ORDER BY q.score DESC NULLS LAST,d.id LIMIT $6 OFFSET $7`,[...params,limit,offset])).rows;
    const total=rows[0]?.total??(offset>0?(await pool.query(`SELECT count(*)::int AS total ${scope}`,params)).rows[0].total:0);
    const ids=rows.map(r=>r.id);
    const records=ids.length?(await pool.query('SELECT lead_id,payload FROM lab_observations WHERE user_id=$1 AND lead_id=ANY($2::text[])',[user.uid,ids])).rows:[];
    // Live assessment prevents an expired or edited record from displaying an old verified badge.
    const leads=rows.map(row=>{
      const lead={...parse(row.payload),id:row.id},quality=assessLead(lead,records.filter(o=>o.lead_id===row.id).map(o=>parse(o.payload)),{now:now(),target});
      if(compact===true||compact==='true')return {
        lead:Object.fromEntries(['id','first_name','last_name','current_title','company'].map(k=>[k,lead[k]])),
        quality:{status:quality.status,score:quality.score,gaps:quality.gaps,age_band:quality.age_band,gates:Object.fromEntries(Object.entries(quality.gates).map(([k,g])=>[k,{state:g.state,reason:g.reason}]))}
      };
      return {lead,quality};
    });
    return {leads,total,offset,limit,filter_basis:'Last inventory assessment; displayed evidence is re-evaluated now.'};
  }
  // Suggestions reuse saved records only; shared employment is not a social edge.
  async function relatedPeople(user,id) {
    const target=await targetFor(user);
    const {lead:seed}=await accessible(user,id);
    const key=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
    const company=key(seed.company),role=key(seed.current_title);
    if(!company&&!role)return {people:[],truncated:false,status:'missing_context',searched:false,missing_fields:['company','current_title']};
    const rows=(await pool.query(`SELECT d.id,d.payload FROM discovery_leads d WHERE ${visibleSQL} AND d.id<>$4
      AND (($5<>'' AND lower(regexp_replace(trim(d.payload::jsonb->>'company'),'\\s+',' ','g'))=$5)
        OR ($6<>'' AND lower(regexp_replace(trim(d.payload::jsonb->>'current_title'),'\\s+',' ','g'))=$6))
      ORDER BY d.id LIMIT 101`,[TEAM,user.uid,user.email,id,company,role])).rows;
    const people=[];
    for(const row of rows.slice(0,100)) {
      const {lead}=await accessible(user,row.id);
      const quality=assessLead(lead,await observations(user,row.id),{now:now(),target});
      if(['excluded','identity_review'].includes(quality.status)||/^(not a fit|client)$/i.test(lead.follow_up_status||''))continue;
      const reasons=[];
      if(company&&key(lead.company)===company)reasons.push('Same reported employer');
      if(role&&key(lead.current_title)===role)reasons.push('Same reported role');
      people.push({id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,current_title:lead.current_title,
        reasons,basis:'Saved profile fields; relationship unconfirmed',sources:lead.source_names||[],
        next_step:'Review this person and their contact evidence. Ask whether they know your existing contact before requesting an introduction.'});
    }
    people.sort((a,b)=>b.reasons.length-a.reasons.length||a.id.localeCompare(b.id));
    return {people:people.slice(0,20),truncated:rows.length>100||people.length>20,status:people.length?'matches':'no_matches',searched:true};
  }
  async function saveCandidates(client,user,candidates,run,source) {
    if(!candidates.length)return {added:0,duplicates:0,rejected:0,ambiguous:0};
    // Serialize imports and source completions for this team, including concurrent workers.
    await client.query('SELECT pg_advisory_xact_lock(505006)');
    const rows=(await client.query('SELECT id,payload,owner_user_id,owner_email FROM discovery_leads WHERE team=$1',[TEAM])).rows;
    const index=new Map();
    for(const r of rows)for(const key of candidateKeys(parse(r.payload))){if(!index.has(key))index.set(key,[]);index.get(key).push(r);}
    // Same name at the same company, whatever the location: the probable-match index.
    const people=new Map();
    for(const r of rows){const key=personKey(parse(r.payload));if(key){if(!people.has(key))people.set(key,[]);people.get(key).push(r);}}
    const admin=(await client.query("SELECT 1 FROM discovery_users WHERE user_id=$1 AND role='admin'",[user.uid])).rows.length>0;
    const writable=row=>row.owner_user_id===user.uid||String(row.owner_email||'').toLowerCase()===String(user.email||'').toLowerCase()||admin;
    let added=0,duplicates=0,rejected=0,ambiguous=0,probable=0;
    for(const raw of candidates.slice(0,5000)) {
      const lead=normalizeLead(mapResearchRow(raw),{source:raw.source_names?.[0]||source,owner_email:user.email});
      if(!lead.first_name||!lead.last_name||!isUsableStoredLead(lead)||nameKey(lead.company).includes('equitable')) {rejected++;continue;}
      const keys=candidateKeys(lead);if(!keys.length){rejected++;continue;}
      // A person this user deleted stays deleted, whether a CSV or a research
      // run finds them again.
      if((await forgottenKeys(client,user.uid,keys)).size){rejected++;continue;}
      const matches=[...new Map(keys.flatMap(key=>index.get(key)||[]).map(r=>[r.id,r])).values()];
      // More than one record claims this arrival: hold it for the advisor
      // instead of guessing or dropping it.
      if(matches.length>1){ambiguous++;await queueReview(client,user,run,'unresolved',{lead,reported:reportedFields(raw,lead)},keys,matches.map(m=>m.id),null);continue;}
      let saved=lead,isNew=!matches.length;
      if(matches.length) {
        const existing=matches[0];
        // An advisor cannot overwrite another advisor's record through import deduplication.
        if(!writable(existing)){duplicates++;continue;}
        saved=mergeWithHistory(parse(existing.payload),lead,now().toISOString(),reportedFields(raw,lead));saved.id=existing.id;
        await client.query('UPDATE discovery_leads SET payload=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[JSON.stringify(saved),saved.id]);duplicates++;
      } else {
        saved=withFieldHistory(saved,now().toISOString(),reportedFields(raw,saved));saved.id=randomUUID();
        await client.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',[saved.id,TEAM,user.uid,user.email,JSON.stringify(saved)]);added++;
        // Same person at the same company but no shared identity key (another
        // city, or none): saved, and put in front of the advisor to decide.
        const namesakes=(people.get(personKey(saved))||[]).filter(writable);
        if(namesakes.length){probable++;await queueReview(client,user,run,'probable',{},candidateKeys(saved),namesakes.map(r=>r.id),saved.id);}
      }
      const stored={id:saved.id,payload:JSON.stringify(saved),owner_user_id:user.uid,owner_email:user.email};
      for(const key of candidateKeys(saved))index.set(key,[stored]);
      if(isNew&&personKey(saved)){const key=personKey(saved);people.set(key,[...(people.get(key)||[]),stored]);}
      await client.query(`INSERT INTO lab_run_leads(run_id,lead_id,is_new,source) VALUES($1,$2,$3,$4) ON CONFLICT(run_id,lead_id) DO UPDATE SET is_new=lab_run_leads.is_new OR EXCLUDED.is_new`,[run.id,saved.id,isNew,source]);
      await evaluate(user,saved,client);
    }
    return {added,duplicates,rejected,ambiguous,probable};
  }
  async function queueReview(client,user,run,kind,candidate,keys,matchIds,leadId) {
    const ids=[...new Set(matchIds)].sort(),hashes=[...new Set(keys)].map(hash).sort(),fingerprint=hash(JSON.stringify([kind,hashes,ids])),at=now().toISOString();
    const reason=kind==='unresolved'?`Matches ${ids.length} existing records`:'Same name and company as an existing record, in another location';
    // The arrival is held with its field history, so each report keeps its source.
    const held=candidate.lead?{lead:withFieldHistory(candidate.lead,at,candidate.reported||candidate.lead)}:{};
    // One open review per arrival and set of records. The same person arriving
    // again adds what that source reported to the held copy; nothing is dropped.
    // Callers hold lock 505006, so the read and the write cannot interleave.
    const open=(await client.query("SELECT id,candidate FROM lab_identity_reviews WHERE user_id=$1 AND fingerprint=$2 AND status='open' FOR UPDATE",[user.uid,fingerprint])).rows[0];
    if(open){
      const prior=parse(open.candidate).lead;
      if(prior&&candidate.lead)await client.query('UPDATE lab_identity_reviews SET candidate=$2 WHERE id=$1',[open.id,JSON.stringify({lead:mergeWithHistory(prior,candidate.lead,at,candidate.reported||candidate.lead)})]);
      return;
    }
    await client.query(`INSERT INTO lab_identity_reviews(id,user_id,run_id,kind,fingerprint,candidate,key_hashes,lead_id,match_ids,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (user_id,fingerprint) WHERE status='open' DO NOTHING`,
      [randomUUID(),user.uid,run?.id||null,kind,fingerprint,JSON.stringify(held),hashes,leadId,ids,reason]);
  }
  // What the advisor needs to tell two records apart; the records are theirs.
  const reviewSummary=(id,p)=>({id,name:[p.first_name,p.last_name].filter(Boolean).join(' '),title:p.current_title||'',company:p.company||'',
    location:[p.city,p.state].filter(Boolean).join(', '),email:p.email||'',phone:p.phone||p.mobile_phone||'',linkedin_url:p.linkedin_url||'',sources:(p.source_names||[]).slice(0,5)});
  async function reviewAccess(client,user) {
    const admin=(await client.query("SELECT 1 FROM discovery_users WHERE user_id=$1 AND role='admin'",[user.uid])).rows.length>0;
    return row=>row.owner_user_id===user.uid||String(row.owner_email||'').toLowerCase()===String(user.email||'').toLowerCase()||admin;
  }
  async function identityReviews(user) {
    return transaction(pool,async client=>{
      const writable=await reviewAccess(client,user);
      const reviews=(await client.query("SELECT id,kind,lead_id,match_ids,reason,candidate,created_at FROM lab_identity_reviews WHERE user_id=$1 AND status='open' ORDER BY created_at DESC,id LIMIT 100",[user.uid])).rows;
      const ids=[...new Set(reviews.flatMap(r=>[...r.match_ids,r.lead_id].filter(Boolean)))];
      const leads=new Map((await client.query('SELECT id,payload,owner_user_id,owner_email FROM discovery_leads WHERE team=$1 AND id=ANY($2::text[])',[TEAM,ids])).rows.map(r=>[r.id,r]));
      const total=Number((await client.query("SELECT count(*) AS n FROM lab_identity_reviews WHERE user_id=$1 AND status='open'",[user.uid])).rows[0].n);
      return {total,reviews:reviews.map(r=>{
        const arrival=r.kind==='probable'?leads.get(r.lead_id):null;
        const matches=r.match_ids.map(id=>leads.get(id)).filter(Boolean);
        // Another advisor's record is counted, never shown.
        return {id:r.id,kind:r.kind,reason:r.reason,created_at:r.created_at,
          arrival:arrival?reviewSummary(arrival.id,parse(arrival.payload)):reviewSummary(null,parse(r.candidate).lead||{}),
          matches:matches.filter(writable).map(m=>reviewSummary(m.id,parse(m.payload))),held_elsewhere:matches.filter(m=>!writable(m)).length};
      })};
    });
  }
  async function resolveIdentityReview(user,id,input={}) {
    const decision=String(input.decision||''),target=String(input.target_id||'');
    return transaction(pool,async client=>{
      // The same lock as imports and deletes, so nothing changes underneath.
      await client.query('SELECT pg_advisory_xact_lock(505006)');
      const review=(await client.query('SELECT * FROM lab_identity_reviews WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,user.uid])).rows[0];
      if(!review)throw fail(404,'Review not found.');
      if(review.status!=='open')throw fail(409,'This review was already decided.');
      const allowed=review.kind==='unresolved'?['merge','save_new','discard']:['same','separate'];
      if(!allowed.includes(decision))throw fail(400,`Choose one of: ${allowed.join(', ')}.`);
      const writable=await reviewAccess(client,user),at=now().toISOString();
      const load=async leadId=>(await client.query('SELECT id,payload,owner_user_id,owner_email FROM discovery_leads WHERE team=$1 AND id=$2 FOR UPDATE',[TEAM,leadId])).rows[0];
      const pickTarget=async()=>{
        if(!review.match_ids.includes(target))throw fail(400,'Choose one of the records in this review.');
        const row=await load(target);
        if(!row)throw fail(409,'That record no longer exists.');
        if(!writable(row))throw fail(403,'That record belongs to another advisor.');
        return row;
      };
      const link=async leadId=>{if(review.run_id)await client.query('INSERT INTO lab_run_leads(run_id,lead_id,is_new,source) VALUES($1,$2,$3,$4) ON CONFLICT(run_id,lead_id) DO NOTHING',[review.run_id,leadId,false,'identity_review']);};
      let status,leadId=null;
      if(review.kind==='unresolved'&&decision!=='discard'){
        const {lead}=parse(review.candidate);
        if(!lead)throw fail(409,'This arrival is no longer held.');
        // A person deleted since the arrival stays deleted.
        if((await forgottenKeys(client,user.uid,candidateKeys(lead))).size)throw fail(409,'This person was deleted from your records.');
        let saved;
        if(decision==='merge'){
          const row=await pickTarget();
          saved={...absorbRecord(parse(row.payload),lead,at),id:row.id};
          await client.query('UPDATE discovery_leads SET payload=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[JSON.stringify(saved),saved.id]);status='merged';
        } else {
          saved={...lead,id:randomUUID()};
          await client.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',[saved.id,TEAM,user.uid,user.email,JSON.stringify(saved)]);status='saved';
        }
        await link(saved.id);await evaluate(user,saved,client);leadId=saved.id;
      } else if(decision==='same'){
        const row=await pickTarget(),arrival=await load(review.lead_id);
        if(!arrival)throw fail(409,'The newer record no longer exists.');
        if(!writable(arrival))throw fail(403,'The newer record belongs to another advisor.');
        // Work already done on the newer record is never discarded by a merge.
        const work=(await client.query(`SELECT (SELECT count(*) FROM lab_observations WHERE lead_id=$1)+(SELECT count(*) FROM advisor_activities WHERE lead_id=$1)
          +(SELECT count(*) FROM advisor_contact_links WHERE lead_id=$1)+(SELECT count(*) FROM advisor_rest_periods WHERE lead_id=$1)
          +(SELECT count(*) FROM research_jobs WHERE lead_id=$1)+(SELECT count(*) FROM lead_call_records WHERE lead_id=$1) AS n`,[arrival.id])).rows[0];
        const arrived=parse(arrival.payload);
        if(Number(work.n)||(Array.isArray(arrived.research_records)&&arrived.research_records.length))
          throw fail(409,'The newer record already has evidence, research, calls, activity or a linked contact. Open both and combine them by hand.');
        const saved={...absorbRecord(parse(row.payload),arrived,at),id:row.id};
        await client.query('UPDATE discovery_leads SET payload=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[JSON.stringify(saved),saved.id]);
        await client.query('INSERT INTO lab_run_leads(run_id,lead_id,is_new,source) SELECT run_id,$2,false,source FROM lab_run_leads WHERE lead_id=$1 ON CONFLICT(run_id,lead_id) DO NOTHING',[arrival.id,saved.id]);
        // Other open reviews about the newer record now point at the kept one.
        await client.query('UPDATE lab_identity_reviews SET match_ids=ARRAY(SELECT DISTINCT CASE WHEN m=$1 THEN $2 ELSE m END FROM unnest(match_ids) m) WHERE $1=ANY(match_ids)',[arrival.id,saved.id]);
        await client.query('DELETE FROM lab_identity_reviews WHERE lead_id=$1 AND id<>$2',[arrival.id,review.id]);
        await client.query('UPDATE lab_identity_reviews SET lead_id=NULL WHERE id=$1',[review.id]);
        await client.query('DELETE FROM discovery_leads WHERE id=$1',[arrival.id]);
        await evaluate(user,saved,client);status='merged';leadId=saved.id;
      } else status=decision==='separate'?'separate':'discarded';
      // Decided: the held copy of the person is no longer needed.
      await client.query("UPDATE lab_identity_reviews SET status=$2,resolved_at=now(),candidate='{}'::jsonb,key_hashes='{}' WHERE id=$1",[review.id,status]);
      return {status,lead_id:leadId};
    });
  }
  async function settings(user,input) {
    if(input) {
      const supplied=input.configuration||input;
      const config=labConfiguration({...supplied,qualification_target:supplied.qualification_target??await targetFor(user)}),hour=integer(input.daily_hour,0,23,13);
      await pool.query(`INSERT INTO lab_settings(user_id,user_email,daily_enabled,daily_hour,daily_budget_micros,configuration)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id) DO UPDATE SET user_email=EXCLUDED.user_email,daily_enabled=EXCLUDED.daily_enabled,daily_hour=EXCLUDED.daily_hour,daily_budget_micros=EXCLUDED.daily_budget_micros,configuration=EXCLUDED.configuration,updated_at=now()`,[user.uid,user.email,input.daily_enabled===true,hour,config.daily_budget_micros,JSON.stringify(config)]);
    }
    return (await pool.query('SELECT * FROM lab_settings WHERE user_id=$1',[user.uid])).rows[0]||{daily_enabled:false,daily_hour:13,daily_budget_micros:0,configuration:labConfiguration()};
  }
  async function enqueue(user,input={}) {
    const config=labConfiguration(input.kind==='inventory'?input:applyPlaybook(input)),kind=input.kind==='inventory'?'inventory':'discovery';
    const key=String(input.idempotency_key||randomUUID()).slice(0,160);
    const replay=(await pool.query('SELECT * FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows[0];if(replay)return {...replay,replayed:true};
    let employers=[];
    if(kind==='discovery') {
      if(!config.sources.length)throw fail(422,'Select at least one discovery source.');
      const freeFallback=config.sources.some(source=>source!=='web_search'&&sources.quote(source)===0);
      if(!freeFallback&&config.sources.includes('web_search')&&sources.quote('web_search')==null)throw fail(422,'Licensed web search is not configured. Deselect it to use free sources.');
      if(!freeFallback&&config.sources.includes('web_search')&&sources.quote('web_search')>config.daily_budget_micros)throw fail(422,'The daily provider budget cannot cover one search query. Increase the budget or deselect licensed web search.');
      // A campaign by place finds its own companies in the worker; the plan
      // catalog and saved leads are the fallback only for a campaign without one.
      const plans=config.location?[]:await selectEmployers(pool,config,user.uid);
      employers=plans.map(p=>({company:p.sponsor,city:p.city,state:p.state,plan_id:p.id}));
      for(const [i,company] of config.employers.entries()) {
        const target=employers.find(e=>nameKey(e.company)===nameKey(company));
        if(target)target.website=config.websites[i]||'';
        else employers.push({company,website:config.websites[i]||'',state:config.states.length===1?config.states[0]:''});
      }
      if(!employers.length&&config.playbook&&!config.location)throw fail(422,`No employer plans matched “${findPlaybook(config.playbook).label}”${config.states.length?' in '+config.states.join(', '):''}. Add more states, or check that the DOL plan catalog is loaded.`);
      if(!employers.length&&!config.location) {
        const saved=(await pool.query(`SELECT payload FROM discovery_leads WHERE ${visibleSQL} ORDER BY updated_at DESC LIMIT 2000`,[TEAM,user.uid,user.email])).rows;
        employers=[...new Map(saved.map(r=>parse(r.payload)).filter(l=>l.company&&(!config.states.length||config.states.includes(l.state))).map(l=>[nameKey(l.company),{company:l.company,website:l.company_website||'',city:'',state:''}])).values()];
      }
      employers=employers.filter(e=>!nameKey(e.company).includes('equitable')).slice(0,config.max_companies);
      if(!employers.length&&!config.location)throw fail(422,'Add a place and business type, an employer, import a lead list, or load the DOL plan catalog to start discovery.');
    }
    let run;
    try {
      run=await transaction(pool,async client=>{
        if(kind==='inventory'){
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['lab-inventory:'+user.uid]);
          const active=(await client.query("SELECT * FROM lab_runs WHERE user_id=$1 AND kind='inventory' AND status IN ('queued','running') ORDER BY created_at,id LIMIT 1",[user.uid])).rows[0];
          if(active)return {...active,reused_active:true};
        }
        const id=randomUUID();
        const row=(await client.query(`INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,configuration,budget_micros) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`,[id,user.uid,user.email,kind,key,JSON.stringify(config),config.daily_budget_micros])).rows[0];
        if(kind==='inventory') {
          const ids=(await client.query(`SELECT d.id FROM discovery_leads d LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2 WHERE ${visibleSQL} ORDER BY q.evaluated_at ASC NULLS FIRST,d.id`,[TEAM,user.uid,user.email])).rows.map(r=>r.id);
          for(let i=0;i<ids.length;i+=100)await client.query('INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[randomUUID(),id,`inventory:${i}`,'inventory',JSON.stringify({ids:ids.slice(i,i+100)})]);
          if(!ids.length)return (await client.query("UPDATE lab_runs SET status='completed',completed_at=now(),message='No saved leads to assess.' WHERE id=$1 RETURNING *",[id])).rows[0];
        } else {
          for(const employer of employers)for(const source of config.sources)await client.query('INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(run_id,task_key) DO NOTHING',[randomUUID(),id,hash(`${source}:${nameKey(employer.company)}`),source,JSON.stringify(employer)]);
          if(config.location)await client.query("INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES($1,$2,'market','market',$3::jsonb)",[randomUUID(),id,JSON.stringify({location:config.location,radius_miles:config.radius_miles,industries:config.industries})]);
        }
        return row;
      });
    } catch(error) {
      if(error.code!=='23505')throw error;
      const active=(await pool.query("SELECT * FROM lab_runs WHERE user_id=$1 AND (idempotency_key=$2 OR (kind='discovery' AND status IN ('queued','running'))) ORDER BY created_at DESC LIMIT 1",[user.uid,key])).rows[0];
      if(active)return {...active,replayed:true};throw error;
    }
    if(run.status==='completed')return {...run,dispatched:false};
    let dispatched=false;try{dispatched=await dispatch();}catch{}
    return {...run,dispatched,message:run.reused_active?'Your existing assessment is still queued or running. Its progress is shown in the run history.':dispatched?'Research queued. You can close this page.':'Research queued. The background worker or recovery schedule must be active.'};
  }
  async function importCSV(user,input) {
    if(typeof input.csv!=='string'||Buffer.byteLength(input.csv)>4000000)throw fail(422,'Upload a CSV smaller than 4 MB.');
    let table;try{table=csvRows(input.csv);}catch{throw fail(422,'Malformed CSV quoting.');}
    if(table.length<2||table.length>5001)throw fail(422,'Include headers and 1 to 5,000 rows per import.');
    const headers=table[0].map(h=>h.replace(/^\uFEFF/,'').trim());
    if(new Set(headers).size!==headers.length)throw fail(422,'CSV column names must be unique.');
    if(table.slice(1).some(r=>r.length!==headers.length))throw fail(422,'Each CSV row must have the same number of columns as the header.');
    const rows=table.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])));
    const source=String(input.source||'Research CSV').slice(0,100);
    if(/fec|familytreenow|fastpeoplesearch/i.test(source+' '+headers.join(' ')))throw fail(422,'This source is not enabled for prospect imports.');
    const key=`import:${hash(input.csv+source)}`;
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(505006)');
      const prior=(await client.query('SELECT * FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows[0];if(prior)return {run:prior,replayed:true};
      const run={id:randomUUID()};
      await client.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status) VALUES($1,$2,$3,'import',$4,'running')",[run.id,user.uid,user.email,key]);
      const result=await saveCandidates(client,user,rows,run,source);
      await client.query("UPDATE lab_runs SET status='completed',message=$1,completed_at=now() WHERE id=$2",[JSON.stringify(result),run.id]);
      return {run,result,reported_rows:rows.length,note:'Imported claims remain unverified. Existing suppression is preserved.'};
    });
  }
  async function claimTask() {
    return transaction(pool,async client=>{
      // One reservation at a time across replicas protects concurrent daily budgets.
      await client.query('SELECT pg_advisory_xact_lock(505007)');
      const task=(await client.query(`SELECT t.*,r.user_id,r.user_email,r.budget_micros,r.configuration FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id
        WHERE r.status IN ('queued','running') AND (t.status='pending' OR (t.status='running' AND t.lease_until<now()))
        ORDER BY r.created_at,t.id LIMIT 1 FOR UPDATE OF t,r SKIP LOCKED`)).rows[0];
      if(!task)return null;
      const quote=task.source==='inventory'?0:sources.quote(task.source);
      let skip='';
      if(task.attempts>0&&Number(task.reserved_micros)>0)skip='A paid request was interrupted. Its cost is retained; automatic paid retries are disabled.';
      else if(task.attempts>=2)skip='Source recovery attempts exhausted.';
      else if(quote===null)skip='This source is not configured.';
      else if(quote>0) {
        const settingsRow=(await client.query('SELECT daily_budget_micros FROM lab_settings WHERE user_id=$1',[task.user_id])).rows[0];
        const ceiling=Math.min(Number(task.budget_micros),settingsRow?Number(settingsRow.daily_budget_micros):Number(task.budget_micros));
        const spent=Number((await client.query(`SELECT COALESCE(sum(amount_micros),0) AS n FROM lab_costs WHERE user_id=$1 AND category='provider' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,[task.user_id])).rows[0].n);
        if(spent+quote>ceiling)skip='Daily provider budget reached. No paid request made.';
      }
      if(skip){await client.query("UPDATE lab_tasks SET status='skipped',result=$1::jsonb,completed_at=now(),lease_until=NULL WHERE id=$2",[JSON.stringify({status:'skipped',errors:[skip]}),task.id]);return {...task,skipped:true};}
      if(quote>0)await client.query("INSERT INTO lab_costs(id,run_id,user_id,category,amount_micros,basis,note) VALUES($1,$2,$3,'provider',$4,'configured_estimate','Reserved before licensed search; reconcile against provider billing.')",[`task:${task.id}`,task.run_id,task.user_id,quote]);
      const token=randomUUID();
      await client.query("UPDATE lab_tasks SET status='running',lease_token=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1,reserved_micros=$2,started_at=COALESCE(started_at,now()) WHERE id=$3",[token,quote,task.id]);
      await client.query("UPDATE lab_runs SET status='running' WHERE id=$1",[task.run_id]);
      return {...task,lease_token:token};
    });
  }
  async function finishRun(id) {
    await pool.query(`UPDATE lab_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM lab_tasks WHERE run_id=$1 AND status IN ('failed','partial','skipped')) THEN 'completed_with_gaps' ELSE 'completed' END,completed_at=now()
      WHERE id=$1 AND status IN ('queued','running') AND NOT EXISTS(SELECT 1 FROM lab_tasks WHERE run_id=$1 AND status IN ('pending','running'))`,[id]);
  }
  // Company discovery, then person discovery: the companies a place search
  // found are saved with the run and each becomes research tasks for the
  // selected sources. Companies this user researched in the last seven days
  // are passed over, so a daily campaign moves through the area instead of
  // repeating its first page of results.
  async function expandMarket(client,task,user,config,result) {
    const companies=(result.companies||[]).filter(c=>c?.name&&!nameKey(c.name).includes('equitable'));
    // A company counts as researched only when one of its source tasks actually
    // ran; one skipped for budget or never reached stays in the rotation.
    const recent=new Set((await client.query(`SELECT DISTINCT t.payload->>'company_key' AS company_key FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id
      WHERE r.user_id=$1 AND r.id<>$2 AND r.created_at>now()-interval '7 days' AND t.source<>'market' AND t.status IN ('completed','partial') AND t.payload ? 'company_key'`,[task.user_id,task.run_id])).rows.map(r=>r.company_key));
    const existing=new Set((await client.query('SELECT payload FROM lab_tasks WHERE run_id=$1 AND source<>$2',[task.run_id,'market'])).rows.map(r=>nameKey(parse(r.payload).company)));
    let queued=0,recently=0;
    for(const company of companies) {
      const key=nameKey(company.name);if(!key)continue;
      let reason='';
      if(existing.has(key))reason='Already in this run.';
      else if(recent.has(key)){reason='Researched in the last 7 days.';recently++;}
      else if(existing.size>=config.max_companies)reason='Beyond this run\'s company limit.';
      const website=publicWebsite(company.website);
      await client.query(`INSERT INTO lab_companies(run_id,company_key,user_id,name,website,location,distance_miles,industries,source,source_url,queued,skip_reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) ON CONFLICT(run_id,company_key) DO NOTHING`,
        [task.run_id,key,task.user_id,String(company.name).slice(0,200),website,String(company.location||'').slice(0,240),Number.isFinite(Number(company.distance_miles))&&company.distance_miles!==null?Number(company.distance_miles):null,
         JSON.stringify((company.industries||[]).slice(0,10)),String(company.source||'Business directory').slice(0,100),String(company.source_url||'').slice(0,500),!reason,reason]);
      if(reason)continue;
      queued++;existing.add(key);
      const employer={company:String(company.name).slice(0,200),company_key:key,website,city:'',state:config.states.length===1?config.states[0]:'',location:String(company.location||'').slice(0,240)};
      for(const source of config.sources)await client.query('INSERT INTO lab_tasks(id,run_id,task_key,source,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(run_id,task_key) DO NOTHING',[randomUUID(),task.run_id,hash(`${source}:${key}`),source,JSON.stringify(employer)]);
    }
    const errors=[...(result.errors||[])];
    if(companies.length&&!queued)errors.push(recently===companies.length?'Every company found was researched in the last 7 days. Widen the radius or add business types.':'No new companies to research in this run.');
    const status=result.status==='failed'?'failed':queued&&result.status!=='partial'?'completed':'partial';
    await client.query('UPDATE lab_tasks SET status=$1,result=$2::jsonb,completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$3',[status,JSON.stringify({status,companies_found:companies.length,companies_queued:queued,recently_researched:recently,
      area:result.location?.label||'',radius_miles:result.radius_miles??config.radius_miles,industry_labels:result.industry_labels||[],provider:result.provider||'',attribution:result.attribution||'',errors}),task.id]);
  }
  async function tick() {
    const task=await claimTask();if(!task)return false;
    if(task.skipped){await finishRun(task.run_id);return true;}
    const user={uid:task.user_id,email:task.user_email},started=performance.now();let result;
    let config;try{config=labConfiguration(parse(task.configuration)||{});}catch{config=labConfiguration();}
    try {
      if(task.source==='inventory') {
        result=await assessInventory(parse(task.payload).ids,async id=>{await detail(user,id,task);});
      } else if(task.source==='market') {
        if(typeof sources.market!=='function')throw Error('unavailable');
        result=await sources.market({...parse(task.payload),max_companies:100});
      } else result=await sources.run(task.source,parse(task.payload));
    } catch {result={status:'failed',candidates:[],errors:['Source unavailable or timed out. No lead evidence was fabricated.']};}
    // Only the people the campaign asked for are kept; the rest are counted, not stored.
    let offTarget=0;
    if(config.titles.length&&result.candidates?.length){
      const kept=result.candidates.filter(c=>titleMatches(c.current_title||c.title,config.titles));
      offTarget=result.candidates.length-kept.length;result={...result,candidates:kept};
    }
    // A playbook's age floor drops only people whose reported age is below it.
    let belowAge=0;
    if(config.minimum_age&&result.candidates?.length){
      const kept=result.candidates.filter(c=>!belowAgeFloor(c.estimated_age_range??c.age,config.minimum_age));
      belowAge=result.candidates.length-kept.length;result={...result,candidates:kept};
    }
    await transaction(pool,async client=>{
      const owned=(await client.query('SELECT id FROM lab_tasks WHERE id=$1 AND lease_token=$2 AND status=\'running\' FOR UPDATE',[task.id,task.lease_token])).rows[0];
      if(!owned)return;
      if(task.source==='market'){await expandMarket(client,task,user,config,result);return;}
      const counts=await saveCandidates(client,user,result.candidates||[],{id:task.run_id},task.source);
      if(offTarget)counts.off_target=offTarget;
      if(belowAge)counts.below_age=belowAge;
      const {candidates,...summary}=result;
      const status=['completed','no_match'].includes(result.status)?'completed':result.status==='partial'?'partial':'failed';
      await client.query('UPDATE lab_tasks SET status=$1,result=$2::jsonb,completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$3',[status,JSON.stringify({...summary,...counts,discovered:candidates?.length||0,duration_ms:Math.round(performance.now()-started)}),task.id]);
    });
    await finishRun(task.run_id);return true;
  }
  async function scheduleDue() {
    const date=now(),day=date.toISOString().slice(0,10);
    const rows=(await pool.query('SELECT * FROM lab_settings WHERE daily_enabled=true AND daily_hour<=$1',[date.getUTCHours()])).rows;
    for(const row of rows) {
      const user={uid:row.user_id,email:row.user_email},key=`daily:${day}`;
      if((await pool.query('SELECT 1 FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows.length)continue;
      try{await enqueue(user,{...parse(row.configuration),daily_budget_micros:Number(row.daily_budget_micros),idempotency_key:key});}
      catch(error){if(error.status===422)await pool.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status,message,completed_at) VALUES($1,$2,$3,'discovery',$4,'failed',$5,now()) ON CONFLICT(user_id,idempotency_key) DO NOTHING",[randomUUID(),user.uid,user.email,key,error.message]);else throw error;}
    }
  }
  async function runs(user) {return (await pool.query(`SELECT r.*, (SELECT count(*)::int FROM lab_tasks WHERE run_id=r.id) AS tasks,
    (SELECT count(*)::int FROM lab_tasks WHERE run_id=r.id AND status NOT IN ('pending','running')) AS finished_tasks,
    (SELECT count(*)::int FROM lab_run_leads WHERE run_id=r.id AND is_new) AS new_people,
    (SELECT COALESCE(sum(amount_micros),0) FROM lab_costs WHERE run_id=r.id) AS cost_micros,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('source',t.source,'company',t.payload->>'company','status',t.status,'errors',COALESCE(t.result->'errors','[]'::jsonb)) ORDER BY t.id),'[]'::jsonb) FROM lab_tasks t WHERE t.run_id=r.id) AS source_results
    FROM lab_runs r WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,[user.uid])).rows;}
  async function runDetail(user,id) {
    const target=await targetFor(user);
    const run=(await pool.query('SELECT * FROM lab_runs WHERE id=$1 AND user_id=$2',[id,user.uid])).rows[0];if(!run)throw fail(404,'Research run not found.');
    const tasks=(await pool.query('SELECT source,payload,status,result,started_at,completed_at,reserved_micros FROM lab_tasks WHERE run_id=$1 ORDER BY started_at NULLS LAST,id',[id])).rows;
    const companies=(await pool.query('SELECT name,website,location,distance_miles,industries,source,source_url,queued,skip_reason FROM lab_companies WHERE run_id=$1 ORDER BY queued DESC,distance_miles NULLS LAST,name',[id])).rows;
    // Where the people this run touched stand now, by this user's current assessment.
    const statuses=Object.fromEntries((await pool.query(`SELECT COALESCE(q.status,'unassessed') AS status,count(*)::int AS n FROM lab_run_leads l
      LEFT JOIN lab_qualification q ON q.lead_id=l.lead_id AND q.user_id=$2 AND q.rule_version='${qualificationVersion(target)}' WHERE l.run_id=$1 GROUP BY 1`,[id,user.uid])).rows.map(r=>[r.status,r.n]));
    return {run,tasks,costs:(await pool.query('SELECT * FROM lab_costs WHERE run_id=$1',[id])).rows,companies:companies.slice(0,200),
      funnel:run.kind==='discovery'?runFunnel({tasks,companies,statuses}):null};
  }
  async function cost(user,input) {
    await runDetail(user,input.run_id);
    if(!['provider','labor','infrastructure','subscription'].includes(input.category))throw fail(422,'Invalid cost category.');
    const amount=integer(input.amount_micros,0,100000000000,0),id=String(input.idempotency_key||randomUUID()).slice(0,160);
    await pool.query("INSERT INTO lab_costs(id,run_id,user_id,category,amount_micros,basis,note) VALUES($1,$2,$3,$4,$5,'self_reported',$6) ON CONFLICT(id) DO NOTHING",[`${user.uid}:${id}`,input.run_id,user.uid,input.category,amount,String(input.note||'').slice(0,500)]);
    return {saved:true};
  }
  async function metrics(user,days=14) {
    const target=await targetFor(user);
    days=integer(days,1,90,14);
    // Revalidate previously verified rows against live identity and expiry before reporting totals.
    let cursor='';
    for(;;) {
      const rows=(await pool.query(`SELECT d.id,d.payload,q.evaluated_at::text AS assessment_version FROM discovery_leads d JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2 AND q.rule_version='${qualificationVersion(target)}'
        WHERE ${visibleSQL} AND q.status='verified' AND d.id>$4 ORDER BY d.id LIMIT 100`,[TEAM,user.uid,user.email,cursor])).rows;
      if(!rows.length)break;
      const ids=rows.map(r=>r.id),obs=(await pool.query('SELECT lead_id,payload FROM lab_observations WHERE user_id=$1 AND lead_id=ANY($2::text[])',[user.uid,ids])).rows;
      // Preserve timestamp precision and only downgrade the exact assessment we read.
      for(const row of rows){const quality=assessLead({...parse(row.payload),id:row.id},obs.filter(o=>o.lead_id===row.id).map(o=>parse(o.payload)),{now:now(),target});if(quality.status!=='verified')await pool.query('UPDATE lab_qualification SET status=$1,score=$2,evaluated_at=now() WHERE lead_id=$3 AND user_id=$4 AND evaluated_at=$5::timestamptz AND status=\'verified\'',[quality.status,quality.score,row.id,user.uid,row.assessment_version]);}
      cursor=ids.at(-1);
    }
    const daily=(await pool.query(`WITH days AS (SELECT generate_series((now() AT TIME ZONE 'UTC')::date-($2::int-1),(now() AT TIME ZONE 'UTC')::date,'1 day'::interval)::date AS day),
      people AS (SELECT (r.created_at AT TIME ZONE 'UTC')::date AS day,count(DISTINCT l.lead_id) FILTER(WHERE r.kind='discovery' AND l.is_new)::int AS sourced,count(DISTINCT l.lead_id) FILTER(WHERE r.kind='import' AND l.is_new)::int AS imported FROM lab_runs r JOIN lab_run_leads l ON l.run_id=r.id WHERE r.user_id=$1 GROUP BY 1),
      verified AS (SELECT (first_verified_at AT TIME ZONE 'UTC')::date AS day,count(*)::int AS n FROM lab_qualification WHERE user_id=$1 AND status='verified' AND rule_version='${qualificationVersion(target)}' AND first_verified_at IS NOT NULL GROUP BY 1),
      costs AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,sum(amount_micros) AS micros FROM lab_costs WHERE user_id=$1 GROUP BY 1)
      SELECT d.day::text,COALESCE(p.sourced,0) AS new_sourced,COALESCE(p.imported,0) AS imported,COALESCE(v.n,0) AS newly_verified,COALESCE(c.micros,0) AS cost_micros FROM days d LEFT JOIN people p USING(day) LEFT JOIN verified v USING(day) LEFT JOIN costs c USING(day) ORDER BY d.day`,[user.uid,days])).rows;
    const inventory=(await pool.query(`SELECT COALESCE(q.status,'unassessed') AS status,count(*)::int AS n FROM discovery_leads d LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2 AND q.rule_version='${qualificationVersion(target)}' WHERE ${visibleSQL} GROUP BY 1`,[TEAM,user.uid,user.email])).rows;
    const sourceRows=(await pool.query(`SELECT t.source,count(*)::int AS attempts,count(*) FILTER(WHERE t.status IN ('failed','partial','skipped'))::int AS gaps,COALESCE(sum((t.result->>'added')::int),0)::int AS new_people,COALESCE(sum(t.reserved_micros),0) AS cost_micros,COALESCE(sum((t.result->>'duration_ms')::bigint),0) AS duration_ms FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id WHERE r.user_id=$1 AND r.created_at>=(((now() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC') GROUP BY t.source`,[user.uid,days])).rows;
    // Attribute each newly acquired person to its original source, never to every
    // repeated lookup. Qualified yield is a cohort outcome, not model accuracy.
    const cohorts=(await pool.query(`SELECT l.source,count(DISTINCT l.lead_id)::int AS acquired,
      count(DISTINCT l.lead_id) FILTER(WHERE q.status='verified' AND q.rule_version=$3)::int AS qualified
      FROM lab_run_leads l JOIN lab_runs r ON r.id=l.run_id
      LEFT JOIN lab_qualification q ON q.lead_id=l.lead_id AND q.user_id=r.user_id
      WHERE r.user_id=$1 AND l.is_new AND r.created_at >= (((now() AT TIME ZONE 'UTC')::date-($2::int-1))::timestamp AT TIME ZONE 'UTC')
      GROUP BY l.source`,[user.uid,days,qualificationVersion(target)])).rows;
    for(const c of cohorts) {
      let row=sourceRows.find(s=>s.source===c.source);
      if(!row){row={source:c.source,attempts:0,gaps:0,new_people:0,cost_micros:null,duration_ms:0};sourceRows.push(row);}
      row.acquired=c.acquired;row.qualified=c.qualified;
      row.qualification_rate=c.acquired?c.qualified/c.acquired:null;
      row.reserved_cost_per_qualified=c.qualified&&row.cost_micros!==null?Number(row.cost_micros)/1000000/c.qualified:null;
    }
    const sum=(k)=>daily.reduce((s,r)=>s+Number(r[k]),0),verified=sum('newly_verified'),costs=sum('cost_micros');
    const catalog=await catalogSummary(pool);
    return {daily,inventory,sources:sourceRows,catalog,period_days:days,totals:{new_sourced:sum('new_sourced'),imported:sum('imported'),newly_verified:verified,cost_usd:costs/1000000,cost_per_verified:verified?costs/1000000/verified:null,verified_per_calendar_day:verified/days},
      notes:['Newly verified counts each currently qualified person once under the current five-criterion rule. Expired, corrected and deleted records are excluded.','Source qualified yield measures the current qualification of new people acquired in this period; repeated lookups do not create new people. It is not a predictive accuracy estimate.','Imported records are separate from newly sourced people.','Costs include only recorded provider, labor, infrastructure and subscription amounts; unrecorded costs are unknown. Source costs show reserved provider charges only.','Nonverified inventory totals reflect the last assessment; run Assess saved leads to refresh all evidence. UTC calendar days.']};
  }
  async function importContacts(user,input) {
    if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>100||input.ids.some(id=>typeof id!=='string'||id.length>100))throw fail(422,'Select 1–100 directory contacts at a time.');
    const ids=[...new Set(input.ids)].sort();
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(505006)');
      const contacts=(await client.query('SELECT id,payload,updated_at FROM prospect_contacts WHERE user_id=$1 AND id=ANY($2::text[]) ORDER BY id FOR SHARE',[user.uid,ids])).rows;
      if(contacts.length!==ids.length)throw fail(404,'One or more directory contacts are unavailable.');
      // A suppressed selection must not create a prospect, but it may already
      // exist from an earlier CSV import. Bind its restriction only to a unique,
      // owned record with the same full name and a shared stable identifier.
      const restricted=contacts.filter(c=>c.payload.suppressed===true);
      const restrictionIds=new Set();
      if(restricted.length){
        const owned=(await client.query('SELECT id,payload FROM discovery_leads WHERE team=$1 AND (owner_user_id=$2 OR lower(owner_email)=lower($3))',[TEAM,user.uid,user.email])).rows.map(r=>({...r,lead:parse(r.payload)}));
        for(const c of restricted){
          const keys=new Set(candidateKeys(c.payload).filter(k=>k.startsWith('email:')||k.startsWith('linkedin:')));
          if(!keys.size)continue;
          const matches=owned.filter(r=>candidateKeys(r.lead).some(k=>keys.has(k)));
          if(matches.length!==1)continue;
          const match=matches[0];
          if(!nameKey(c.payload.first_name)||!nameKey(c.payload.last_name)||nameKey(match.lead.first_name)!==nameKey(c.payload.first_name)||nameKey(match.lead.last_name)!==nameKey(c.payload.last_name))continue;
          const linked=(await client.query('INSERT INTO advisor_contact_links(contact_id,lead_id,user_id) VALUES($1,$2,$3) ON CONFLICT(contact_id,user_id) DO NOTHING RETURNING lead_id',[c.id,match.id,user.uid])).rows;
          if(linked.length)restrictionIds.add(match.id);
        }
      }
      const restriction_links=restrictionIds.size;
      const key='directory:'+hash(JSON.stringify(contacts));
      const handoffIds=async()=>[...new Set((await client.query(`SELECT a.lead_id FROM advisor_contact_links a JOIN prospect_contacts p ON p.id=a.contact_id AND p.user_id=a.user_id WHERE a.user_id=$1 AND a.contact_id=ANY($2::text[]) AND COALESCE(p.payload->>'suppressed','false')!='true' ORDER BY a.contact_id`,[user.uid,ids])).rows.map(row=>row.lead_id))];
      const prior=(await client.query('SELECT id FROM lab_runs WHERE user_id=$1 AND idempotency_key=$2',[user.uid,key])).rows[0];if(prior)return {replayed:true,run:prior,restriction_links,lead_ids:await handoffIds()};
      const permitted=contacts.filter(c=>!c.payload.suppressed),run={id:randomUUID()};
      await client.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status) VALUES($1,$2,$3,'import',$4,'running')",[run.id,user.uid,user.email,key]);
      const candidates=permitted.map(c=>({...withDirectoryRestrictions(c.payload,[c.payload]),current_title:c.payload.title,source_names:['Contact directory: '+(c.payload.source||'reported identifiers')]}));
      const result=await saveCandidates(client,user,candidates,run,'Contact directory');
      const saved=(await client.query('SELECT d.id,d.payload FROM discovery_leads d JOIN lab_run_leads l ON l.lead_id=d.id WHERE l.run_id=$1',[run.id])).rows;
      let linked=0;
      for(const c of permitted){const keys=new Set(candidateKeys(c.payload));const matches=saved.filter(r=>candidateKeys(parse(r.payload)).some(k=>keys.has(k)));if(matches.length!==1)continue;
        await client.query('INSERT INTO advisor_contact_links(contact_id,lead_id,user_id) VALUES($1,$2,$3) ON CONFLICT(contact_id,user_id) DO UPDATE SET lead_id=EXCLUDED.lead_id',[c.id,matches[0].id,user.uid]);linked++;
      }
      await client.query("UPDATE lab_runs SET status='completed',message=$1,completed_at=now() WHERE id=$2",[JSON.stringify({...result,linked,restriction_links,suppressed:contacts.length-permitted.length}),run.id]);
      return {run,result,linked,restriction_links,suppressed:contacts.length-permitted.length,lead_ids:await handoffIds()};
    });
  }
  const advisor=createAdvisorWorkflow({pool,accessible,evaluate,transaction,visibleSQL,now,targetFor});
  async function route(request,user) {
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    const body=async()=>{try{return await request.json();}catch{throw fail(422,'Invalid JSON request.');}};
    if(path==='/api/lab/contact-import'&&request.method==='POST')return importContacts(user,await body());
    if(path==='/api/lab/worklist'&&request.method==='GET')return advisor.worklist(user,Object.fromEntries(url.searchParams));
    if(path==='/api/lab/enrichment-export'&&request.method==='POST')return advisor.exportEnrichment(user,await body());
    if(path==='/api/lab/scoreboard'&&request.method==='GET')return advisor.scoreboard(user,Object.fromEntries(url.searchParams));
    if(path==='/api/lab/advisor-profile'&&request.method==='GET')return advisor.profile(user);
    if(path==='/api/lab/advisor-profile'&&request.method==='POST')return advisor.saveProfile(user,await body());
    const relatedMatch=path.match(/^\/api\/lab\/leads\/([^/]+)\/related$/);
    if(relatedMatch&&request.method==='GET')return relatedPeople(user,decodeURIComponent(relatedMatch[1]));
    const activityMatch=path.match(/^\/api\/lab\/leads\/([^/]+)\/activity$/);
    if(activityMatch&&request.method==='GET')return advisor.detail(user,decodeURIComponent(activityMatch[1]));
    if(activityMatch&&request.method==='POST')return advisor.save(user,decodeURIComponent(activityMatch[1]),await body());
    if(path==='/api/lab/summary'&&request.method==='GET')return metrics(user,url.searchParams.get('days')||14);
    if(path==='/api/lab/sources'&&request.method==='GET')return {sources:SOURCE_CATALOG,readiness:sources.readiness};
    if(path==='/api/lab/settings'&&request.method==='GET')return settings(user);
    if(path==='/api/lab/settings'&&request.method==='PUT')return settings(user,await body());
    if(path==='/api/lab/leads'&&request.method==='GET')return list(user,Object.fromEntries(url.searchParams));
    if(path==='/api/lab/playbooks'&&request.method==='GET')return {playbooks:playbookChoices()};
    if(path==='/api/lab/runs'&&request.method==='GET')return {runs:await runs(user)};
    if(path==='/api/lab/runs'&&request.method==='POST')return enqueue(user,await body());
    if(path==='/api/lab/import'&&request.method==='POST')return importCSV(user,await body());
    if(path==='/api/lab/costs'&&request.method==='POST')return cost(user,await body());
    if(path==='/api/lab/export'&&request.method==='POST') {
      const input=await body(),ids=cleanList(input.ids,1000);if(!ids.length)throw fail(422,'Select records to export (maximum 1,000).');
      const rows=[];for(const id of ids){const row=await detail(user,id);if(row.quality.status!=='excluded'&&(!input.verified_only||row.quality.status==='verified'))rows.push(row);}
      return new Response(researchCSV(rows),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="prospectpilot-research.csv"'}});
    }
    if(path==='/api/lab/identity-reviews'&&request.method==='GET')return identityReviews(user);
    const identityMatch=path.match(/^\/api\/lab\/identity-reviews\/([^/]+)$/);
    if(identityMatch&&request.method==='POST')return resolveIdentityReview(user,decodeURIComponent(identityMatch[1]),await body());
    const leadMatch=path.match(/^\/api\/lab\/leads\/([^/]+)(?:\/(review))?$/);
    if(leadMatch&&request.method==='GET'&&!leadMatch[2])return detail(user,decodeURIComponent(leadMatch[1]));
    if(leadMatch&&request.method==='DELETE'&&!leadMatch[2])return transaction(pool,client=>forgetPerson(client,user,{leadId:decodeURIComponent(leadMatch[1])},{contactKeys:identityLookupKeys}));
    if(leadMatch&&request.method==='POST'&&leadMatch[2])return review(user,decodeURIComponent(leadMatch[1]),await body());
    const runMatch=path.match(/^\/api\/lab\/runs\/([^/]+)$/);
    if(runMatch&&request.method==='GET')return runDetail(user,decodeURIComponent(runMatch[1]));
    throw fail(404,'Research endpoint not found.');
  }
  return {relatedPeople,importContacts,advisor,route,identityReviews,resolveIdentityReview,tick,scheduleDue,enqueue,importCSV,detail,list,review,metrics,settings,cost,runDetail};
}
