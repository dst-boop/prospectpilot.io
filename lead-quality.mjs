import {createHash} from 'node:crypto';

export const QUALITY_VERSION = 'retirement-evidence-2';
export const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const clean = value => String(value ?? '').normalize('NFKC').trim();
export const nameKey = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export function publicURL(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
}
export function linkedinURL(value) {
  try { const url = new URL(value); return /(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/in\/[^/]+\/?$/i.test(url.pathname) && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? `https://www.linkedin.com${url.pathname.replace(/\/$/, '').toLowerCase()}` : ''; } catch { return ''; }
}
export function emailAddress(value) {
  const text = clean(value).toLowerCase();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(text) && text.length <= 254 ? text : '';
}
export function phoneNumber(value) {
  const digits = clean(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) && !/^(\d)\1+$/.test(digits) ? `+1${digits}` : '';
}
export function leadIdentity(lead) {
  return hash(JSON.stringify([nameKey(lead.first_name), nameKey(lead.last_name), nameKey(lead.company), linkedinURL(lead.linkedin_url), emailAddress(lead.email)]));
}
export function candidateKeys(lead) {
  const keys = [], linked = linkedinURL(lead.linkedin_url), email = emailAddress(lead.email);
  if (linked) keys.push(`linkedin:${linked}`);
  if (email && !/^(info|contact|office|admin|sales|support|hello|team|reception|service)@/.test(email)) keys.push(`email:${email}`);
  if (lead.first_name && lead.last_name && lead.company) keys.push(`person:${nameKey(lead.first_name)}|${nameKey(lead.last_name)}|${nameKey(lead.company)}|${nameKey(lead.state || lead.city)}`);
  if(lead.first_name&&lead.last_name)for(const value of [lead.phone,lead.business_phone,lead.mobile_phone]){const phone=phoneNumber(value);if(phone)keys.push(`person_phone:${nameKey(lead.first_name)}|${nameKey(lead.last_name)}|${phone}`);}
  return keys;
}
export const QUALITY_FIELDS = ['age', 'residence', 'retirement', 'contact', 'net_worth'];
const RETIREMENT_TYPES = new Set(['401k', '403b', 'governmental_457b', 'qualified_pension', 'profit_sharing', 'tsp']);
const IRA_TYPES = new Set(['traditional_ira', 'rollover_ira', 'roth_ira']);
const DISCLOSURES = new Set(['participant_disclosure', 'authorized_document']);
const ROUTES = new Set(['separated', 'in_service', 'plan_termination', 'other_confirmed']);
const excludedSource = value => /(^|[^a-z])(fec|familytreenow|fastpeoplesearch)([^a-z]|$)/i.test(value) || /fec\.gov/i.test(value);
const validDate = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; };

export function validateObservation(input, {userId, identity, now = new Date()} = {}) {
  if (!QUALITY_FIELDS.includes(input.field)) throw Object.assign(Error('Choose one of the five qualification criteria.'), {status: 422});
  if (!['confirmed', 'rejected', 'unknown'].includes(input.verdict)) throw Object.assign(Error('Choose confirmed, does not meet, or unknown.'), {status: 422});
  const source = clean(input.source).slice(0, 180), note = clean(input.note).slice(0, 1500), url = publicURL(input.url);
  const observed = validDate(input.observed_at);
  if (!source || !note || !observed || observed > now || observed < new Date('1900-01-01')) throw Object.assign(Error('Provide a source, evidence note, and valid observation date.'), {status: 422});
  if (input.url && !url) throw Object.assign(Error('The evidence URL must be an HTTP or HTTPS address.'), {status: 422});
  if (excludedSource(`${source} ${url}`)) throw Object.assign(Error('This source is not enabled for individual lead qualification. Use professional or participant-provided evidence.'), {status: 422});
  let value = input.value;
  if (input.verdict === 'confirmed') {
    if (input.field === 'age') {
      const min = Number(value?.min), max = Number(value?.max);
      if (value?.min==null || value?.max==null || value.min==='' || value.max==='' || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max > 120 || min > max) throw Object.assign(Error('Enter attained age in whole years or a supported whole-year range, from 0 to 120.'), {status: 422});
      value = {min, max};
    }
    if (input.field === 'residence') {
      if (!['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(clean(value?.country).toUpperCase()) || value?.scope !== 'residence') throw Object.assign(Error('Confirm the person’s US residence; a company office address is insufficient.'), {status: 422});
      value = {country: 'US', scope: 'residence'};
    }
    if (input.field === 'retirement') {
      if (!DISCLOSURES.has(value?.evidence_basis) || value?.consent_confirmed !== true) throw Object.assign(Error('Financial evidence requires participant disclosure or an authorized document and consent for this research use.'), {status: 422});
      const ira = IRA_TYPES.has(value?.account_type);
      if ((!ira && !RETIREMENT_TYPES.has(value?.account_type)) || (ira ? value?.route !== 'trustee_transfer' : !ROUTES.has(value?.route)) || value?.assets_confirmed !== true || value?.eligible_distribution !== true || value?.individual !== true) throw Object.assign(Error('Confirm retained individual assets and an eligible employer-plan distribution or IRA trustee-to-trustee transfer.'), {status: 422});
      if (ira && value?.destination_type !== (value.account_type === 'roth_ira' ? 'roth_ira' : 'traditional_ira')) throw Object.assign(Error('Confirm a matching IRA destination: Roth to Roth; traditional or rollover IRA to traditional. Conversions require separate review.'), {status: 422});
      if (value.route === 'in_service' && value.plan_permission !== true) throw Object.assign(Error('An in-service opportunity requires confirmation of this plan’s permission and the participant’s eligibility.'), {status: 422});
      value = {account_type: value.account_type, route: value.route, assets_confirmed: true, eligible_distribution: true, individual: true, plan_permission: value.plan_permission === true, destination_type: ira ? value.destination_type : null, evidence_basis: value.evidence_basis, consent_confirmed: true};
    }
    if (input.field === 'net_worth') {
      const lower = Number(value?.lower_bound_usd);
      if (value?.lower_bound_usd == null || value.lower_bound_usd === '' || !Number.isFinite(lower) || lower < 0 || lower > 1e12 || value?.excludes_home !== true || value?.net_of_liabilities !== true || !DISCLOSURES.has(value?.evidence_basis) || value?.consent_confirmed !== true) throw Object.assign(Error('Record a disclosed USD lower bound, excluding the home and net of liabilities, with an authorized evidence basis and research consent. Estimates from titles or property records are insufficient.'), {status: 422});
      value = {lower_bound_usd: lower, excludes_home: true, net_of_liabilities: true, evidence_basis: value.evidence_basis, consent_confirmed: true};
    }
    if (input.field === 'contact') {
      const normalized = value?.channel === 'linkedin' ? linkedinURL(value.address) : value?.channel === 'email' ? emailAddress(value.address) : value?.channel === 'phone' ? phoneNumber(value.address) : '';
      if (!normalized || value.identity_confirmed !== true) throw Object.assign(Error('Provide a valid personal professional profile, email, or US phone and confirm it belongs to this person.'), {status: 422});
      value = {channel: value.channel, address: normalized, identity_confirmed: true};
    }
  } else value = null;
  return {field: input.field, verdict: input.verdict, value, source, url, note, observed_at: observed.toISOString(), reviewed_at: now.toISOString(), reviewer: userId, identity_signature: identity};
}

export function assessLead(lead, observations = [], {now = new Date(), plans = []} = {}) {
  const identity = leadIdentity(lead), ageCandidate = clean(lead.estimated_age_range || lead.qualifier?.age_estimate || ''), warnings = [];
  const gate = (state, reason, evidence = null) => ({state, reason, evidence});
  const gates = {
    age: gate('unknown', ageCandidate ? `Reported or estimated age: ${ageCandidate}; source review needed.` : lead.graduation_year ? 'Graduation year is an age estimate, not proof of age.' : 'Age evidence missing.'),
    residence: gate('unknown', lead.location || lead.city || lead.state ? 'Location is present; confirm it is US residence.' : 'US residence evidence missing.'),
    retirement: gate('unknown', lead.former_employers?.length ? 'Previous employer reported; confirm retained assets and distribution eligibility.' : plans.length ? 'Employer plan found; individual participation and eligibility remain unknown.' : 'Individual employer-plan assets and distribution eligibility are unknown.'),
    contact: gate('unknown', 'A usable contact route is missing.'),
    net_worth: gate('unknown', 'Disclosed net worth excluding the home and net of liabilities is needed; minimum $250,000.'),
  };
  const channels = [...new Set([linkedinURL(lead.linkedin_url), emailAddress(lead.email), phoneNumber(lead.phone), phoneNumber(lead.business_phone), phoneNumber(lead.mobile_phone)].filter(Boolean))];
  if (channels.length) gates.contact = gate('candidate', `${channels.length} contact route(s) present; ownership and freshness need review.`);
  const ageNums = ageCandidate.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (ageNums.length && ageNums.every(n => n >= 45 && n <= 73)) gates.age.state = 'candidate';
  if (['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'].includes(clean(lead.country).toUpperCase()) || US_STATES.has(clean(lead.state).toUpperCase())) gates.residence.state = 'candidate';
  if (plans.length || lead.former_employers?.length) gates.retirement.state = 'candidate';
  for (const field of QUALITY_FIELDS) {
    const records = observations.filter(o => o.field === field).sort((a, b) => String(b.reviewed_at).localeCompare(String(a.reviewed_at)));
    const o = records[0];
    if (!o) continue;
    if (o.identity_signature !== identity) { warnings.push(`${field}: identity changed; review the evidence again.`); continue; }
    const date = validDate(o.observed_at), reviewed = validDate(o.reviewed_at);
    if (!date || !reviewed || reviewed > now || date > now || !o.reviewer || excludedSource(`${o.source} ${o.url}`)) continue;
    const ttl = field === 'age' ? 366 : 180;
    if (now - date > ttl * 86400000) { gates[field] = gate('stale', 'Evidence needs a fresh review.', o); continue; }
    if (o.verdict === 'rejected') { gates[field] = gate('failed', 'Reviewed evidence does not meet this criterion.', o); continue; }
    if (o.verdict !== 'confirmed') { gates[field] = gate('unknown', 'Reviewed; still unknown.', o); continue; }
    try {
      validateObservation(o, {userId: o.reviewer, identity, now});
      // Integer ages denote attained years at observation. Account for possible birthdays
      // since that date instead of silently keeping someone eligible after age 73.
      if (field === 'age') {
        const elapsed = (now - date) / (365.2425 * 86400000);
        const sameDay = now.toISOString().slice(0,10) === date.toISOString().slice(0,10);
        const min = o.value.min + Math.floor(elapsed), max = o.value.max + (sameDay ? 0 : Math.ceil(elapsed));
        if (min < 45 || max >= 74) { const outside = max < 45 || min >= 74; gates.age = gate(outside ? 'failed' : 'unknown', outside ? 'Age is outside 45–73.' : 'Age range or a possible birthday crosses a boundary; obtain current age evidence.', o); continue; }
      }
      if (field === 'net_worth' && o.value.lower_bound_usd < 250000) { gates.net_worth = gate('unknown', 'Disclosed lower bound does not establish at least $250,000 excluding the home.', o); continue; }
      gates[field] = gate('confirmed', field === 'retirement' ? 'Disclosed individual assets and transfer eligibility reviewed.' : field === 'net_worth' ? 'Disclosed net worth lower bound meets $250,000; home excluded and liabilities considered.' : 'Evidence reviewed.', o);
    } catch { gates[field] = gate('unknown', 'Evidence is incomplete or invalid; review again.', o); }
  }
  const confirmedContact=gates.contact.evidence?.value;
  if(confirmedContact?.channel==='phone'&&(lead.imported_dnc||[]).some(p=>phoneNumber(p)===confirmedContact.address))gates.contact=gate('failed','This phone has an existing do-not-call restriction.');
  const suppressed = lead.suppressed === true || /^(do not contact|do not call|opted out|deceased|suppressed)$/i.test(clean(lead.follow_up_status)) || lead.qualifier?.dnc_status === 'BLOCKED';
  if (suppressed) { gates.contact = gate('failed', 'An existing suppression or contact restriction is active.'); warnings.push('Research does not authorize outreach or remove suppression.'); }
  if (nameKey(lead.company).includes('equitable')) warnings.push('Equitable employees are excluded from lead output.');
  const identityConflict = lead.identity_status === 'review' && (lead.identity_conflicts || []).some(x => /different identifiers|conflict|ambiguous/i.test(x));
  const confirmed = Object.values(gates).filter(g => g.state === 'confirmed').length;
  const candidates = Object.values(gates).filter(g => g.state === 'candidate').length;
  const excluded = Object.values(gates).some(g => g.state === 'failed') || nameKey(lead.company).includes('equitable');
  const status = excluded ? 'excluded' : identityConflict ? 'identity_review' : confirmed === QUALITY_FIELDS.length ? 'verified' : confirmed + candidates >= 3 ? 'promising' : 'incomplete';
  return {version: QUALITY_VERSION, status, identity_signature: identity, score: excluded ? 0 : confirmed * 20 + candidates * 5, score_basis: 'Evidence completeness, not a calibrated probability or wealth estimate.', gates, channels, warnings, plans, gaps: QUALITY_FIELDS.filter(f => gates[f].state !== 'confirmed'), evaluated_at: now.toISOString()};
}

export function csvCell(value) {
  let s = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function researchCSV(rows) {
  const header = ['First Name', 'Last Name', 'Company', 'Title', 'Email', 'Phone', 'LinkedIn URL', 'Quality Status', 'Evidence Score', 'Age 45-73', 'US Residence', 'Transfer Eligibility', 'Contact', 'Net Worth Excluding Home >=250K', 'Missing Evidence', 'Source URLs', 'Research Only'];
  return '\uFEFF' + [header, ...rows.map(({lead, quality}) => [lead.first_name, lead.last_name, lead.company, lead.current_title, lead.email, lead.phone || lead.business_phone || lead.mobile_phone, lead.linkedin_url, quality.status, quality.score, ...QUALITY_FIELDS.map(f => quality.gates[f].state), quality.gaps.join('; '), QUALITY_FIELDS.map(f => quality.gates[f].evidence?.url).filter(Boolean).join('; '), 'Not a call list; existing suppression applies'])].map(row => row.map(csvCell).join(',')).join('\r\n');
}
