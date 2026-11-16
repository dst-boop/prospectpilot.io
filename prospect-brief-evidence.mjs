// This is a read-only explanation of existing evidence, never a qualification gate.
const FIELD_LABELS = {
  company: 'Employer', current_title: 'Role', city: 'Reported city', state: 'Reported state',
  age: 'Age', residence: 'US residence', contact: 'Contact ownership', planning_decision: 'Confirmed planning decision',
  retirement: 'Retirement assets and transfer eligibility', movable_assets: 'Retained assets eligible to move',
  net_worth: 'Disclosed net worth',
};
const PROFILE_FIELDS = ['company', 'current_title', 'city', 'state'];
const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => text(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function sourceURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function reviewedStatement(field, gate) {
  const value = gate.evidence?.value;
  if (field === 'contact') return 'Reviewed ' + value.channel + ' ownership: ' + value.address + '.';
  if (field === 'residence') return 'US residence recorded in the review.';
  if (field === 'age') return 'Age at observation: ' + value.min + (value.min === value.max ? '' : '-' + value.max) + ' years. ' + gate.reason;
  return gate.reason;
}
function citation(record, now) {
  const date = value => {
    // Date.parse normalizes impossible dates (February 30 becomes March 2).
    // Only accept an explicit ISO calendar date, optionally with an ISO time.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
    const day = value.slice(0, 10), midnight = Date.parse(day + 'T00:00:00Z');
    if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null;
    const at = Date.parse(value);
    return Number.isFinite(at) && at <= now.getTime() ? new Date(at).toISOString() : null;
  };
  return {
    source: text(record?.source) || 'Source not recorded',
    url: sourceURL(record?.source_url || record?.url),
    // Keep publication, observation, review and import dates distinct. A fresh
    // import or review must never make an undated source appear current.
    source_date: date(record?.source_date), observed_at: date(record?.observed_at),
    reviewed_at: date(record?.reviewed_at), first_seen: date(record?.first_seen), last_seen: date(record?.last_seen),
  };
}

export function briefEvidence(lead, quality, signal, event, now = new Date()) {
  const reviewed = [], reported = [], unknowns = [];
  const blockedIdentity = ['identity_review', 'excluded'].includes(quality.status);
  if (signal.kind === 'personal_event') {
    reviewed.push({field: 'personal_event', label: signal.label,
      statement: `${signal.type.replaceAll('_', ' ')} documented for ${signal.date}.`,
      event_date: signal.date, identity_basis: signal.identity_basis, citation: citation(event, now)});
    if (signal.rank !== 2) unknowns.push({field: 'personal_event', state: 'stale',
      reason: 'The event is outside the current worklist rules. Review the source and the person’s latest decision.'});
  } else if (signal.kind !== 'planning_decision') unknowns.push({field: 'personal_event', state: 'unknown',
    reason: 'No current reviewed personal event is recorded. An employer announcement does not establish that this person was affected.'});

  const required = quality.required_fields || Object.keys(quality.gates || {});
  for (const field of new Set([...required, 'retirement'])) {
    const gate = quality.gates?.[field];
    if (!gate) continue;
    const evidence = gate.evidence;
    if (!blockedIdentity && gate.state === 'confirmed' && evidence) {
      reviewed.push({field, label: FIELD_LABELS[field] || field, statement: reviewedStatement(field, gate),
        citation: citation(evidence, now)});
    } else {
      unknowns.push({field, state: gate.state, reason: blockedIdentity && gate.state === 'confirmed'
        ? 'This evidence does not clear the active identity or exclusion hold.' : gate.reason,
        citation: evidence ? citation(evidence, now) : null});
    }
  }

  for (const field of PROFILE_FIELDS) {
    // Never attach a company homepage or another field's URL to a claim. Only
    // citations explicitly recorded on this field/value travel with that claim.
    const records = [...(lead.field_values?.[field] || []), ...(lead.evidence || []).filter(e => e.field === field)];
    if (text(lead[field]) && !records.some(r => key(r.value) === key(lead[field]))) records.push({value: lead[field]});
    const seen = new Set();
    for (const record of records) {
      if (!text(record.value)) continue;
      const source = citation(record, now), signature = JSON.stringify([record.value, source]);
      if (seen.has(signature)) continue;
      seen.add(signature);
      reported.push({field, label: FIELD_LABELS[field], statement: record.value, citation: source});
    }
    if (new Set(records.map(r => key(r.value)).filter(Boolean)).size > 1) unknowns.push({field, state: 'conflicting',
      reason: `${FIELD_LABELS[field]} reports disagree. Review the original sources; the working value does not resolve the disagreement.`});
  }
  for (const reason of quality.warnings || []) unknowns.push({field: 'restriction', state: 'review', reason});
  if (quality.status === 'identity_review') unknowns.unshift({field: 'identity', state: 'review',
    reason: 'Conflicting identifiers must be resolved before relying on this brief or contacting the person.'});
  if (quality.status === 'excluded') unknowns.unshift({field: 'restriction', state: 'blocked',
    reason: 'This record is excluded or restricted. Research evidence does not remove the hold.'});
  return {as_of: now.toISOString(), reviewed, reported, unknowns,
    interpretation: signal.kind === 'planning_decision' ? 'The person confirmed a planning topic. Use their stated timing and review suitability through your firm.'
      : signal.kind === 'personal_event'
      ? 'A documented professional event may provide conversation context. It does not establish a financial need, account balance, transfer eligibility, or interest in advice.'
      : 'Employer and role information can guide further research. It does not establish a personal event, financial need, retirement assets, or interest in advice.',
    limits: 'Selection is a research priority, not a recommendation to transfer assets or permission to contact. Follow the saved next action and any contact or pacing restrictions. Nothing has been sent.'};
}
