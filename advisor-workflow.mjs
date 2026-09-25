import {randomUUID} from 'node:crypto';
import {assessLead, leadIdentity, hash, csvCell} from './lead-quality.mjs';
import {cadenceState, admitTouch, restPeriod, nextFollowUp, composeTouch, firstTouchSLA, dialBudget, TOUCH_OUTCOMES, INBOUND_OUTCOMES} from './outreach-cadence.mjs';
import {phoneReadiness} from './prospect-data-quality.mjs';

export function withDirectoryRestrictions(lead,contacts=[]) {
 const imported_dnc=new Set(lead.imported_dnc||[]);
 let suppressed=lead.suppressed===true;
 for(const contact of contacts||[]){const routes=phoneReadiness(contact);suppressed ||= contact.suppressed===true;if(routes.primary_blocked&&contact.phone)imported_dnc.add(contact.phone);if(routes.mobile_blocked&&contact.mobile_phone)imported_dnc.add(contact.mobile_phone);}
 return {...lead,suppressed,imported_dnc:[...imported_dnc]};
}

const parse=v=>typeof v==='string'?JSON.parse(v):v;
// Buckets where prospecting has finished. Neither may be offered a drafted touch
// or a next follow-up time: the draft is the words for an approach, and there is
// no approach to make. A client reaches this for a different reason than a closed
// record -- they signed rather than declined -- but the prospecting consequence
// is identical, so both are named here rather than checked one at a time.
const TERMINAL_BUCKETS=new Set(['closed','clients']);
const fail=(status,message)=>Object.assign(Error(message),{status});
const fields={age:'Confirm current age',residence:'Confirm US residence',contact:'Verify contact ownership',retirement:'Ask about retained retirement assets and transfer eligibility',net_worth:'Obtain an authorized financial disclosure'};
const outcomes={no_answer:'Contacted',connected:'Contacted',follow_up:'Follow-up',meeting_booked:'Meeting Set',
  // A booked meeting is an intention. Whether it happened is a separate fact,
  // and without it a show rate cannot be reported at all.
  meeting_held:'Met',no_show:'Follow-up',
  // The funnel ended at the second conversation, which measured whether the
  // work continued rather than whether it arrived anywhere. A prospect who
  // signs is the outcome every touch before it was for, and until it can be
  // recorded the cost of a source can only be stated per lead or per meeting.
  became_client:'Client',
  not_interested:'Not a Fit',do_not_contact:'Not a Fit',reopen:'Researching'};
export const workflowSignature=lead=>hash(JSON.stringify([leadIdentity(lead),lead.follow_up_status,lead.follow_up_date,lead.notes,lead.suppressed,lead.advisor_activity_id]));

export function nextAction(lead,quality,now=new Date(),cadence=null) {
  const due=lead.follow_up_date?new Date(lead.follow_up_date):null;
  const validDue=due&&Number.isFinite(due.getTime())?due.toISOString():null;
  const blocked=quality.status==='excluded'||lead.identity_status==='excluded';
  const contact=quality.gates.contact.state==='confirmed'&&!blocked&&quality.status!=='identity_review'?quality.gates.contact.evidence?.value:null;
  const base={contact:contact||null,signature:workflowSignature(lead),due_at:validDue,status:lead.follow_up_status||'New'};
  // Checked before the quality buckets, and before the closed one. A client who
  // later picks up a conflicting identifier from an import, or has a criterion
  // rejected, is still a client: letting review or closed win here would drop them
  // out of the Clients view, and -- because review is not terminal -- would put
  // them back into today's prospecting work with a drafted touch. The quality
  // problem is not swallowed, it is said in the reason instead.
  //
  // No contact shortcut either. The workspace would otherwise offer a Call or
  // Email button for outreach it has just said requires reopening first, and the
  // server would refuse the outcome that came back.
  if(lead.follow_up_status==='Client') {
    const warning=blocked?(quality.warnings[0]||Object.values(quality.gates).find(g=>g.state==='failed')?.reason||'This record is also excluded from the campaign.')
      :quality.status==='identity_review'?'Conflicting identifiers on this record still need review.':'';
    return {...base,bucket:'clients',rank:85,label:'Became a client',contact:null,
      reason:'Recorded as a client. Prospecting is finished for this person; reopen the record to work them again.'+(warning?' '+warning:'')};
  }
  if(blocked)return {...base,bucket:'closed',rank:90,label:'Excluded from this campaign',reason:quality.warnings[0]||Object.values(quality.gates).find(g=>g.state==='failed')?.reason||'Identity excluded.',contact:null};
  if(quality.status==='identity_review')return {...base,bucket:'review',rank:55,label:'Resolve identity',reason:'Conflicting identifiers must be resolved before contact.',contact:null};
  if(lead.follow_up_status==='Not a Fit')return {...base,bucket:'closed',rank:90,label:'No further follow-up',reason:'Marked not interested or not a fit.',contact:null};
  if(lead.follow_up_status==='Meeting Set')return {...base,bucket:'meetings',rank:0,label:'Prepare for the meeting',reason:validDue&&due<now?'Meeting time has passed. Record the outcome or next follow-up.':'Review the evidence gaps before your conversation.'};
  // Pacing outranks both readiness and any saved follow-up date: a person who
  // may not be contacted is not "due", whatever time is stored against them.
  if(cadence&&['resting','capped'].includes(cadence.status)&&!['Meeting Set','Not a Fit'].includes(lead.follow_up_status))
    return {...base,bucket:'resting',rank:80,label:cadence.status==='resting'?'Resting':'Rest period owed',reason:cadence.reason,cadence,due_at:cadence.resume_at||validDue};
  // A follow-up whose step cannot be acted on right now -- the calling window is
  // shut, or the day's dials are spent -- is still due, but it does not head a
  // list of things that can actually be done. Without this the saved date wins
  // and the worklist keeps offering the call after the budget is gone.
  if(validDue&&due<=now&&cadence?.step&&!cadence.step.ready&&cadence.step.due)
    return {...base,cadence,bucket:'due',rank:45,held:true,label:'Follow-up due, on hold',
      reason:cadence.step.hold||cadence.reason};
  if(validDue&&due<=now)return {...base,cadence,bucket:'due',rank:0,label:'Follow-up due',reason:contact?'Review the last conversation and use the agreed contact route.':'A follow-up is due; verify a contact route before using it.'};
  if(validDue)return {...base,cadence,bucket:'scheduled',rank:70,label:'Follow-up scheduled',reason:'This person returns to your due list at the saved time.'};
  if(contact&&quality.gates.age.state==='confirmed'&&quality.gates.residence.state==='confirmed')return {...base,cadence,bucket:'ready',rank:quality.status==='verified'?10:20,label:quality.status==='verified'?'Prepare an introductory conversation':'Confirm the remaining fit criteria',reason:quality.status==='verified'?'All five criteria have current reviewed evidence.':quality.gaps.map(g=>fields[g]).join('; ')+'.'};
  const gap=quality.gaps.includes('contact')?'contact':quality.gaps.find(g=>['age','residence'].includes(g))||quality.gaps[0];
  return {...base,cadence,bucket:gap==='contact'&&quality.gates.contact.state==='unknown'?'enrich':'review',rank:30+(100-quality.score)/10,label:fields[gap]||'Review this prospect',reason:quality.gates[gap]?.reason||'Review the saved evidence.',field:gap};
}

export function createAdvisorWorkflow({pool,accessible,evaluate,transaction,visibleSQL,now=()=>new Date()}) {
  // The advisor's own details, so a drafted message signs itself rather than
  // leaving the advisor to paste their name into every touch.
  async function profile(user) {
    const row=(await pool.query(`SELECT COALESCE(NULLIF(p.display_name,''),u.full_name,'') AS name,
      COALESCE(p.firm,'') AS firm,COALESCE(p.phone,'') AS phone,COALESCE(p.metro,'') AS metro,COALESCE(NULLIF(p.time_zone,''),'UTC') AS time_zone
      FROM (SELECT $1::text AS user_id) k
      LEFT JOIN advisor_profiles p ON p.user_id=k.user_id
      LEFT JOIN discovery_users u ON u.user_id=k.user_id`,[user.uid])).rows[0];
    return row||{name:'',firm:'',phone:'',metro:'',time_zone:'UTC'};
  }
  async function saveProfile(user,input) {
    const text=(v,max)=>String(v??'').trim().slice(0,max);
    // Only the fields the request carries are written; the rest keep what is
    // stored. The details form always sends all five, so it behaves as before.
    // What this allows is a one-field correction -- the browser's time zone,
    // which the page knows and nobody types -- without blanking the other four.
    const field=(key,max)=>Object.hasOwn(input,key)?text(input[key],max):null;
    // A zone the runtime does not recognize would silently move the day
    // boundary, so an unusable one leaves the stored zone alone rather than
    // replacing a working one with UTC.
    let zone=null;
    if(Object.hasOwn(input,'time_zone')){const candidate=text(input.time_zone,64);
      try{new Intl.DateTimeFormat('en-CA',{timeZone:candidate});zone=candidate;}catch{}}
    const values=[user.uid,field('display_name',120),field('firm',120),field('phone',40),field('metro',80),zone];
    await pool.query(`INSERT INTO advisor_profiles(user_id,display_name,firm,phone,metro,time_zone)
      SELECT $1::text,COALESCE($2::text,p.display_name,''),COALESCE($3::text,p.firm,''),
        COALESCE($4::text,p.phone,''),COALESCE($5::text,p.metro,''),COALESCE($6::text,p.time_zone,'UTC')
      FROM (SELECT $1::text AS user_id) k LEFT JOIN advisor_profiles p ON p.user_id=k.user_id
      ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,firm=EXCLUDED.firm,phone=EXCLUDED.phone,metro=EXCLUDED.metro,time_zone=EXCLUDED.time_zone,updated_at=now()`,values);
    return profile(user);
  }
  async function dialsToday(user,client=pool) {
    const zone=(await profile(user)).time_zone||'UTC';
    const since=new Date(now().getTime()-2*86400000).toISOString();  // two days covers any zone offset
    // Every dial, not only the ones that count as a touch. A call that ended in
    // "not interested" still put volume on the number, which is what a carrier
    // is measuring; excluding it would undercount the budget it protects.
    //
    // A call the prospect placed is the exception: it left from their number, so
    // it earns this line no reputation and spends none of its allowance.
    const rows=(await client.query(`SELECT created_at FROM advisor_activities
      WHERE user_id=$1 AND channel='phone' AND direction IS DISTINCT FROM 'inbound'
        AND created_at >= $2::timestamptz`,
      [user.uid,since])).rows;
    return dialBudget(rows.map(r=>({outcome:'no_answer',channel:'phone',created_at:r.created_at})),{now:now(),zone});
  }
  // `at` lets a caller inside a transaction judge the record against the same
  // instant it is writing, rather than a clock that has moved on since.
  // Pacing belongs to the prospect, not to whoever is looking at them. Six
  // touches in 45 days is a limit on how often this person is approached; read
  // per advisor it became a limit on how often each advisor approaches them, and
  // two people working one list could spend twelve approaches between them
  // without either seeing the other's. So the history here is the whole
  // record for the lead, whoever logged it, and the rest period in force is the
  // longest-standing one anybody opened.
  //
  // The daily dial budget stays per advisor, because that limit protects one
  // phone line's reputation rather than the person being called.
  async function cadenceFor(user,id,lead,quality,client=pool,dials=null,at=null) {
    const activities=(await client.query('SELECT outcome,channel,step,direction,created_at,user_id FROM advisor_activities WHERE lead_id=$1 ORDER BY created_at',[id])).rows;
    const rest=(await client.query('SELECT reason,resume_at FROM advisor_rest_periods WHERE lead_id=$1 ORDER BY resume_at DESC LIMIT 1',[id])).rows[0]||null;
    return withSharedHistory(user,activities,cadenceState({activities,lead,quality,rest,now:at||now(),dials}),client);
  }
  /**
   * Says when the budget in force was spent by somebody else.
   *
   * Without this a prospect reads as resting for reasons the advisor looking at
   * them cannot see, which invites exactly the workaround the limit exists to
   * prevent. Named rather than counted: a colleague is answerable, a number is not.
   */
  async function withSharedHistory(user,activities,state,client=pool) {
    // Exactly the touches the state counted, so the two numbers can never
    // disagree: first_at is the oldest one inside the current cycle's window, and
    // anything older belongs to a cycle that a reply or a completed rest closed.
    const from=state.touches?.first_at;
    const others=!from?[]:activities.filter(a=>a.user_id&&a.user_id!==user.uid
      &&TOUCH_OUTCOMES.has(a.outcome)&&a.direction!=='inbound'
      &&new Date(a.created_at)>=new Date(from));
    if(!others.length)return {...state,shared:null};
    const ids=[...new Set(others.map(a=>a.user_id))];
    const named=(await client.query("SELECT user_id,COALESCE(NULLIF(full_name,''),email) AS name FROM discovery_users WHERE user_id=ANY($1::text[])",[ids])).rows;
    const names=ids.map(uid=>named.find(r=>r.user_id===uid)?.name||'another advisor');
    return {...state,shared:{touches:others.length,advisors:names,
      reason:`${others.length} of these touches ${others.length===1?'was':'were'} logged by ${names.join(' and ')}. The limit is on how often this person is approached, not on how often you approach them.`}};
  }
  async function detail(user,id) {
    const {lead}=await accessible(user,id);
    const rows=(await pool.query('SELECT payload FROM lab_observations WHERE lead_id=$1 AND user_id=$2',[id,user.uid])).rows;
    const quality=assessLead(lead,rows.map(r=>parse(r.payload)),{now:now()});
    const cadence=await cadenceFor(user,id,lead,quality,pool,await dialsToday(user));
    const action=nextAction(lead,quality,now(),cadence);
    return {action,cadence,
      // The words for the next touch, not a description of them.
      draft:TERMINAL_BUCKETS.has(action.bucket)||!cadence.step?null:composeTouch(cadence.step,{lead,advisor:await profile(user),now:now(),sent:cadence.progress.done}),
      schedules:TERMINAL_BUCKETS.has(action.bucket)?null:nextFollowUp(cadence,{now:now()}),
      // This list has always carried every advisor's entries and never said so,
      // which reads as your own history and makes a shared cap inexplicable.
      // `by` is the colleague who logged it, and null when it was you.
      activities:(await pool.query(`SELECT a.outcome,a.channel,a.step,a.direction,a.note,a.next_at,a.created_at,
          CASE WHEN a.user_id=$2 THEN NULL ELSE COALESCE(NULLIF(u.full_name,''),u.email,'another advisor') END AS by
        FROM advisor_activities a LEFT JOIN discovery_users u ON u.user_id=a.user_id
        WHERE a.lead_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 30`,[id,user.uid])).rows};
  }
  async function worklist(user,{view='today',search='',offset=0,limit=24}={}) {
    if(!['today','ready','due','review','enrich','scheduled','meetings','resting','clients','closed','all'].includes(view))throw fail(422,'Choose a worklist view.');
    offset=Number(offset);limit=Number(limit);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail(422,'Invalid worklist page.');
    const term=String(search).trim().slice(0,100).replace(/[%_\\]/g,'');
    const rows=(await pool.query(`SELECT d.id,d.payload,(SELECT jsonb_agg(pc.payload) FROM advisor_contact_links acl JOIN prospect_contacts pc ON pc.id=acl.contact_id AND pc.user_id=acl.user_id WHERE acl.lead_id=d.id) AS linked_contacts,count(*) OVER()::int AS scope_total FROM discovery_leads d
      LEFT JOIN lab_qualification q ON q.lead_id=d.id AND q.user_id=$2
      WHERE ${visibleSQL} AND ($4='' OR concat_ws(' ',d.payload::jsonb->>'first_name',d.payload::jsonb->>'last_name',d.payload::jsonb->>'company') ILIKE $4)
      ORDER BY d.payload::jsonb->>'follow_up_date' ASC NULLS LAST,q.score DESC NULLS LAST,d.id LIMIT 2000`,['wealth-management',user.uid,user.email,term?`%${term}%`:''])).rows;
    const ids=rows.map(r=>r.id);
    const records=rows.length?(await pool.query('SELECT lead_id,payload FROM lab_observations WHERE user_id=$1 AND lead_id=ANY($2::text[])',[user.uid,ids])).rows:[];
    const observations=new Map();for(const r of records){if(!observations.has(r.lead_id))observations.set(r.lead_id,[]);observations.get(r.lead_id).push(parse(r.payload));}
    // Pacing for the whole page in two queries rather than two per prospect.
    // Every touch on these prospects, not only this advisor's: see cadenceFor.
    // The page has to pace on the same history the record does, or a prospect
    // capped by a colleague would be offered here as ready.
    const touched=rows.length?(await pool.query('SELECT lead_id,outcome,channel,step,direction,created_at,user_id FROM advisor_activities WHERE lead_id=ANY($1::text[]) ORDER BY created_at',[ids])).rows:[];
    const history=new Map();for(const a of touched){if(!history.has(a.lead_id))history.set(a.lead_id,[]);history.get(a.lead_id).push(a);}
    // The longest-standing rest anybody opened is the one in force.
    const rests=rows.length?(await pool.query(`SELECT DISTINCT ON (lead_id) lead_id,reason,resume_at FROM advisor_rest_periods
      WHERE lead_id=ANY($1::text[]) ORDER BY lead_id,resume_at DESC`,[ids])).rows:[];
    const resting=new Map(rests.map(r=>[r.lead_id,r]));
    // One budget for the whole page: the limit is per line, not per prospect.
    const dials=await dialsToday(user);
    // Directory restrictions are applied before anything is assessed or paced,
    // so a phone that became do-not-call in the directory is refused here too.
    const all=rows.map(r=>{const lead=withDirectoryRestrictions({...parse(r.payload),id:r.id},r.linked_contacts),quality=assessLead(lead,observations.get(r.id)||[],{now:now()});
      const cadence=cadenceState({activities:history.get(r.id)||[],lead,quality,rest:resting.get(r.id)||null,now:now(),dials});
      return {lead:{id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,current_title:lead.current_title,location:lead.location||[lead.city,lead.state].filter(Boolean).join(', '),notes:lead.notes||''},quality,action:nextAction(lead,quality,now(),cadence)};});
    all.sort((a,b)=>a.action.rank-b.action.rank||(a.action.due_at||'').localeCompare(b.action.due_at||'')||b.quality.score-a.quality.score||a.lead.id.localeCompare(b.lead.id));
    const counts={today:0,ready:0,due:0,review:0,enrich:0,scheduled:0,meetings:0,resting:0,clients:0,closed:0,all:all.length};
    for(const r of all){counts[r.action.bucket]++;if(['due','ready','review','enrich'].includes(r.action.bucket))counts.today++;}
    const filtered=all.filter(r=>view==='all'||(view==='today'?['due','ready','review','enrich'].includes(r.action.bucket):r.action.bucket===view));
    const activity=(await pool.query(`SELECT count(*) FILTER(WHERE a.direction IS DISTINCT FROM 'inbound')::int AS attempts,
      count(*) FILTER(WHERE a.outcome IN ('connected','follow_up','meeting_booked','meeting_held'))::int AS conversations,
      count(DISTINCT a.lead_id) FILTER(WHERE a.outcome='meeting_booked')::int AS meetings FROM advisor_activities a
      JOIN discovery_leads d ON d.id=a.lead_id WHERE a.user_id=$2 AND ${visibleSQL}
      AND a.created_at >= $4::timestamptz AND a.outcome = ANY($5::text[])`,['wealth-management',user.uid,user.email,new Date(now().getTime()-7*86400000).toISOString(),[...TOUCH_OUTCOMES]])).rows[0];
    return {items:filtered.slice(offset,offset+limit),counts,total:filtered.length,offset,limit,activity,dials,scope_total:rows[0]?.scope_total||0,scanned:rows.length,truncated:(rows[0]?.scope_total||0)>rows.length};
  }
  async function save(user,id,input) {
    if(!Object.hasOwn(outcomes,input.outcome))throw fail(422,'Choose a conversation outcome.');
    const key=String(input.idempotency_key||'');if(!key||key.length>160)throw fail(422,'An activity identifier is required.');
    const note=String(input.note||'').trim();if(note.length>2000)throw fail(422,'Keep the note under 2,000 characters.');
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(505006)');
      // One instant for the whole save. Two calls to the clock are two different
      // times, and the gap has teeth: a rest expired a millisecond after the
      // inbound contact that ended it becomes the later of the two marks
      // cycleStart compares, so the reply no longer sits on the cycle boundary,
      // cadenceState stops reading it as answered, and the prospect who just
      // called in is offered the opening step of a scripted sequence.
      const at=now(),stamp=at.toISOString();
      const {lead}=await accessible(user,id,client,true);
      const prior=(await client.query('SELECT id FROM advisor_activities WHERE lead_id=$1 AND user_id=$2 AND idempotency_key=$3',[id,user.uid,key])).rows[0];
      if(prior)return {saved:true,replayed:true};
    let next=null;if(input.next_at){const d=new Date(input.next_at);if(!Number.isFinite(d.getTime())||d<=at||d.getUTCFullYear()>at.getUTCFullYear()+5)throw fail(422,'Choose a future follow-up time within five years.');next=d.toISOString();}
    if(['follow_up','meeting_booked','no_show'].includes(input.outcome)&&!next)throw fail(422,'Choose a date and time for the follow-up or meeting.');
    if(['not_interested','do_not_contact','reopen','became_client'].includes(input.outcome))next=null;

      // Pacing is checked against the record as it stands, before this touch is
      // written, so a refusal reaches the advisor while it can still matter.
      const quality=assessLead(lead,(await client.query('SELECT payload FROM lab_observations WHERE lead_id=$1 AND user_id=$2',[id,user.uid])).rows.map(r=>parse(r.payload)),{now:at});
      const before=await cadenceFor(user,id,lead,quality,client,null,at);
      // Attendance is an outcome of something. Without this, Meeting held on an
      // untouched prospect would mark them Met, restart their touch budget and
      // add a held meeting to the show rate, all without a meeting.
      if(['meeting_held','no_show'].includes(input.outcome)) {
        // A no-show both settles the meeting that was missed and arranges its
        // replacement -- it carries a required new time -- so it nets out, and
        // a meeting is outstanding while more have been booked than held.
        // Counted across the record, like the pacing above: a meeting a
        // colleague booked with this person still happened, and attendance is a
        // fact about the prospect rather than about who typed it.
        const m=(await client.query(`SELECT count(*) FILTER(WHERE outcome='meeting_booked')::int AS booked,
          count(*) FILTER(WHERE outcome='meeting_held')::int AS held
          FROM advisor_activities WHERE lead_id=$1`,[id])).rows[0];
        if(m.booked<=m.held)throw fail(422,'Record the booked meeting first. Met and No-show describe a meeting that was arranged.');
      }
      // A client is not a prospect the advisor spoke to once. Requiring a
      // logged conversation keeps the strongest outcome in the report tied to
      // the work that produced it: without this, an untouched record -- or one
      // that never answered -- could be marked a client, and the meeting and
      // response rates would be measured against a funnel that skipped them.
      if(input.outcome==='became_client') {
        const spoke=(await client.query(`SELECT count(*)::int AS engaged FROM advisor_activities
          WHERE lead_id=$1 AND outcome=ANY($2::text[])`,
          [id,['connected','follow_up','meeting_booked','meeting_held']])).rows[0];
        if(!spoke.engaged)throw fail(422,'Record the conversation first. Client describes someone this firm has spoken with.');
      }
      // An outcome that is not an approach has no channel. Reopening a record
      // reaches nobody, and a client is a status the already-logged conversation
      // produced. The form hides the field for both, but the daily dial budget
      // counts every stored phone row whatever its outcome -- deliberately, so a
      // call that ended in "not interested" still counts against the number's
      // reputation -- so a channel arriving on one of these anyway would spend a
      // dial on a call that never happened. Dropped here rather than refused:
      // the outcome is right, only the field is meaningless.
      const channel=['reopen','became_client'].includes(input.outcome)?null:(input.channel??null);
      // Who started this contact. Only a conversation can be inbound: a missed
      // call from them is not an event, and attendance is mutual by the time it
      // happens and keeps its booking requirement.
      const inbound=input.direction==='inbound';
      if(inbound&&!INBOUND_OUTCOMES.has(input.outcome))
        throw fail(422,'Only Connected, Follow-up agreed and Meeting booked can record a contact the prospect started.');
      const direction=inbound?'inbound':null;
      let step=null;
      // The log closes at the client, and closes for everything rather than for
      // the touch outcomes alone. Every logged outcome sets the workflow status
      // from itself, so any of them moves a client back out of Client and into
      // the worklist: a touch makes them Contacted, "not interested" makes them
      // Not a Fit. Most also accept a channel, and the daily dial budget counts
      // every stored phone row whatever its outcome, so they spend a dial too.
      // Direction does not save an inbound one either -- pacing yields to a
      // contact the prospect started, but this is not a pacing question.
      //
      // Two exceptions, and only two. Reopen is the deliberate way back, and it
      // is the only one that should be needed. Do not contact is a consent
      // decision, and consent is never refused on the grounds of workflow state:
      // a client asking not to be contacted must be recordable the moment they
      // say it, without first being turned back into a prospect.
      if(lead.follow_up_status==='Client'&&!['reopen','do_not_contact'].includes(input.outcome))
        throw fail(422,'This person is recorded as a client. Choose Reopen for research first if you are prospecting them again.');
      if(TOUCH_OUTCOMES.has(input.outcome)) {
        const verdict=admitTouch(before,{channel,now:at,direction:inbound?'inbound':'outbound'});
        if(!verdict.ok)throw fail(verdict.status,verdict.reason);
        step=verdict.step;
        // The schedule is the application's to keep. An unanswered touch does
        // not ask the advisor for a date; the sequence already knows the next one.
        if(!next&&input.outcome==='no_answer')next=nextFollowUp(before,{now:at})?.at||null;
      }

      if(input.signature!==workflowSignature(lead))throw fail(409,'This prospect changed. Close and reopen the record before saving. Your note has not been discarded.');
      if(lead.suppressed&&input.outcome!=='do_not_contact')throw fail(422,'This record is suppressed. This workflow cannot remove contact restrictions.');
      const activityId=randomUUID();
      lead.follow_up_status=outcomes[input.outcome];lead.follow_up_date=next;lead.advisor_activity_id=activityId;
      if(input.outcome==='do_not_contact'){lead.suppressed=true;await client.query("UPDATE prospect_contacts pc SET payload=jsonb_set(pc.payload,'{suppressed}','true'),updated_at=now() WHERE EXISTS(SELECT 1 FROM advisor_contact_links acl WHERE acl.contact_id=pc.id AND acl.user_id=pc.user_id AND acl.lead_id=$1)",[id]);}
      if(note)lead.notes=[lead.notes,`${stamp} · ${input.outcome.replaceAll('_',' ')}: ${note}`].filter(Boolean).join('\n');
      await client.query('UPDATE discovery_leads SET payload=$1,updated_at=now() WHERE id=$2',[JSON.stringify(lead),id]);
      await client.query('INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,note,next_at,created_at,channel,step,direction) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[activityId,id,user.uid,key,input.outcome,note,next,stamp,channel,step,direction]);
      // A rest bounds how often this application approaches someone. They just
      // approached us, so the reason for it is gone. It ends now rather than
      // being deleted: the row is the boundary cycleStart reads to start the
      // next cycle here, and nothing in this workflow removes a rest period.
      // Every rest running on this person, not just this advisor's. The rest in
      // force may be a colleague's, and one row surviving would leave the
      // prospect resting after they asked to talk.
      if(inbound)await client.query('UPDATE advisor_rest_periods SET resume_at=$2 WHERE lead_id=$1 AND resume_at > $2',[id,stamp]);
      // Re-read the pacing with this touch included: reaching the limit opens the
      // rest period here rather than waiting for someone to notice the count.
      const after=await cadenceFor(user,id,lead,quality,client,null,at);
      const rest=restPeriod(after,{now:at});
      if(rest)await client.query(`INSERT INTO advisor_rest_periods(lead_id,user_id,reason,started_at,resume_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(lead_id,user_id) DO UPDATE SET reason=EXCLUDED.reason,started_at=EXCLUDED.started_at,resume_at=EXCLUDED.resume_at`,[id,user.uid,rest.reason,rest.started_at,rest.resume_at]);
      // Reopening changes workflow status, not pacing. Preserve active rests
      // and expired rows, which mark the boundary of the previous cycle.
      await evaluate(user,lead,client);
      return {saved:true,scheduled:next,resting_until:rest?.resume_at||null};
    });
  }
  async function exportEnrichment(user,input) {
    if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>1000)throw fail(422,'Select 1–1,000 prospects.');
    const rows=[];for(const id of [...new Set(input.ids)]){
      // Nobody pays a provider to enrich a record they have already closed, and
      // a client's details are the firm's to hold by then, not a research gap.
      const {lead}=await accessible(user,id),{action}=await detail(user,id);if(TERMINAL_BUCKETS.has(action.bucket))continue;
      rows.push([lead.first_name,lead.last_name,lead.company,lead.current_title,lead.city,lead.state,lead.linkedin_url,action.label,'Reported identifiers only; verify ownership.']);
    }
    const csv='\uFEFF'+[['First Name','Last Name','Company Name','Job Title','City','State','LinkedIn URL','Research Task','Data Status'],...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="prospectpilot-enrichment.csv"'}});
  }
  /**
   * The funnel, measured from what was actually logged.
   *
   * Every figure here is a count of recorded outcomes. Nothing is estimated: a
   * scoreboard that guessed would carry the most confident number on the page
   * and the only invented one. Where the record is incomplete the gap is
   * reported beside the rate rather than filtered out of it, because a rate
   * computed only over the rows somebody finished is the one shape of this
   * report that can look perfect while the work is not being done.
   */
  async function scoreboard(user,{days=30}={}) {
    days=Number(days);
    if(!Number.isSafeInteger(days)||days<1||days>365)throw fail(422,'Choose a window between 1 and 365 days.');
    const since=new Date(now().getTime()-days*86400000).toISOString();
    const rows=(await pool.query(`SELECT d.id,d.created_at AS added_at,
        -- Approaches only. A prospect who called in first did not make the
        -- service level: it measures whether the advisor reached them within a
        -- business day, and counting their call would report that as met on a
        -- prospect nobody had got to. Same for the touched population below.
        min(a.created_at) FILTER(WHERE a.outcome=ANY($5::text[]) AND a.direction IS DISTINCT FROM 'inbound') AS first_touch_at,
        count(a.id) FILTER(WHERE a.outcome=ANY($5::text[]) AND a.direction IS DISTINCT FROM 'inbound')::int AS touches,
        bool_or(a.outcome IN ('connected','follow_up','meeting_booked','meeting_held')) AS engaged,
        bool_or(a.outcome='meeting_booked') AS booked,
        -- A meeting whose time has not arrived is not yet a missed one.
        count(*) FILTER(WHERE a.outcome IN ('meeting_booked','no_show') AND a.next_at IS NOT NULL
          AND a.next_at < $6::timestamptz AND a.next_at >= $4::timestamptz)::int AS due_meetings
      FROM discovery_leads d LEFT JOIN advisor_activities a ON a.lead_id=d.id AND a.user_id=$2
      WHERE ${visibleSQL} GROUP BY d.id,d.created_at`,
      ['wealth-management',user.uid,user.email,since,[...TOUCH_OUTCOMES],now().toISOString()])).rows;
    // Every recorded attendance, dated by the meeting it settles rather than by
    // when somebody got round to logging it. An advisor who writes up Tuesday's
    // meetings on Friday would otherwise move them into Friday's window: a
    // meeting held 31 days ago and recorded today would land in a 30-day show
    // rate, and one held inside the window but recorded after it closed would
    // disappear from the period it belongs to.
    //
    // The meeting is the latest booked time that had already passed when the
    // outcome was logged. A record with no such booking -- attendance entered
    // ahead of the scheduled time -- is dated by the log, the earliest moment
    // the meeting is known to have happened.
    const settled=(await pool.query(`SELECT o.lead_id,o.outcome,
        COALESCE((SELECT max(b.next_at) FROM advisor_activities b
            WHERE b.lead_id=o.lead_id AND b.user_id=o.user_id AND b.outcome IN ('meeting_booked','no_show')
              AND b.next_at IS NOT NULL AND b.next_at <= o.created_at AND b.created_at <= o.created_at),
          o.created_at) AS met_at,
        EXISTS(SELECT 1 FROM advisor_activities n WHERE n.lead_id=o.lead_id AND n.user_id=o.user_id
          AND n.outcome='meeting_booked' AND n.created_at > o.created_at) AS booked_after
      FROM discovery_leads d JOIN advisor_activities o ON o.lead_id=d.id AND o.user_id=$2
      WHERE ${visibleSQL} AND o.outcome IN ('meeting_held','no_show')
      ORDER BY o.lead_id,o.created_at,o.id`,
      ['wealth-management',user.uid,user.email])).rows;
    // Every prospect recorded as a client, counted once, and dated by their
    // first conversion. There is no separate signing date to read: the record
    // says when somebody wrote it down, and dating the count by anything else
    // here would be a guess dressed as a measurement.
    //
    // Each lead's earliest conversion is found before the window is applied, not
    // after. A lead whose second conversion -- reopened, worked again, signed
    // again -- fell inside the window would otherwise be counted as a new client
    // in a period where nothing arrived, which is the one thing a conversion
    // count must not do. The consequence is deliberate: somebody who became a
    // client, was reopened and came back is counted in the period they first
    // arrived and not again, because it is the arrival being measured.
    const clients=(await pool.query(`SELECT count(*)::int AS total FROM (
        SELECT min(a.created_at) AS first_at
        FROM discovery_leads d JOIN advisor_activities a ON a.lead_id=d.id AND a.user_id=$2
        WHERE ${visibleSQL} AND a.outcome='became_client'
        GROUP BY a.lead_id
      ) conversions WHERE first_at >= $4::timestamptz`,
      ['wealth-management',user.uid,user.email,since])).rows[0].total;
    // Two populations, deliberately. The service level, the response rate and
    // meetings per 100 ask what became of the prospects added in this window,
    // so they are a cohort. The meeting rates ask what happened in this window,
    // whoever it happened to.
    const cohort=rows.filter(r=>new Date(r.added_at)>=new Date(since));
    const worked=cohort.filter(r=>r.touches>0);
    // Measured across every prospect whose deadline has passed, not only the
    // ones someone got to. Counting only those would report a perfect service
    // level while any number of prospects sat untouched past their deadline.
    const sla=cohort.map(r=>firstTouchSLA(r.added_at,r.first_touch_at,{now:now()})).filter(r=>r.measurable&&!r.pending);
    const met=sla.filter(r=>r.met).length;
    const rate=(n,d)=>d?Math.round(n/d*1000)/10:null;
    // Counted into this window by the meeting's own date, not the log's.
    const inWindow=settled.filter(r=>new Date(r.met_at)>=new Date(since));
    const held=inWindow.filter(r=>r.outcome==='meeting_held').length,noShows=inWindow.filter(r=>r.outcome==='no_show').length;
    // A meeting whose time has passed with neither outcome logged is not a
    // missed meeting and not a held one. It is an unfinished record, so it sits
    // beside the rate instead of quietly improving it.
    //
    // Clamped per prospect before summing. A rescheduled no-show gives one
    // person two outcomes against one booking, and a global subtraction would
    // let that surplus cancel somebody else's unresolved meeting.
    const resolved=new Map();for(const r of inWindow)resolved.set(r.lead_id,(resolved.get(r.lead_id)||0)+1);
    const unresolved=rows.reduce((t,r)=>t+Math.max(0,(r.due_meetings||0)-(resolved.get(r.id)||0)),0);
    // A second conversation is a meeting booked strictly after the first one was
    // held. Read from the log order, because that is what it is -- the next
    // meeting gets arranged during this one -- while the window it counts
    // towards is the first meeting's own date. Rows sharing an instant are not
    // counted, which under-reports rather than inventing a second conversation
    // out of the booking that produced the first.
    //
    // Only a prospect's first conversation qualifies. Someone first met months
    // ago is not a new first conversation because they were met again this
    // month; counting them would measure second-to-third and label it discovery.
    const first=new Map();for(const r of settled)if(r.outcome==='meeting_held'&&!first.has(r.lead_id))first.set(r.lead_id,r);
    const discovered=[...first.values()].filter(r=>new Date(r.met_at)>=new Date(since));
    const second=discovered.filter(r=>r.booked_after);
    return {window_days:days,since,
      added:cohort.length,worked:worked.length,
      // A prospect added but never touched is the gap the SLA exists to close,
      // so it is reported next to the hit rate rather than filtered out of it.
      untouched:cohort.length-worked.length,
      measured:[
        {id:'first_touch_sla',scope:'cohort',label:'First touch within one business day',value:rate(met,sla.length),unit:'%',
         basis:`${met} of ${sla.length} prospects whose first-touch deadline has passed`,target:95},
        {id:'reply_rate',scope:'cohort',label:'Prospects who responded',value:rate(worked.filter(r=>r.engaged).length,worked.length),unit:'%',
         basis:`${worked.filter(r=>r.engaged).length} of ${worked.length} prospects touched`,target:12},
        {id:'meetings_per_100',scope:'cohort',label:'Meetings booked per 100 prospects worked',value:rate(worked.filter(r=>r.booked).length,worked.length)===null?null:Math.round(worked.filter(r=>r.booked).length/(worked.length||1)*1000)/10,unit:'per 100',
         basis:`${worked.filter(r=>r.booked).length} of ${worked.length} prospects touched`,target:8},
        {id:'show_rate',scope:'activity',label:'Booked meetings that were held',value:rate(held,held+noShows),unit:'%',
         basis:`${held} held and ${noShows} not, of ${held+noShows} meetings with an outcome recorded`,target:80},
        {id:'second_meeting',scope:'activity',label:'First conversations that led to a second',value:rate(second.length,discovered.length),unit:'%',
         basis:`${second.length} of ${discovered.length} prospects you have met`,target:50},
        // A count, not a rate, and no target. A client signed this month was
        // very likely met before this window opened, so dividing by the people
        // added or met inside it would put an arrival over the wrong cohort and
        // read as a conversion rate this application cannot measure. Zero here
        // is a true zero -- no conversions were recorded -- rather than the
        // empty denominator the rates above have to report as unmeasured. No
        // target: a defensible one would come from the firm's own history.
        {id:'clients_recorded',scope:'conversions',label:'Clients recorded',value:clients,unit:'count',
         basis:`${clients} prospect${clients===1?'':'s'} recorded as a client, counted once each`,target:null},
      ],
      // Says which window each rate is drawn from, so "last 30 days" on the page
      // is not doing the work of two different meanings at once.
      scopes:{cohort:'Prospects added in this window',activity:'Meetings that happened in this window',
        conversions:'Clients recorded in this window, whenever they were first met'},
      meetings:{held,no_shows:noShows,
        // Named rather than counted, for the same reason as untouched prospects.
        awaiting_outcome:unresolved,
        note:unresolved?`${unresolved} meeting${unresolved===1?'':'s'} passed without Met or No-show recorded. The show rate does not count ${unresolved===1?'it':'them'} either way.`:''},
      unmeasured:[],
      basis:'Counted from manually logged outcomes. A touch or a meeting nobody logged is invisible here and to the pacing limits.'};
  }
  return {worklist,detail,save,exportEnrichment,profile,saveProfile,scoreboard,dialsToday};
}
