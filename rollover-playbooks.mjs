// Rollover playbooks: one-click starting points for finding people who may
// have a retirement account to move. Each one is a Research Lab configuration
// written as data, so the advisor only says where to look.
//
// A playbook supplies employer and professional context for review.
// Every playbook starts with free sources.

const FREE_SOURCES = Object.freeze(['public_web', 'sec', 'warn']);

export const PLAYBOOKS = Object.freeze([
  {
    id: 'former_employees',
    label: 'Old workplace plans and job transitions',
    accounts: ['401(k)', '403(b)'],
    triggers: ['Job change', 'Separation', 'Retirement'],
    description: 'Find employers whose filings report significant former-participant populations. Check personal transition evidence and ask what the person wants to decide.',
    needs: 'states',
    configuration: {sources: FREE_SOURCES, plan_filter: {order: 'former_employees'}, news_terms: ['retirement','separation','job transition','pension election','plan termination']},
  },
  {
    id: 'nonprofit_403b',
    label: 'Hospital, university and nonprofit staff',
    accounts: ['403(b)'],
    triggers: ['Job transition', 'Retirement', 'Plan change'],
    description: 'Search 403(b) sponsors by their former-participant population and look for documented decisions around retirement or plan changes.',
    needs: 'states',
    configuration: {sources: FREE_SOURCES, plan_filter: {kinds: ['403b'], order: 'former_employees'}, news_terms: ['retirement','merger','pension','plan termination']},
  },
  {
    id: 'in_service_595',
    label: 'In-service plan decisions',
    accounts: ['401(k)', '403(b)'],
    triggers: ['Plan permits in-service distributions'],
    description: 'Find plans with reported in-service distributions. Review the applicable plan terms and the participant’s circumstances if they ask for advice.',
    needs: 'states',
    configuration: {sources: FREE_SOURCES, plan_filter: {in_service: true}, news_terms: ['in-service distribution','retirement plan']},
  },
  {
    id: 'business_owners',
    label: 'Business ownership transitions',
    accounts: ['SEP IRA', 'SIMPLE IRA', 'Solo 401(k)'],
    triggers: ['Business sale', 'Owner retiring'],
    description: 'Find local owners and partners and look for a documented succession, sale or leadership transition.',
    needs: 'place',
    configuration: {
      sources: ['public_web'],
      industries: ['Medical practices', 'Dental practices', 'Legal services', 'Accounting', 'Engineering', 'Architecture', 'Construction', 'Insurance'],
      titles: ['Owner', 'Founder', 'Co-Founder', 'President', 'Partner', 'Managing Partner', 'Principal'],
      news_terms: ['business sale','acquisition','succession','retirement'],
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
    daily_budget_micros: 0,
  };
}

// What the client needs to draw the choices: no configuration internals.
export function playbookChoices() {
  return PLAYBOOKS.map(({id, label, accounts, triggers, description, needs}) => ({id, label, accounts, triggers, description, needs}));
}
