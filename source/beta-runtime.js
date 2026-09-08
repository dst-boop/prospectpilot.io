// Concatenated with the existing Worker: authentication and lead access stay server-side.
export function callWeek(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function callNumber(value) {
  const raw = String(value || '').trim();
  if (!/^[+\d().\s-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0' ? '+' + digits : '';
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15 && digits[0] !== '0') return '+' + digits;
  return '';
}

export function ageExplanation(lead) {
  const row = array(lead.evidence).findLast(e => e.field === 'estimated_age_range');
  if (!lead.estimated_age_range) return {range: '', basis: 'Age is not available.', source_url: ''};
  return {range: lead.estimated_age_range, basis: row?.kind === 'inferred'
    ? 'Estimated from a reported graduation year. People graduate at different ages; this is not a verified age.'
    : 'Imported estimate; the person’s age has not been independently verified.', source_url: safeTargetUrl(row?.source_url)?.href || ''};
}

export function callEligibility(lead, blocked = new Set()) {
  const phone = [lead.phone, lead.mobile_phone, lead.business_phone].map(callNumber).find(Boolean) || '';
  const reasons = qualifierCallReasons(lead);
  if ((lead.imported_dnc || []).some(value => callNumber(value) === phone)) reasons.push('Imported do-not-call restriction');
  if (!phone) reasons.push('No usable phone number');
  if (blocked.has(phone)) reasons.push('Do not call');
  const providerCheck=lead.wealthfeed_phone_checks?.[phone];
  if(providerCheck?.status==='blocked') reasons.push('WealthFeed reports do not call');
  if(providerCheck?.status==='unknown') reasons.push('Check do-not-call status');
  if (lead.identity_status !== 'matched') reasons.push('Check the person’s identity');
  if (['Not a Fit', 'Meeting Set', 'Nurture'].includes(lead.follow_up_status)) reasons.push('Removed from new calls');
  return {phone, ready: reasons.length === 0, reasons};
}

const CALL_OUTCOMES = new Set(['No answer', 'Voicemail', 'Spoke', 'Meeting booked', 'Wrong number', 'Do not call']);
export function matchesCallFocus(lead,preferences) {
  const titles=String(preferences.ideal_prospect || '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(titles.length && !titles.some(title=>String(lead.current_title || '').toLowerCase().includes(title)))return false;
  if (preferences.age_focus === '59half') {
    const ages=String(lead.estimated_age_range || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!ages.length || ages[0]>59.5 || (ages[1] ?? ages[0])<59.5) return false;
  }
  if(preferences.timely_focus !== 'all') {
    const cutoff=Date.now()-90*86400000;
    const found=array(lead.activity_signals).some(activity=>{
      const date=Date.parse(activity.occurred_at || '');
      return date>=cutoff && date<=Date.now() && safeTargetUrl(activity.source_url) && activity.kind === preferences.timely_focus;
    });
    if(!found)return false;
  }
  return true;
}
async function weeklyRoutes(request, env, user, path, url) {
  if (!path.startsWith('/api/beta/')) return null;
  const db = env.DB;
  const savedPreferences = await one(db,'SELECT location,age_focus,timely_focus,ideal_prospect FROM lead_call_preferences WHERE user_id=?',user.user_id);
  const preferences=savedPreferences || {location:'Long Island',age_focus:'all',timely_focus:'all',ideal_prospect:''};
  if(path==='/api/beta/preferences' && request.method==='GET')return json({preferences});
  if(path==='/api/beta/preferences' && request.method==='PUT') {
    const body=await requestJSON(request);
    if(!['Long Island'].includes(body.location) || !['all','59half'].includes(body.age_focus) || !['all','recent_job_change','retirement_announcement','liquidity_event','layoff'].includes(body.timely_focus))throw new HttpError(422,'Choose one of the available search options.');
    await execute(db,'INSERT INTO lead_call_preferences(user_id,location,age_focus,timely_focus,ideal_prospect,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET location=excluded.location,age_focus=excluded.age_focus,timely_focus=excluded.timely_focus,ideal_prospect=excluded.ideal_prospect,updated_at=excluded.updated_at',user.user_id,body.location,body.age_focus,body.timely_focus,text(body.ideal_prospect,300),now());
    return json({saved:true});
  }
  const visible = await visibleLeadRows(db, user);
  // An administrator's team visibility must never inflate their personal calling target.
  const owned = visible.filter(({row}) => row.owner_user_id === user.user_id || lower(row.owner_email) === lower(user.email));
  const blocks = new Set((await many(db, 'SELECT phone FROM lead_call_blocks')).map(row => row.phone));
  if (path === '/api/beta/week' && request.method === 'GET') {
    const week = callWeek();
    const records = await many(db, 'SELECT * FROM lead_call_records WHERE user_id=? AND week_start=? ORDER BY created_at DESC', user.user_id, week);
    const called = new Set(records.map(r => r.lead_id));
    const phoneSeen = new Set(owned.filter(({lead}) => called.has(lead.id)).map(({lead}) => callEligibility(lead).phone).filter(Boolean));
    const all = owned.map(({lead}) => ({...lead, call: callEligibility(lead, blocks), age: ageExplanation(lead)}));
    const ready = all.filter(lead => {
      if (!lead.call.ready || !matchesCallFocus(lead,preferences) || called.has(lead.id) || phoneSeen.has(lead.call.phone)) return false;
      phoneSeen.add(lead.call.phone); return true;
    }).sort((a,b) => (b.priority_score || 0) - (a.priority_score || 0));
    return json({preferences,week_start: week, week_timezone: 'UTC', goal: 500, called: called.size,
      attempts: records.length, ready: ready.length, shortfall: Math.max(0, 500 - called.size - ready.length),
      total_owned: owned.length, missing_phone: all.filter(l=>!l.call.phone).length,
      leads: ready.slice(0,500), history: records.slice(0,50).map(record => {const lead=owned.find(item=>item.lead.id===record.lead_id)?.lead;return {...record,name:lead ? `${lead.first_name} ${lead.last_name}` : 'Lead no longer assigned to you'};}),
      release: {ready: false, blockers: ['Automatic weekly lead delivery is not connected.', 'In-app calling is not connected.', '500 usable leads per person per week has not been verified.']}});
  }
  if (path === '/api/beta/calls' && request.method === 'POST') {
    const body = await requestJSON(request);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(body.id || '')) throw new HttpError(422, 'A valid call reference is required.');
    if (!CALL_OUTCOMES.has(body.outcome)) throw new HttpError(422, 'Choose a call result.');
    const item = owned.find(({lead}) => lead.id === body.lead_id);
    if (!item) throw new HttpError(404, 'This lead is not assigned to you.');
    const existing = await one(db, 'SELECT * FROM lead_call_records WHERE id=?', body.id);
    if (existing) {
      if (existing.user_id !== user.user_id || existing.lead_id !== body.lead_id || existing.outcome !== body.outcome) throw new HttpError(409, 'This call reference was already used.');
      return json({saved: true, id: existing.id});
    }
    const eligible = callEligibility(item.lead, blocks);
    if (!eligible.ready) throw new HttpError(422, eligible.reasons.join('. '));
    const statements = [db.prepare('INSERT INTO lead_call_records(id,user_id,lead_id,week_start,outcome,notes,created_at) VALUES(?,?,?,?,?,?,?)').bind(body.id,user.user_id,item.lead.id,callWeek(),body.outcome,text(body.notes,4000),now())];
    if (body.outcome === 'Do not call' || body.outcome === 'Wrong number') statements.push(db.prepare('INSERT OR IGNORE INTO lead_call_blocks(phone,lead_id,user_id,reason,created_at) VALUES(?,?,?,?,?)').bind(eligible.phone,item.lead.id,user.user_id,body.outcome,now()));
    if (body.outcome === 'Meeting booked') statements.push(db.prepare("UPDATE discovery_leads SET payload=json_set(payload,'$.follow_up_status','Meeting Set'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=?").bind(item.lead.id,TEAM));
    await db.batch(statements);
    return json({saved: true, id: body.id},201);
  }
  throw new HttpError(404, 'Page not found.');
}
