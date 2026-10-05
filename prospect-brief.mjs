// Research signals inform preparation, never asset or eligibility qualification.
export const EVENT_TYPES = ['job_change','separation','retirement','business_sale','merger'];
export function validatePersonalEvent(value, observed) {
  const date=Date.parse(value?.event_date||'');
  if(!EVENT_TYPES.includes(value?.type)||!Number.isFinite(Date.parse(observed))||!Number.isFinite(date)||date<Date.parse('1900-01-01')||date>Date.parse(observed)||value?.identity_confirmed!==true||String(value?.identity_basis||'').trim().length<12)
    throw Object.assign(Error('Provide an event type, past event date, and evidence matching this person by employer plus role or a professional identifier.'),{status:422});
  return {type:value.type,event_date:new Date(date).toISOString().slice(0,10),identity_confirmed:true,identity_basis:String(value.identity_basis).trim().slice(0,1000)};
}
export function prospectBrief(lead,quality,observations=[],now=new Date()) {
  const event=observations.filter(o=>o.field==='personal_event').sort((a,b)=>String(b.reviewed_at).localeCompare(String(a.reviewed_at)))[0];
  let valid=false;
  try { validatePersonalEvent(event?.value,event?.observed_at); const url=new URL(event.url);valid=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&event.verdict==='confirmed'&&!!event.identity_signature&&event.identity_signature===quality.identity_signature&&!!event.reviewer&&Date.parse(event.reviewed_at)<=now&&Date.parse(event.observed_at)<=now&&!['excluded','identity_review'].includes(quality.status); } catch {}
  const age=valid?(now-Date.parse(event.value.event_date))/86400000:Infinity;
  const fresh=valid&&age>=0&&age<=180&&(now-Date.parse(event.observed_at))/86400000<=180;
  const context=quality.plans?.length>0;
  const signal=valid?{kind:'personal_event',label:fresh?'Documented recent personal event':'Documented older personal event',type:event.value.type,date:event.value.event_date,source:event.source,url:event.url,note:event.note,identity_basis:event.value.identity_basis,rank:fresh?2:0}
    :{kind:context?'employer_context':'unconfirmed',label:context?'Employer-level context':'Unconfirmed research lead',rank:0,note:context?'An employer plan match provides research context. It does not establish a personal event or account balance.':'No current reviewed personal event is recorded. Employer and role alone do not establish a job change or rollover opportunity.'};
  const gate=quality.gates.contact, evidence=gate.evidence;
  const routes=[['email',lead.email],['phone',lead.phone||lead.business_phone],['phone',lead.mobile_phone],['linkedin',lead.linkedin_url]].filter(([,address])=>address);
  const seen=new Set();
  const contacts=routes.filter(([channel,address])=>{const key=channel+address;if(seen.has(key))return false;seen.add(key);return true;}).map(([channel,address])=>{
    const field=channel==='linkedin'?'linkedin_url':channel==='phone'?(address===lead.mobile_phone?'mobile_phone':'phone'):'email';
    const reports=(lead.field_values?.[field]||[]).filter(r=>r.value===address);
    return {channel,address,source:reports[0]?.source||'Source not recorded',observed_at:reports[0]?.source_date||reports[0]?.observed_at||null};
  });
  if(evidence?.value?.address&&!contacts.some(c=>c.address===evidence.value.address))contacts.unshift({...evidence.value,source:evidence.source,observed_at:evidence.observed_at});
  return {signal,contacts,contact_status:gate.state,contact_reason:gate.reason,qualification:quality.status==='verified'&&quality.target==='rollover_100k'?'Confirmed $100K+ opportunity':'Financial qualification not confirmed',questions:['What planning decisions are you considering?','Do you have retirement accounts you would like help reviewing?'],event_history:event?[event,...(event.previous_reviews||[])]:[]};
}
export function workflowViewMatches(view,bucket){
  return view==='all'||(view==='today'?['due','ready','review','enrich'].includes(bucket):view==='research'?['review','enrich'].includes(bucket):view==='followups'?['due','scheduled','meetings','resting'].includes(bucket):bucket===view);
}

export function contextualDraft(draft,brief){
  if(!draft||draft.step!=='opener'||draft.channel!=='email'||brief.signal.rank!==2)return draft;
  const event={job_change:'your recent role change',separation:'your recent departure',retirement:'your retirement announcement',business_sale:'the announced business sale',merger:'the announced change affecting your role'}[brief.signal.type];
  if(!event)return draft;
  return {...draft,body:draft.body.replace(/^(Hi[^\n]*\n\n)/,`$1I saw the announcement about ${event}.\n\n`),disclosure:`Uses a reviewed personal event dated ${brief.signal.date}. It makes no claim about account holdings or eligibility.`};
}
