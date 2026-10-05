// Rollover playbooks: one-click starting points for finding people who may
// have a retirement account to move. Each one is a Research Lab configuration
// written as data, so the advisor only says where to look.
//
// A playbook decides which employers to research first. It never qualifies a
// person: an employer plan's average balance, a title or a graduation year is
// not evidence of anyone's own balance. The five gates still decide that.
// Every playbook uses free sources only, so starting one spends nothing.

const FREE_SOURCES = Object.freeze(['public_web', 'sec', 'warn']);

export const PLAYBOOKS = Object.freeze([
  {
    id: 'former_employees',
    label: 'Research employers with retained retirement accounts',
    accounts: ['401(k)', '403(b)'],
    triggers: ['Job change', 'Separation', 'Retirement'],
    // Public pages name current staff, not former ones: the plan data picks
    // employers where people leave with sizeable accounts behind.
    description: 'Employers whose plan filings show many former employees still holding accounts, averaging $100K or more. People found on company pages and SEC filings may be current staff. A personal job change, retained account and eligibility remain unconfirmed.',
    needs: 'states',
    configuration: {sources: FREE_SOURCES, plan_filter: {order: 'former_employees', min_average: 100000}},
  },
  {
    id: 'nonprofit_403b',
    label: 'Hospital, university and nonprofit staff',
    accounts: ['403(b)'],
    triggers: ['Separation', 'Age 59½ in-service', 'Hospital mergers'],
    description: '403(b) plans with large former-employee populations and an average account of $100K or more. Often overlooked.',
    needs: 'states',
    configuration: {sources: FREE_SOURCES, plan_filter: {kinds: ['403b'], order: 'former_employees', min_average: 100000}},
  },
  {
    id: 'in_service_595',
    label: 'Age 59½ while still working',
    accounts: ['401(k)', '403(b)'],
    triggers: ['Age 59½'],
    // Few filings report in-service distributions, so that is a preference,
    // never a filter. Reported ages under 59 are dropped; unknown ages stay
    // for review, since the age gate decides, not this list.
    description: 'Employers whose plans average $100K or more, favoring plans that report in-service withdrawals. Plan permission and individual eligibility still require confirmation. People whose reported age is under 59 are left out; anyone with no age yet is kept for your review.',
    needs: 'states',
    configuration: {sources: FREE_SOURCES, plan_filter: {min_average: 100000}, minimum_age: 59},
  },
  {
    id: 'business_owners',
    label: 'Small-business owners',
    accounts: ['SEP IRA', 'SIMPLE IRA', 'Solo 401(k)'],
    triggers: ['Business sale', 'Owner retiring'],
    description: 'Owners and partners of established local firms (medical, dental, legal, accounting, engineering, trades) found on their own websites.',
    needs: 'place',
    configuration: {
      sources: ['public_web'],
      industries: ['Medical practices', 'Dental practices', 'Legal services', 'Accounting', 'Engineering', 'Architecture', 'Construction', 'Insurance'],
      titles: ['Owner', 'Founder', 'Co-Founder', 'President', 'Partner', 'Managing Partner', 'Principal'],
    },
  },
]);

const BY_ID = new Map(PLAYBOOKS.map(p => [p.id, p]));

export function findPlaybook(id) {
  return BY_ID.get(String(id ?? '').trim()) || null;
}

// The advisor's input (states, place, companies per run) wins where it is
// given; the playbook fills in everything else. Employers named in the input
// are dropped: a playbook run finds its own.
export function applyPlaybook(input = {}) {
  const playbook = findPlaybook(input.playbook);
  if (!playbook) return input;
  const c = playbook.configuration;
  const location = playbook.needs === 'place' ? String(input.location ?? '').trim() : '';
  if (playbook.needs === 'place' && !location) throw Object.assign(Error('Enter a ZIP code or town to find business owners near.'), {status: 422});
  return {
    ...input,
    playbook: playbook.id,
    employers: [],
    websites: [],
    sources: c.sources,
    plan_filter: c.plan_filter || {},
    location,
    industries: location ? c.industries : [],
    titles: location ? c.titles : [],
    minimum_age: c.minimum_age || 0,
    daily_budget_micros: 0,
  };
}

// A reported age range ("55-64", "62", "60+") is below the floor only when
// its top is. No age, or an open-ended range, is never a reason to drop.
export function belowAgeFloor(range, floor) {
  if (!floor) return false;
  const text = String(range ?? '');
  const ages = (text.match(/\d{2,3}/g) || []).map(Number).filter(n => n >= 18 && n <= 110);
  if (!ages.length || /\+|or (older|more)|and (over|older)/i.test(text)) return false;
  return Math.max(...ages) < floor;
}

// What the client needs to draw the choices: no configuration internals.
export function playbookChoices() {
  return PLAYBOOKS.map(({id, label, accounts, triggers, description, needs}) => ({id, label, accounts, triggers, description, needs}));
}
