// An educated guess at a lead's age, from whatever the record already holds,
// so leads can be grouped and prioritised before anyone confirms an age.
//
// Every result is labelled with how it was reached. Only a reported age (a
// provider or a filing) counts as reported; everything else is inferred and
// shown as an estimate. None of it confirms the age gate, which still needs a
// reviewed source, and none of it may appear in outreach copy: age is
// demographic PII and messaging must never read as age-based targeting.

const text = v => String(v ?? '').trim();
const year = (v, now) => { const n = Number(String(v ?? '').match(/\b(19|20)\d{2}\b/)?.[0]); return n >= 1930 && n <= now ? n : null; };
const span = (v, max = 70) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };

// Bands follow rollover rules rather than round decades: 59½ is when money can
// usually move without a job change, 73 is when required distributions start.
export const AGE_BANDS = Object.freeze([
  {id: 'under_45', label: 'Under 45', min: 0, max: 44.99},
  {id: '45_54', label: '45–54', min: 45, max: 54.99},
  {id: '55_59', label: '55–59', min: 55, max: 59.49},
  {id: '60_64', label: '59½–64', min: 59.5, max: 64.99},
  {id: '65_73', label: '65–73', min: 65, max: 73.99},
  {id: '74_plus', label: '74+', min: 74, max: 120},
]);

// Where the classes this practice prefers to work with sit. Data, not code.
export const ALUMNI_CLASSES = Object.freeze({from: 1977, to: 1990});
const REUNIONS = [25, 30, 35, 40, 45, 50, 55];

const AGE = /\d{2,3}(?:\.\d+)?/g;
function parseAge(value) {
  const ages = (String(value ?? '').match(AGE) || []).map(Number).filter(n => n >= 18 && n <= 110);
  if (!ages.length) return null;
  const open = /\+|or (older|more)|and (over|older)/i.test(String(value));
  return {min: Math.min(...ages), max: open ? 110 : Math.max(...ages)};
}

// Every age a source supplied, not just the working value: providers that
// disagree must show as a conflict. estimated_age_range is reported when a
// source supplied it (SEC proxy, licensed export); an importer that derived
// it from a graduation year marks that evidence inferred.
function reported(lead) {
  const inferred = (lead.evidence || []).some(e => e?.field === 'estimated_age_range' && e.kind === 'inferred');
  const values = [...new Set([lead.estimated_age_range, ...(lead.field_values?.estimated_age_range || []).map(v => v?.value)].map(text).filter(Boolean))];
  return values.map(value => ({...parseAge(value), value})).filter(r => r.min != null)
    .map(r => ({min: r.min, max: r.max, kind: inferred ? 'inferred' : 'reported', confidence: inferred ? 0.55 : 0.8, detail: `Age reported as ${r.value}`}));
}

// The ranges each clue allows. Bachelor's graduates are usually 21–25; a first
// job usually starts at 20–26; time in a job sets a floor, never a ceiling.
function clues(lead, now) {
  const out = [];
  const grad = year(lead.graduation_year, now);
  if (grad) out.push({min: now - grad + 21, max: now - grad + 25, kind: 'inferred', confidence: 0.65, detail: `Graduation year ${grad}`});
  const start = year(lead.career_start_year, now);
  const experience = span(lead.years_of_experience);
  const first = start ?? (experience != null ? now - Math.floor(experience) : null);
  if (first) out.push({min: now - first + 20, max: now - first + 27, kind: 'inferred', confidence: start ? 0.6 : 0.5, detail: start ? `Career started ${start}` : `${Math.floor(experience)} years of experience`});
  const tenure = [span(lead.years_at_company), span(lead.years_in_current_role), lead.company_start_year && year(lead.company_start_year, now) ? now - year(lead.company_start_year, now) : null, lead.role_start_year && year(lead.role_start_year, now) ? now - year(lead.role_start_year, now) : null].filter(n => n != null);
  if (tenure.length) { const longest = Math.max(...tenure); if (longest >= 5) out.push({min: Math.floor(longest) + 21, max: 110, kind: 'inferred', confidence: 0.4, detail: `${Math.floor(longest)} years with the current employer`}); }
  return out;
}

const bandOf = age => [...AGE_BANDS].reverse().find(b => age >= b.min);

export function estimateAgeBand(lead = {}, {now = new Date()} = {}) {
  const current = now.getUTCFullYear();
  const direct = reported(lead);
  const ranges = direct.some(r => r.kind === 'reported') ? direct : [...direct, ...clues(lead, current)];
  const grad = year(lead.graduation_year, current);
  if (!ranges.length) return {status: 'unknown', band: null, label: 'Age unknown', basis: [], confidence: 0, inferred: false, ...cohort(null, null, grad, current), career_stage: careerStage(lead)};
  let min = Math.max(...ranges.map(r => r.min)), max = Math.min(...ranges.map(r => r.max));
  // Clues that disagree are not averaged away: the estimate widens to cover them.
  const conflict = min > max;
  if (conflict) { min = Math.min(...ranges.map(r => r.min)); max = Math.max(...ranges.map(r => r.max)); }
  min = Math.max(18, min); max = Math.min(110, max);
  const isReported = !conflict && ranges.every(r => r.kind === 'reported');
  // How much to lean on it, on the same scale as prospect-core's estimateAge:
  // the clues' own weights, a bonus when independent clues agree, and none
  // when they conflict.
  const confidence = conflict ? 0 : Math.min(0.95, Number((ranges.reduce((n, r) => n + r.confidence, 0) / ranges.length + (ranges.length > 1 ? 0.12 : 0)).toFixed(2)));
  const floorOnly = max >= 110;
  const low = bandOf(min), high = bandOf(max);
  const band = floorOnly ? low : low === high ? low : null;
  const label = floorOnly ? `${min} or older` : min === max ? `${min}` : `${min}–${max}`;
  return {
    status: conflict ? 'conflicting' : isReported ? 'reported' : ranges.length > 1 ? 'estimated' : 'rough_estimate',
    min, max: floorOnly ? null : max, confidence,
    label: conflict ? `${label} (sources disagree)` : isReported ? label : `About ${label} (estimated)`,
    band: band?.id ?? null, band_label: band ? band.label : `${low.label} to ${high.label}`,
    inferred: !isReported, basis: ranges.map(r => r.detail),
    rollover_stage: rolloverStage(min, floorOnly ? null : max),
    ...cohort(min, floorOnly ? null : max, grad, current),
    career_stage: careerStage(lead),
  };
}

// What the age may mean for moving money. Age alone never establishes a
// route: in-service rollovers need the plan's permission, so these stay
// conditional until plan evidence is reviewed.
function rolloverStage(min, max) {
  if (min >= 74) return '74+: required distributions may already apply';
  if (min >= 59.5) return 'Past 59½: an in-service rollover may be possible if the plan allows it';
  if (max != null && max < 55) return 'Below 55: a job change is the usual rollover moment';
  if (min >= 55 || (max != null && max >= 59.5)) return 'Near 59½: in-service options may open if the plan allows them';
  return 'Stage unclear';
}

// The graduating class, reported or estimated, and whether it falls in the
// preferred alumni window. A reunion is named only from a reported year.
function cohort(min, max, grad, current) {
  const window = ALUMNI_CLASSES;
  if (grad) {
    const next = REUNIONS.map(n => ({milestone: n, year: grad + n})).find(r => r.year >= current && r.year <= current + 1);
    return {class_year: grad, class_basis: 'reported', alumni_window: grad >= window.from && grad <= window.to ? 'yes' : 'no',
      reunion: next ? {year: next.year, milestone: next.milestone, label: `${next.milestone}th reunion in ${next.year}`} : null};
  }
  if (min == null) return {class_year: null, class_basis: null, alumni_window: 'unknown', reunion: null};
  // Class ≈ the year they turned 22.
  const from = max == null ? null : current - Math.ceil(max) + 22, to = current - Math.floor(min) + 22;
  const overlap = Math.max(0, Math.min(to, window.to) - Math.max(from ?? window.from, window.from) + 1);
  const width = from == null ? Infinity : to - from + 1;
  const alumni = overlap === 0 ? 'no' : overlap >= width * 0.5 ? 'likely' : 'possible';
  return {class_year: from == null ? `${to} or earlier` : from === to ? `${from}` : `${from}–${to}`, class_basis: 'estimated', alumni_window: alumni, reunion: null};
}

// When there is no age clue at all, the title still says something about how
// far into a career someone is. It is a category, never an age.
const SENIOR = /\b(chief|c[efiot]o|president|owner|founder|partner|principal|managing director|executive vice president|senior vice president|evp|svp|general counsel|treasurer|controller)\b/i;
const LEAD = /\b(vice president|vp|director|head of|superintendent|dean|professor|chair)\b/i;
const EARLY = /\b(intern|associate|assistant|junior|analyst|coordinator|trainee|apprentice)\b/i;
function careerStage(lead) {
  const title = text(lead.current_title);
  if (!title) return 'Unknown';
  if (SENIOR.test(title)) return 'Senior leadership';
  if (LEAD.test(title)) return 'Established leader';
  if (EARLY.test(title) && !/\b(senior|sr\.?|lead)\b/i.test(title)) return 'Early or mid career';
  return 'Mid or late career';
}
