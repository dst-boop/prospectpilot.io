// Legacy Lead Qualifier metadata is kept separately from the current app score.
export function qualifierMetadata(raw, get) {
  if (raw.qualifier) return raw.qualifier;
  const route = String(get('Route') || '').toUpperCase();
  const legacy = route || get('Age Basis') || get('Pipeline Score') || get('Qualifier Source');
  if (!legacy) return null;
  const number = value => value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const age = number(get('Age Estimate', 'age_estimate'));
  return {
    route: ['SELL','NURTURE','HOLD_UNKNOWN_AGE','DISQUALIFIED','DISQUALIFIED_UNDER_55'].includes(route) ? route : 'HOLD_UNKNOWN_AGE',
    age_estimate: age, age_basis: String(get('Age Basis') || 'UNKNOWN').toUpperCase(),
    maturity_date: String(get('Maturity Date') || ''),
    score: number(get('Pipeline Score', 'score')), tier: String(get('Pipeline Tier', 'tier') || ''),
    asset_estimate: number(get('Asset Estimate')), asset_basis: String(get('Asset Basis') || 'UNKNOWN'),
    dnc_status: String(get('DNC Status') || 'UNSCRUBBED').toUpperCase(),
    source: String(get('Qualifier Source') || 'Lead Qualifier').slice(0, 500),
  };
}

export function qualifierCallReasons(lead) {
  const q = lead.qualifier;
  if (!q) return [];
  const reasons = [];
  if (q.route !== 'SELL') reasons.push('Lead Qualifier: ' + q.route.replaceAll('_', ' ').toLowerCase());
  if (!Number.isFinite(q.age_estimate) || q.age_estimate < 59.5 || q.age_basis !== 'CONFIRMED') reasons.push('Verify age 59½ or older');
  if (q.maturity_date && (!Number.isFinite(Date.parse(q.maturity_date)) || Date.parse(q.maturity_date) > Date.now())) reasons.push('Maturity date has not been reached');
  if (q.dnc_status !== 'CLEAR') reasons.push('Lead Qualifier call screening: ' + q.dnc_status.toLowerCase());
  return reasons;
}
