import {assessRollover} from './rollover.mjs';
// Daily rollover leads: the deterministic half of the morning run.
//
// The morning routine asks ZoomInfo (search is free) for people with a
// rollover trigger, saves the raw responses, and hands them here. This module
// ranks, filters and deduplicates them, merges any enrichment, and writes the
// day's ProspectPilot CSV and digest. It never calls a provider and never
// decides to spend: the routine does that, inside the approved credit cap.
//
// A lead here is a *likely* rollover, never a verified one: no outside source
// shows a retirement balance. The advisor confirms that in conversation.

// A named, dated departure first; then long tenure at a large employer, the
// surest sign of a sizeable plan; then a past employer with no departure date.
export const TIERS = {
  D: {weight:20,label:'Reported retirement account'},
  E: {weight:5,label:'Preferred alumni audience'},
  F: {weight:15,label:'In-service review'},
  A: {weight: 40, label: 'Breaking: named departure'},
  C: {weight: 32, label: 'Long tenure at a large employer'},
  B: {weight: 26, label: 'Former large-employer staff, new role'},
};

// ZoomInfo responses can arrive double-encoded: parse until it is an object.
export function deepParse(value) {
  let out = value;
  for (let i = 0; i < 5 && typeof out === 'string'; i++) {
    try { out = JSON.parse(out); } catch { break; }
  }
  return out;
}

const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const nameKey = (first, last) => `${text(first).toLowerCase().split(' ')[0]}|${text(last).toLowerCase()}`;
const personId = value => /^-?\d{1,20}$/.test(String(value ?? '')) ? String(value) : '';
const isoDay = value => { const day = String(value ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) ? day : ''; };
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
const safeURL = value => { try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };

// Rows from a search_contacts response, with the `attributes` wrapper flattened.
export function contactRecords(response) {
  const data = deepParse(response)?.data;
  return (Array.isArray(data) ? data : []).map(row => ({id: row?.id, ...(row?.attributes || {})}));
}

// Scoops name a person and a dated, linked event. Only events that move money
// count: leaving an employer, retiring, or joining from elsewhere. Promotions,
// moves inside the same company and board seats leave the plan where it is.
// Company-level scoops (layoffs) name employers to search instead.
const SCOOP_KIND=(types,description,topics)=>{
  const retiring=/\bretir(e|es|ed|ing|ement)\b/i.test(description);
  if(types.includes('Left Company'))return retiring?{kind:'retiring',label:'Retiring',rank:3}:{kind:'left',label:'Left company',rank:3};
  if(retiring)return {kind:'retiring',label:'Retiring',rank:3};
  if(types.includes('Promotion')||types.includes('Lateral Move')||topics.includes('Board of Directors'))return null;
  if(types.includes('New Hire'))return {kind:'joined',label:'Joined a new employer',rank:1};
  return null;
};
// "Acme As previously announced, Jane Doe has left" reads "Jane Doe has left Acme".
export function cleanScoop(description,company){
  let t=text(description);
  if(company&&t.toLowerCase().startsWith(company.toLowerCase()+' '))t=t.slice(company.length+1);
  t=t.replace(/^as previously announced,?\s*/i,'').replace(/,\.$/,'.');
  t=t.replace(/\bthe (organization|company)\b/i,company||'$&');
  return t.charAt(0).toUpperCase()+t.slice(1);
}
export function scoopSignals(response) {
  const byPerson = new Map(), byName = new Map(), layoffEmployers = new Map();
  const data = deepParse(response)?.data;
  for (const row of Array.isArray(data) ? data : []) {
    const s = row?.attributes || {}, types = (s.types || []).map(t => t?.type), topics = (s.topics || []).map(t => t?.topic);
    const company = text(s.company?.name), date = isoDay(s.originalPublishedDate || s.publishedDate), url = safeURL(s.link) || safeURL(s.linkText);
    if (types.includes('Layoffs') && company) {
      // Bigger cuts first: the stated head count, the largest number next to a job word.
      const cut = Math.max(0, ...[...text(s.description).matchAll(/(\d[\d,]*)\s+(?:\w+\s+){0,2}(?:employees|workers|roles|positions|jobs|staff)/gi)].map(m => Number(m[1].replace(/,/g, ''))));
      if (!layoffEmployers.has(company) || cut > layoffEmployers.get(company)) layoffEmployers.set(company, cut);
    }
    const kind = SCOOP_KIND(types, text(s.description), topics);
    if (!kind) continue;
    for (const c of s.contacts || []) {
      const id = personId(c?.id);
      if (!id) continue;
      // The employer being left holds the plan; a joiner's old employer is unnamed.
      const signal = {type: kind.label, kind: kind.kind, employer: kind.kind === 'joined' ? '' : company, why: cleanScoop(s.description, company).slice(0, 400), date, url, strength: kind.rank};
      const better = prior => !prior || signal.strength > prior.strength || (signal.strength === prior.strength && signal.date > prior.date);
      if (better(byPerson.get(id))) byPerson.set(id, signal);
      const name = nameKey(c.firstName, c.lastName);
      if (text(c.lastName) && better(byName.get(name))) byName.set(name, signal);
    }
  }
  return {byPerson, byName, layoffEmployers: [...layoffEmployers].sort((a, b) => b[1] - a[1]).map(([name]) => name)};
}

// Seniority from the title: search results do not return a management level.
export function seniority(title) {
  const t = text(title).toLowerCase();
  // Staff roles that borrow an executive's title are not that executive.
  if (/\b(chief of staff|advisor to|assistant to|office of the)\b/.test(t)) return {rank: 18, label: 'Director'};
  if (/\b(chief|ceo|cfo|coo|cto|cio|president|founder|owner|partner)\b/.test(t) && !/\bvice president\b/.test(t)) return {rank: 25, label: 'C level'};
  if (/\b(vice president|vp|svp|evp)\b/.test(t)) return {rank: 22, label: 'VP'};
  if (/\b(director|head of)\b/.test(t)) return {rank: 18, label: 'Director'};
  if (/\b(manager|lead|principal|senior staff)\b/.test(t)) return {rank: 12, label: 'Manager'};
  return {rank: 6, label: 'Individual contributor'};
}

const NON_US = /\b(india|brazil|china|japan|korea|singapore|united kingdom|uk|europe|emea|apac|asia|asia pacific|canada|mexico|germany|france|australia|latin america|latam|middle east|africa|alaska|hawaii|puerto rico|venezuela|pakistan|afpak|argentina|colombia|chile|peru|philippines|vietnam|indonesia|malaysia|thailand|australia|new zealand|ireland|israel|uae|saudi|egypt|nigeria|kenya|south africa)\b/i;
function exclusion(candidate, config) {
  const companies = [candidate.company, candidate.signal?.employer].map(v => text(v).toLowerCase());
  const title = text(candidate.title).toLowerCase();
  // Word match, so Equitable Holdings is excluded and "equitably" is not.
  if ((config.exclude_companies || []).some(name => companies.some(c => new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(c)))) return 'Equitable or affiliate';
  if ((config.exclude_titles || []).some(fragment => title.includes(fragment.toLowerCase()))) return 'Works in financial advice';
  // The state filter can match a US headquarters; the title shows a post abroad.
  if (NON_US.test(title)) return 'Based outside the contiguous US';
  if (!candidate.has_mobile || !candidate.has_email) return 'ZoomInfo holds no mobile or no email';
  return '';
}

// One candidate per search row, carrying the trigger that found them.
export function candidatesFromSearch(file, scoops = new Map(), scoopNames = new Map()) {
  const meta = file?.meta || {};
  return contactRecords(file?.response).map(r => {
    // ZoomInfo sometimes answers with a newer profile id than the scoop names;
    // An unmatched id must be reviewed; a matching name cannot join a scoop.
    const id = personId(r.id), scoop = scoops.get(id);
    const signal = scoop || {type: meta.signal_type || (TIERS[meta.tier]?.label || 'Former employer'), employer: text(meta.employer), why: text(meta.why), date: isoDay(meta.date), url: safeURL(meta.url), layoff: meta.layoff === true};
    return {
      person_id: id, first_name: text(r.firstName), last_name: text(r.lastName), title: text(r.jobTitle),
      company: text(r.company?.name), company_id: personId(r.company?.id), accuracy: Number(r.contactAccuracyScore) || 0,
      has_mobile: r.hasMobilePhone === true, has_email: r.hasEmail === true,
      mobile_dnc: r.mobilePhoneDoNotCall === true, direct_dnc: r.directPhoneDoNotCall === true,
      updated: isoDay(r.lastUpdatedDate), tier: scoop ? 'A' : (meta.tier !== 'A' && TIERS[meta.tier] ? meta.tier : 'B'), signal,
    };
  }).filter(c => c.person_id && c.first_name && c.last_name);
}

// Four parts, kept apart so the review shows why a lead ranked where it did:
// the trigger (tier and how recent), seniority, data quality (accuracy and
// freshness) and whether the mobile can be called. Only the sort adds them.
export function scoreParts(candidate, today) {
  const age = candidate.signal?.date ? daysBetween(candidate.signal.date, today) : Infinity;
  return {
    trigger: TIERS[candidate.tier].weight + (age <= 7 ? 10 : age <= 30 ? 5 : 0),
    seniority: seniority(candidate.title).rank,
    data: Math.round(Math.max(0, Math.min(15, ((candidate.accuracy || 70) - 70) / 29 * 15)) + (candidate.updated && daysBetween(candidate.updated, today) <= 60 ? 5 : 0)),
    callable: candidate.mobile_dnc ? 0 : 5,
  };
}
export function score(candidate, today) {
  const parts = scoreParts(candidate, today);
  return parts.trigger + parts.seniority + parts.data + parts.callable;
}
export const rankBasis = parts => `Trigger ${parts.trigger}/50 · Seniority ${parts.seniority}/25 · Data ${parts.data}/20 · Callable ${parts.callable}/5${parts.rollover?` · Rollover evidence ${parts.rollover}/100`:""}`;

// ZoomInfo matches company names loosely, so a search for Cisco also returns
// Cisco Brewers. Long tenure only counts at the employer itself: the company
// id most of the exact-name matches share.
const companyKey = name => text(name).toLowerCase().replace(/[.,]/g, ' ').replace(/\b(the|inc|corp|corporation|co|company|llc|ltd|plc)\b/g, ' ').replace(/\s+/g, ' ').trim();
export function sameEmployerId(candidates, employer) {
  const tally = new Map(), key = companyKey(employer);
  for (const c of candidates) if (c.company_id && companyKey(c.company) === key) tally.set(c.company_id, (tally.get(c.company_id) || 0) + 1);
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Rank, filter, dedupe and spread across employers. No hard cap on the day:
// `target` is how many to hand over, and the advisor keeps what is good.
export function select(files, {config, ledger = new Set(), today, target = config.deliver_target}) {
  const scoopFiles = files.filter(f => f?.meta?.kind === 'scoops');
  const scoops = new Map(), scoopNames = new Map(), layoffEmployers = new Set();
  for (const f of scoopFiles) { const s = scoopSignals(f.response); for (const [id, sig] of s.byPerson) scoops.set(id, sig); for (const [n, sig] of s.byName) scoopNames.set(n, sig); s.layoffEmployers.forEach(e => layoffEmployers.add(e)); }
  const seen = new Map(), excluded = [], counts = {found: 0, already_delivered: 0, excluded: 0, duplicate: 0};
  const evidenceById=new Map();
  for(const f of files.filter(f=>f?.meta?.kind==='rollover_evidence')) for(const e of Array.isArray(f.evidence)?f.evidence:[]){const id=personId(e.person_id);if(id)evidenceById.set(id,[...(evidenceById.get(id)||[]),e]);}
  for (const f of files.filter(f => !['scoops','rollover_evidence'].includes(f?.meta?.kind))) {
    const found = candidatesFromSearch(f, scoops, scoopNames), employerId = f.meta?.tier === 'C' ? sameEmployerId(found, f.meta.employer) : null;
    for (const c of found) {
      counts.found++;
      if (ledger.has(c.person_id)) { counts.already_delivered++; continue; }
      const reason = f.meta?.tier === 'A' && c.tier !== 'A' ? 'Departure identity requires review' : f.meta?.tier === 'C' && c.company_id !== employerId ? 'Different company with a similar name' : exclusion(c, config);
      if (reason) { counts.excluded++; excluded.push({person_id: c.person_id, reason}); continue; }
      c.rollover_evidence=evidenceById.get(c.person_id)||[]; c.rollover=assessRollover(c,{today,target:config.rollover_target});
      c.parts = {...scoreParts(c, today),rollover:c.rollover.score}; c.score = c.parts.trigger + c.parts.seniority + c.parts.data + c.parts.callable + c.rollover.score;
      const prior = seen.get(c.person_id);
      if (prior) { counts.duplicate++; if (c.score <= prior.score) continue; }
      seen.set(c.person_id, c);
    }
  }
  const ranked = [...seen.values()].sort((a, b) => b.score - a.score || a.person_id.localeCompare(b.person_id));
  // Many employers, never one: a single-employer campaign needs firm pre-approval.
  const perEmployer = new Map(), picked = [], held = [];
  for (const c of ranked) {
    const key = text(c.signal?.employer || c.company).toLowerCase();
    const n = perEmployer.get(key) || 0;
    if (n >= config.per_employer_cap) { held.push(c); continue; }
    perEmployer.set(key, n + 1); picked.push(c);
  }
  const selected = picked.slice(0, target).map((c, i) => ({...c, rank: i + 1}));
  return {selected, counts: {...counts, eligible: ranked.length, employers: perEmployer.size, selected: selected.length, held_by_employer_cap: held.length}, excluded, layoff_employers: [...layoffEmployers]};
}

// Enrichment results, whatever envelope they arrive in: each successful
// contact is an object that carries the person's id and some contact fields.
export function enrichmentRecords(response) {
  const out = new Map(), root = deepParse(response);
  const visit = (node, inputId) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => visit(n, inputId)); return; }
    if (node.success === false) return;
    const id = personId(node.id ?? node.personId ?? node.input?.personId ?? inputId);
    const flat = {...node, ...(node.attributes || {})};
    if (id && ('mobilePhone' in flat || 'email' in flat || 'externalUrls' in flat)) { out.set(id, {...(out.get(id) || {}), ...flat}); return; }
    for (const [key, value] of Object.entries(node)) if (key !== 'input') visit(value, personId(node.input?.personId) || inputId);
  };
  visit(root, '');
  return out;
}

const linkedinFrom = urls => {
  for (const u of Array.isArray(urls) ? urls : []) {
    const url = safeURL(typeof u === 'string' ? u : u?.url);
    if (/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+\/?$/i.test(url)) return url.replace(/^http:/, 'https:');
  }
  return '';
};
// A number written with another country's code is not a US number, even when
// its digits happen to be ten long (+65 9138 0756).
const foreign = value => /^\s*\+(?!1\b|1[\s(-]|1\d{10}\b)/.test(String(value ?? ''));
const phone = value => { if (foreign(value)) return ''; const d = String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `+1${d}` : ''; };

// Years at the employer the trigger names, from the employment history, with
// overlapping entries merged; and when the last of those roles ended.
export function tenureAt(history, employer, today) {
  return stintAt(history, employer, today)?.years ?? null;
}
export function stintAt(history, employer, today) {
  const name = text(employer).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!name) return null;
  const spans = [];
  for (const job of Array.isArray(history) ? history : []) {
    const company = text(job?.company?.companyName || job?.companyName || job?.company?.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!company || !(company.includes(name) || name.includes(company))) continue;
    const from = isoDay(job.fromDate || job.startDate), to = isoDay(job.toDate || job.endDate) || today;
    if (from && to >= from) spans.push([from, to, !isoDay(job.toDate || job.endDate)]);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a[0].localeCompare(b[0]));
  let days = 0, [start, end] = spans[0];
  for (const [from, to] of spans.slice(1)) { if (from <= end) { if (to > end) end = to; } else { days += daysBetween(start, end); [start, end] = [from, to]; } }
  days += daysBetween(start, end);
  const last = spans.reduce((m, s) => s[1] > m ? s[1] : m, ''), current = spans.some(s => s[2]);
  return {years: Math.round(days / 365.25 * 10) / 10, first: spans[0][0], last, current};
}

export function whyNow(lead) {
  const s = lead.signal || {}, tenure = lead.tenure_years ? ` after ${lead.tenure_years} years` : '';
  if (['D','E','F'].includes(lead.tier)) return lead.rollover?.signals.map(s=>s.label).join(' ') || 'Review account and opportunity evidence before proceeding.';
  if (lead.tier === 'A' && s.why) return s.why;
  // A long-ago stint is history, not a recent departure: say when it was.
  if (lead.stint && !lead.stint.current && lead.tier !== 'C' && daysBetween(lead.stint.last, lead.today) > 730) return `Worked at ${s.employer} for ${lead.stint.years} years (${lead.stint.first.slice(0, 4)}–${lead.stint.last.slice(0, 4)}); now ${lead.title || 'in a new role'} at ${lead.company}. Ask whether that plan was ever moved.`;
  // ZoomInfo lists the role as current, but the history shows the stint ended:
  // say so rather than claim a long current tenure.
  if (lead.tier === 'C' && lead.stint && !lead.stint.current) return `ZoomInfo lists ${lead.title ? `${lead.title} at ` : ''}${s.employer || lead.company} as the current role, but the employment history shows ${lead.stint.years} years there ending ${lead.stint.last.slice(0, 4)}. Confirm on LinkedIn before calling.`;
  if (lead.tier === 'C') return `${lead.tenure_years ? `${lead.tenure_years} years at ${s.employer || lead.company}` : `In the current role at ${s.employer || lead.company} for 10 years or more`}${lead.title ? ` as ${lead.title}` : ''}.${s.layoff ? ` ${s.employer} announced layoffs this month.` : ''} In-service or separation rollover options may apply.`;
  // Without the employment history we know they worked there, not when they left.
  if (lead.tenure_years) return `Left ${s.employer}${tenure}; now ${lead.title || 'in a new role'} at ${lead.company}. Confirm whether an account remains with the former employer.`;
  return `Formerly at ${s.employer || 'a large employer'}; started as ${lead.title || 'a new role'} at ${lead.company} within the last 90 days. A workplace plan may be left behind.`;
}

// Merge enrichment into the selection. Nothing is dropped for a missing
// number: ZoomInfo holds both for everyone selected, so the advisor can fill
// them from ZoomInfo, and only a lead with both counts toward the day's goal.
export function finalize(selected, enrichment, {today}) {
  return selected.map(c => {
    const e = enrichment.get(c.person_id) || {};
    const lead = {...c, email: text(e.email).toLowerCase(), mobile: phone(e.mobilePhone), direct: phone(e.phone), linkedin_url: linkedinFrom(e.externalUrls),
      mobile_dnc: e.mobilePhoneDoNotCall === true || c.mobile_dnc, direct_dnc: e.directPhoneDoNotCall === true || c.direct_dnc,
      title: text(e.jobTitle) || c.title, company: text(e.companyName) || c.company};
    lead.stint = stintAt(e.employmentHistory, c.signal?.employer, today);lead.today = today;
    lead.tenure_years = lead.stint?.years ?? null;
    // A mobile with another country's code places the person abroad.
    lead.abroad = foreign(e.mobilePhone);
    lead.enriched = Boolean(lead.email && lead.mobile);
    // A successful enrichment is one ZoomInfo credit, recorded with the lead.
    lead.credits = enrichment.has(c.person_id) ? 1 : 0;
    lead.why_now = whyNow(lead)+(lead.rollover?' '+(lead.rollover.financial_status==='confirmed_100k_plus'?'Authorized evidence reports $100,000+ eligible to move.':'$100,000+ available to move remains unconfirmed.')+(lead.rollover.alumni_preference?' Matches the preferred 1977–1990 alumni audience.':''):'');
    lead.linkedin_search = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${lead.first_name} ${lead.last_name} ${lead.company}`)}`;
    return lead;
  });
}

// CSV cells are text, never formulas.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(s) && !/^\+1\d{10}$/.test(s) && !/^-?\d+$/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

// Column names the ProspectPilot importer already recognises as a ZoomInfo
// export, plus the signal columns it keeps with the contact.
export const CSV_HEADERS = ['First Name', 'Last Name', 'Job Title', 'Company Name', 'Email Address', 'Mobile Phone', 'Direct Phone Number', 'LinkedIn Contact Profile URL', 'Country',
  'ZoomInfo Contact ID', 'ZoomInfo Company ID', 'Contact Accuracy Score', 'Mobile Phone Do Not Call', 'Direct Phone Do Not Call', 'Previous Company Name',
  'Why Now', 'Signal Type', 'Signal Date', 'Signal Source URL', 'LinkedIn Search', 'Daily Rank', 'Delivery Date', 'Rank Basis', 'Enrichment Credits'];

export function toCSV(leads, {today}) {
  const rows = leads.map(l => [l.first_name, l.last_name, l.title, l.company, l.email, l.mobile, l.direct, l.linkedin_url, 'United States',
    l.person_id, l.company_id, l.accuracy || '', l.mobile_dnc ? 'true' : 'false', l.direct_dnc ? 'true' : 'false', l.tier === 'C' ? '' : l.signal?.employer || '',
    l.why_now, l.tier === 'A' && l.signal?.type ? l.signal.type : TIERS[l.tier].label, l.signal?.date || '', l.signal?.url || '', l.linkedin_search, l.rank, today, l.parts ? rankBasis(l.parts) : '', l.credits || 0]);
  return '﻿' + [CSV_HEADERS, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Previously delivered people, so nobody arrives twice within the window.
export function readLedger(csv, {today, days}) {
  const ids = new Set();
  for (const line of String(csv || '').split(/\r?\n/).slice(1)) {
    const [id, day] = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    if (personId(id) && isoDay(day) && daysBetween(day, today) <= days) ids.add(id);
  }
  return ids;
}
export function appendLedger(csv, leads, {today}) {
  const head = String(csv || '').trim() ? String(csv).replace(/\s+$/, '') : 'zoominfo_contact_id,delivered_on';
  return head + '\n' + leads.map(l => `${l.person_id},${today}`).join('\n') + '\n';
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// The digest names people and why they matter; phones and emails stay in the
// CSV on the shared drive and in ProspectPilot.
export function digest(leads, {today, counts, links = {}, goal}) {
  const ready = leads.filter(l => l.enriched).length, byTier = t => leads.filter(l => l.tier === t);
  const short = leads.length < goal ? `Short day: only ${leads.length} new prospects met the filters. ` : '';
  const summary = `${short}${leads.length} rollover prospects for ${today}: ${ready} with mobile and email, ${leads.length - ready} to enrich in ZoomInfo. Goal: ${goal} quality leads kept after your LinkedIn review.`;
  const section = (tier, rows) => rows.length ? `<h3 style="margin:18px 0 6px;color:#0c2149">${esc(TIERS[tier].label)} · ${rows.length}</h3><ol start="${rows[0].rank}" style="padding-left:22px;margin:0">${rows.map(l => `<li style="margin:4px 0"><b>${esc(l.first_name)} ${esc(l.last_name)}</b> — ${esc(l.title)}, ${esc(l.company)}<br><span style="color:#51607a">${esc(l.why_now)}</span>${l.signal?.url ? ` <a href="${esc(l.signal.url)}">Source</a>` : ''}</li>`).join('')}</ol>` : '';
  const html = `<div style="font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f1f3d;max-width:720px">
<p style="margin:0 0 4px;color:#1570ef;font-weight:700;letter-spacing:1px;font-size:12px">PROSPECTPILOT · DAILY LEADS</p>
<h2 style="margin:0 0 8px">${esc(summary)}</h2>
<p>${links.app ? `<a href="${esc(links.app)}" style="background:#1570ef;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none">Open Daily review</a>` : ''} ${links.csv ? `&nbsp; <a href="${esc(links.csv)}">Today's CSV</a>` : ''}</p>
<p style="color:#51607a;font-size:13px">Sourced ${counts.found} · already delivered before ${counts.already_delivered} · excluded ${counts.excluded} (Equitable, advisors, no mobile or email on file) · ${counts.employers} employers.</p>
${Object.keys(TIERS).map(t => section(t, byTier(t))).join('')}
<p style="color:#51607a;font-size:12px;margin-top:20px">Likely rollovers, not verified balances: confirm the account and amount in conversation. Nothing has been sent to anyone. Check do-not-call before phoning; mobile numbers carry stricter calling rules. Outreach templates need Equitable approval.</p></div>`;
  const plain = [summary, '', ...leads.map(l => `${l.rank}. ${l.first_name} ${l.last_name} — ${l.title}, ${l.company}. ${l.why_now}`)].join('\n');
  return {subject: `Daily leads ${today}: ${leads.length} rollover prospects (${ready} ready to call)`, html, text: plain, summary};
}
