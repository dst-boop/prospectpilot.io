export const ADVICE_TARGET = 'advice_decision';
export const ADVICE_RULE_VERSION = 'advice-decision-1';
export const DAY_MS = 86400000;
export const DECISION_REVIEW_DAYS = 90;
export const CONTACT_REVIEW_DAYS = 90;
export const PERSONAL_EVENT_DAYS = 90;

export const DECISION_ORIGINS = Object.freeze({
  inbound_request: 'Advice requested',
  accepted_introduction: 'Introduction accepted',
  confirmed_conversation: 'Planning need confirmed',
});

export const PLANNING_TOPICS = Object.freeze({
  retirement_income: 'Retirement readiness or income',
  workplace_plan: 'Old workplace plan or job transition',
  pension_election: 'Pension election or plan change',
  in_service: 'In-service plan decision',
  business_transition: 'Business ownership transition',
  equity_compensation: 'Equity compensation decision',
  family_transition: 'Client-disclosed family or estate transition',
  second_opinion: 'Second opinion or gaps in an existing plan',
  other_planning: 'Other specific planning decision',
});

export const CONTACT_BASES = new Set(['person_requested', 'firm_cleared']);

export function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const millis = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
}

export function validatePlanningDecision(value, observed) {
  if (!Object.hasOwn(DECISION_ORIGINS, value?.origin) || !Object.hasOwn(PLANNING_TOPICS, value?.topic)
    || value.identity_confirmed !== true || value.prospect_confirmed !== true) {
    throw Object.assign(Error('Record a specific planning topic confirmed by this person or their authorized representative.'), {status: 422});
  }
  const deadline = value.decision_by || null;
  const observedDay = calendarDay(observed.slice(0, 10));
  if (deadline !== null && (calendarDay(deadline) === null || calendarDay(deadline) < observedDay)) {
    throw Object.assign(Error('Enter the stated decision date on or after the observation date, or leave it blank.'), {status: 422});
  }
  return {origin: value.origin, topic: value.topic, decision_by: deadline, identity_confirmed: true, prospect_confirmed: true};
}

export function decisionDays(deadline, now) {
  return deadline ? (calendarDay(deadline) - calendarDay(now.toISOString().slice(0, 10))) / DAY_MS : null;
}
