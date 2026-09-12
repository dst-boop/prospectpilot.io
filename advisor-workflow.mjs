import {randomUUID} from 'node:crypto';
import {assessLead, leadIdentity, hash, csvCell} from './lead-quality.mjs';

const parse=v=>typeof v==='string'?JSON.parse(v):v;
const fail=(status,message)=>Object.assign(Error(message),{status});
const fields={age:'Confirm current age',residence:'Confirm US residence',contact:'Verify contact ownership',retirement:'Ask about retained retirement assets and transfer eligibility',net_worth:'Obtain an authorized financial disclosure'};
const outcomes={no_answer:'Contacted',connected:'Contacted',follow_up:'Follow-up',meeting_booked:'Meeting Set',not_interested:'Not a Fit',do_not_contact:'Not a Fit',reopen:'Researching'};
export const workflowSignature=lead=>hash(JSON.stringify([leadIdentity(lead),lead.follow_up_status,lead.follow_up_date,lead.notes,lead.suppressed,lead.advisor_activity_id]));

export function nextAction(lead,quality,now=new Date()) {
  const due=lead.follow_up_date?new Date(lead.follow_up_date):null;
  const validDue=due&&Number.isFinite(due.getTime())?due.toISOString():null;
  const blocked=quality.status==='excluded'||lead.identity_status==='excluded';
  const contact=quality.gates.contact.state==='confirmed'&&!blocked&&quality.status!=='identity_review'?quality.gates.contact.evidence?.value:null;
  const base={contact:contact||null,signature:workflowSignature(lead),due_at:validDue,status:lead.follow_up_status||'New'};
  if(blocked)return {...base,bucket:'closed',rank:90,label:'Excluded from this campaign',reason:quality.warnings[0]||Object.values(quality.gates).find(g=>g.state==='failed')?.reason||'Identity excluded.',contact:null};
  if(quality.status==='identity_review')return {...base,bucket:'review',rank:55,label:'Resolve identity',reason:'Conflicting identifiers must be resolved before contact.',contact:null};
  if(lead.follow_up_status==='Not a Fit')return {...base,bucket:'closed',rank:90,label:'No further follow-up',reason:'Marked not interested or not a fit.',contact:null};
  if(lead.follow_up_status==='Meeting Set')return {...base,bucket:'meetings',rank:0,label:'Prepare for the meeting',reason:validDue&&due<now?'Meeting time has passed. Record the outcome or next follow-up.':'Review the evidence gaps before your conversation.'};
  if(validDue&&due<=now)return {...base,bucket:'due',rank:0,label:'Follow-up due',reason:contact?'Review the last conversation and use the agreed contact route.':'A follow-up is due; verify a contact route before using it.'};
  if(validDue)return {...base,bucket:'scheduled',rank:70,label:'Follow-up scheduled',reason:'This person returns to your due list at the saved time.'};
  if(contact&&quality.gates.age.state==='confirmed'&&quality.gates.residence.state==='confirmed')return {...base,bucket:'ready',rank:quality.status==='verified'?10:20,label:quality.status==='verified'?'Prepare an introductory conversation':'Confirm the remaining fit criteria',reason:quality.status==='verified'?'All five criteria have current reviewed evidence.':quality.gaps.map(g=>fields[g]).join('; ')+'.'};
  const gap=quality.gaps.includes('contact')?'contact':quality.gaps.find(g=>['age','residence'].includes(g))||quality.gaps[0];
  return {...base,bucket:gap==='contact'&&quality.gates.contact.state==='unknown'?'enrich':'review',rank:30+(100-quality.score)/10,label:fields[gap]||'Review this prospect',reason:quality.gates[gap]?.reason||'Review the saved evidence.',field:gap};
}

export function createAdvisorWorkflow({pool,accessible,evaluate,transaction,visibleSQL,now=()=>new Date()}) {
  async function detail(user,id) {
    const {lead}=await accessible(user,id);
    const rows=(await pool.query('SELECT payload FROM lab_observations WHERE lead_id=$1 AND user_id=$2',[id,user.uid])).rows;
    return {action:nextAction(lead,assessLead(lead,rows.map(r=>parse(r.payload)),{now:now()}),now()),
      activities:(await pool.query('SELECT outcome,note,next_at,created_at FROM advisor_activities WHERE lead_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[id])).rows};
  }
  async function worklist(user,{view='today',search='',offset=0,limit=24}={}) {
    if(!['today','ready','due','review','enrich','scheduled','meetings','closed','all'].includes(view))throw fail(422,'Choose a worklist view.');
    offset=Number(offset);limit=Number(limit);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail(422,'Invalid worklist page.');
    const term=String(search).trim().slice(0,100).replace(/[%_\\]/g,'');
    const rows=(await pool.query(`SELECT d.id,d.payload,EXISTS(SELECT 1 FROM advisor_contact_links acl JOIN prospect_contacts pc ON pc.id=acl.contact_id AND pc.user_id=acl.user_id WHERE acl.lead_id=d.id AND pc.payload->>'suppressed'='true') AS linked_suppressed,count(*) OVER()::int AS scope_total FROM discovery_leads d
      LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2
      WHERE ${visibleSQL} AND ($4='' OR concat_ws(' ',d.payload::jsonb->>'first_name',d.payload::jsonb->>'last_name',d.payload::jsonb->>'company') ILIKE $4)
      ORDER BY d.payload::jsonb->>'follow_up_date' ASC NULLS LAST,q.score DESC NULLS LAST,d.id LIMIT 2000`,['wealth-management',user.uid,user.email,term?`%${term}%`:''])).rows;
    const records=rows.length?(await pool.query('SELECT lead_id,payload FROM lab_observations WHERE user_id=$1 AND lead_id=ANY($2::text[])',[user.uid,rows.map(r=>r.id)])).rows:[];
    const observations=new Map();for(const r of records){if(!observations.has(r.lead_id))observations.set(r.lead_id,[]);observations.get(r.lead_id).push(parse(r.payload));}
    const all=rows.map(r=>{const lead={...parse(r.payload),id:r.id,...(r.linked_suppressed?{suppressed:true}:{})},quality=assessLead(lead,observations.get(r.id)||[],{now:now()});
      return {lead:{id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,current_title:lead.current_title,location:lead.location||[lead.city,lead.state].filter(Boolean).join(', '),notes:lead.notes||''},quality,action:nextAction(lead,quality,now())};});
    all.sort((a,b)=>a.action.rank-b.action.rank||(a.action.due_at||'').localeCompare(b.action.due_at||'')||b.quality.score-a.quality.score||a.lead.id.localeCompare(b.lead.id));
    const counts={today:0,ready:0,due:0,review:0,enrich:0,scheduled:0,meetings:0,closed:0,all:all.length};
    for(const r of all){counts[r.action.bucket]++;if(['due','ready','review','enrich'].includes(r.action.bucket))counts.today++;}
    const filtered=all.filter(r=>view==='all'||(view==='today'?['due','ready','review','enrich'].includes(r.action.bucket):r.action.bucket===view));
    const activity=(await pool.query(`SELECT count(*)::int AS attempts,count(*) FILTER(WHERE a.outcome IN ('connected','follow_up','meeting_booked'))::int AS conversations,
      count(DISTINCT a.lead_id) FILTER(WHERE a.outcome='meeting_booked')::int AS meetings FROM advisor_activities a
      JOIN discovery_leads d ON d.id=a.lead_id WHERE a.user_id=$2 AND ${visibleSQL}
      AND a.created_at >= $4::timestamptz AND a.outcome IN ('no_answer','connected','follow_up','meeting_booked')`,['wealth-management',user.uid,user.email,new Date(now().getTime()-7*86400000).toISOString()])).rows[0];
    return {items:filtered.slice(offset,offset+limit),counts,total:filtered.length,offset,limit,activity,scope_total:rows[0]?.scope_total||0,scanned:rows.length,truncated:(rows[0]?.scope_total||0)>rows.length};
  }
  async function save(user,id,input) {
    if(!Object.hasOwn(outcomes,input.outcome))throw fail(422,'Choose a conversation outcome.');
    const key=String(input.idempotency_key||'');if(!key||key.length>160)throw fail(422,'An activity identifier is required.');
    const note=String(input.note||'').trim();if(note.length>2000)throw fail(422,'Keep the note under 2,000 characters.');
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(505006)');
      const {lead}=await accessible(user,id,client,true);
      const prior=(await client.query('SELECT id FROM advisor_activities WHERE lead_id=$1 AND user_id=$2 AND idempotency_key=$3',[id,user.uid,key])).rows[0];
      if(prior)return {saved:true,replayed:true};
    let next=null;if(input.next_at){const d=new Date(input.next_at);if(!Number.isFinite(d.getTime())||d<=now()||d.getUTCFullYear()>now().getUTCFullYear()+5)throw fail(422,'Choose a future follow-up time within five years.');next=d.toISOString();}
    if(['follow_up','meeting_booked'].includes(input.outcome)&&!next)throw fail(422,'Choose a date and time for the follow-up or meeting.');
    if(['not_interested','do_not_contact','reopen'].includes(input.outcome))next=null;

      if(input.signature!==workflowSignature(lead))throw fail(409,'This prospect changed. Close and reopen the record before saving. Your note has not been discarded.');
      if(lead.suppressed&&input.outcome!=='do_not_contact')throw fail(422,'This record is suppressed. This workflow cannot remove contact restrictions.');
      const activityId=randomUUID();
      lead.follow_up_status=outcomes[input.outcome];lead.follow_up_date=next;lead.advisor_activity_id=activityId;
      if(input.outcome==='do_not_contact'){lead.suppressed=true;await client.query("UPDATE prospect_contacts pc SET payload=jsonb_set(pc.payload,'{suppressed}','true'),updated_at=now() WHERE EXISTS(SELECT 1 FROM advisor_contact_links acl WHERE acl.contact_id=pc.id AND acl.user_id=pc.user_id AND acl.lead_id=$1)",[id]);}
      if(note)lead.notes=[lead.notes,`${now().toISOString()} · ${input.outcome.replaceAll('_',' ')}: ${note}`].filter(Boolean).join('\n');
      await client.query('UPDATE discovery_leads SET payload=$1,updated_at=now() WHERE id=$2',[JSON.stringify(lead),id]);
      await client.query('INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,note,next_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[activityId,id,user.uid,key,input.outcome,note,next,now().toISOString()]);
      await evaluate(user,lead,client);
      return {saved:true};
    });
  }
  async function exportEnrichment(user,input) {
    if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>1000)throw fail(422,'Select 1–1,000 prospects.');
    const rows=[];for(const id of [...new Set(input.ids)]){
      const {lead}=await accessible(user,id),{action}=await detail(user,id);if(action.bucket==='closed')continue;
      rows.push([lead.first_name,lead.last_name,lead.company,lead.current_title,lead.city,lead.state,lead.linkedin_url,action.label,'Reported identifiers only; verify ownership.']);
    }
    const csv='\uFEFF'+[['First Name','Last Name','Company Name','Job Title','City','State','LinkedIn URL','Research Task','Data Status'],...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="prospectpilot-enrichment.csv"'}});
  }
  return {worklist,detail,save,exportEnrichment};
}
