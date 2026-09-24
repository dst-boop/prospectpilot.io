// How often a person may be contacted, and what the next touch is.
//
// The rest of this application decides whether someone qualifies. Nothing in it
// decided how often they may be contacted, so the pacing lived in the advisor's
// head: how many times this person has been approached, on which channels, how
// long ago, and whether the next attempt is the third or the seventh. This
// module answers that from the logged activity and nothing else.
//
// Two rules do the work. Six touches in any rolling 45 days, counting every
// channel together, then a mandatory rest before the person may be approached
// again. A sequence is a schedule inside that budget, not an exception to it.
//
// It never contacts anyone and never relaxes a restriction. Every path here can
// withhold a touch; none can authorize one that the qualification gates, a
// suppression or a do-not-call entry already refused.

export const CADENCE_VERSION = 'outreach-cadence-1';

export const MAX_TOUCHES = 6;
export const WINDOW_DAYS = 45;
export const REST_DAYS = 90;
const DAY = 86400000;

// Outcomes that represent a contact attempt. `reopen` is an administrative
// action and is deliberately absent: reopening a record is not a touch, and
// counting it would let the cap be consumed without anyone being approached.
export const TOUCH_OUTCOMES = new Set(['no_answer', 'connected', 'follow_up', 'meeting_booked']);
// Outcomes that mean the person responded. The sequence stops here: continuing
// a scripted cadence at someone who already answered is the most common way a
// good conversation is lost.
export const ENGAGED_OUTCOMES = new Set(['connected', 'follow_up', 'meeting_booked']);
export const CHANNELS = new Set(['email', 'phone', 'linkedin']);

// A sequence is data, so changing the plan is an edit to this table rather than
// to the logic that walks it. `day` is days after the first touch, counting the
// first touch as day 1.
export const SEQUENCES = {
  priority: {
    id: 'priority', label: 'Priority sequence', rest_days: REST_DAYS,
    summary: 'Six touches over fourteen days across email, phone and a connection request.',
    steps: [
      {id: 'opener', day: 1, channel: 'email', label: 'Opening email'},
      {id: 'connect', day: 2, channel: 'linkedin', label: 'Connection request, no pitch'},
      {id: 'call-1', day: 4, channel: 'phone', label: 'First call, leave a voicemail'},
      {id: 'detail', day: 7, channel: 'email', label: 'One specific transfer pitfall'},
      {id: 'call-2', day: 10, channel: 'phone', label: 'Second call, no voicemail'},
      {id: 'closing', day: 14, channel: 'email', label: 'Closing the loop'},
    ],
  },
  nurture: {
    id: 'nurture', label: 'Nurture sequence', rest_days: REST_DAYS,
    summary: 'Four educational emails over six weeks, for a good fit with no active signal.',
    steps: [
      {id: 'options', day: 1, channel: 'email', label: 'The options for a former employer plan'},
      {id: 'timing', day: 15, channel: 'email', label: 'The sixty-day indirect rollover rule'},
      {id: 'checklist', day: 29, channel: 'email', label: 'Pre-retirement checklist'},
      {id: 'ask', day: 36, channel: 'email', label: 'Offer the review'},
    ],
  },
};
export const sequencePlan = id => SEQUENCES[id] || SEQUENCES.priority;

// Calling hours are local to the person, so a state that spans two zones has to
// be judged in both. The window is the intersection: if it is 7am anywhere in
// the state, it is too early for the whole state. Erring the other way would
// place the call at the one hour the rule exists to prevent.
const EASTERN = ['America/New_York'], CENTRAL = ['America/Chicago'], MOUNTAIN = ['America/Denver'], PACIFIC = ['America/Los_Angeles'];
export const STATE_ZONES = {
  AL: CENTRAL, AK: ['America/Anchorage', 'America/Adak'], AZ: ['America/Phoenix'], AR: CENTRAL,
  CA: PACIFIC, CO: MOUNTAIN, CT: EASTERN, DE: EASTERN, DC: EASTERN,
  FL: ['America/New_York', 'America/Chicago'], GA: EASTERN, HI: ['Pacific/Honolulu'],
  ID: ['America/Boise', 'America/Los_Angeles'], IL: CENTRAL,
  IN: ['America/Indiana/Indianapolis', 'America/Chicago'], IA: CENTRAL,
  KS: ['America/Chicago', 'America/Denver'], KY: ['America/New_York', 'America/Chicago'],
  LA: CENTRAL, ME: EASTERN, MD: EASTERN, MA: EASTERN,
  MI: ['America/Detroit', 'America/Menominee'], MN: CENTRAL, MS: CENTRAL, MO: CENTRAL,
  MT: MOUNTAIN, NE: ['America/Chicago', 'America/Denver'], NV: PACIFIC, NH: EASTERN,
  NJ: EASTERN, NM: MOUNTAIN, NY: EASTERN, NC: EASTERN,
  ND: ['America/Chicago', 'America/Denver'], OH: EASTERN, OK: CENTRAL,
  OR: ['America/Los_Angeles', 'America/Boise'], PA: EASTERN, RI: EASTERN, SC: EASTERN,
  SD: ['America/Chicago', 'America/Denver'], TN: ['America/New_York', 'America/Chicago'],
  TX: ['America/Chicago', 'America/Denver'], UT: MOUNTAIN, VT: EASTERN, VA: EASTERN,
  WA: PACIFIC, WV: EASTERN, WI: CENTRAL, WY: MOUNTAIN,
};
export const CALL_OPEN_HOUR = 8, CALL_CLOSE_HOUR = 21;

const localHour = (zone, date) => {
  try { return Number(new Intl.DateTimeFormat('en-US', {timeZone: zone, hour: 'numeric', hourCycle: 'h23'}).format(date)); }
  catch { return null; }
};

export function callWindow(state, now = new Date()) {
  const code = String(state ?? '').trim().toUpperCase();
  const zones = STATE_ZONES[code];
  // Without a state there is no way to show the call lands inside local calling
  // hours, and "probably fine" is not a basis for dialing someone.
  if (!zones) return {state: code || null, known: false, open: false, hours: [],
    reason: 'Confirm which state this person is in before dialing; local calling hours cannot be checked without it.'};
  const hours = zones.map(zone => ({zone, hour: localHour(zone, now)}));
  if (hours.some(h => h.hour === null)) return {state: code, known: false, open: false, hours,
    reason: 'Local time for this state could not be determined; place this call manually.'};
  const open = hours.every(h => h.hour >= CALL_OPEN_HOUR && h.hour < CALL_CLOSE_HOUR);
  const early = hours.find(h => h.hour < CALL_OPEN_HOUR), late = hours.find(h => h.hour >= CALL_CLOSE_HOUR);
  return {state: code, known: true, open, hours,
    reason: open ? `Local time is inside ${CALL_OPEN_HOUR}:00–${CALL_CLOSE_HOUR}:00 across ${code}.`
      : early ? `It is ${String(early.hour).padStart(2, '0')}:00 in part of ${code}; calling opens at ${CALL_OPEN_HOUR}:00 local.`
      : `It is ${String(late.hour).padStart(2, '0')}:00 in part of ${code}; calling closed at ${CALL_CLOSE_HOUR}:00 local.`};
}

// new Date(null) is the epoch, not an invalid date, so a missing timestamp would
// otherwise read as 1 January 1970 — a lead never touched would look touched,
// and comfortably inside every service level.
const time = value => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};
const attempts = activities => activities
  .filter(a => TOUCH_OUTCOMES.has(a.outcome) && time(a.created_at))
  .sort((a, b) => time(a.created_at) - time(b.created_at));

/** Contact attempts inside the rolling window, and when the oldest one leaves it. */
export function touchWindow(activities = [], {now = new Date(), windowDays = WINDOW_DAYS} = {}) {
  const since = new Date(now.getTime() - windowDays * DAY);
  const inside = attempts(activities).filter(a => time(a.created_at) > since);
  const byChannel = {email: 0, phone: 0, linkedin: 0, unrecorded: 0};
  for (const a of inside) byChannel[CHANNELS.has(a.channel) ? a.channel : 'unrecorded']++;
  return {count: inside.length, remaining: Math.max(0, MAX_TOUCHES - inside.length), cap: MAX_TOUCHES,
    window_days: windowDays, by_channel: byChannel,
    first_at: inside[0] ? time(inside[0].created_at).toISOString() : null,
    last_at: inside.at(-1) ? time(inside.at(-1).created_at).toISOString() : null,
    // When the oldest touch ages out, the budget increases by one.
    frees_at: inside.length >= MAX_TOUCHES ? new Date(time(inside[0].created_at).getTime() + windowDays * DAY).toISOString() : null};
}

/** Which steps of the plan are already done, and which one is next. */
export function sequenceProgress(activities = [], plan = SEQUENCES.priority, {now = new Date()} = {}) {
  const taken = attempts(activities);
  const done = new Set(taken.map(a => a.step).filter(Boolean));
  // A touch logged without a step still happened. It counts against the cap in
  // touchWindow; here it simply cannot advance a plan it was never part of.
  const unattributed = taken.filter(a => !a.step).length;
  const engaged = taken.find(a => ENGAGED_OUTCOMES.has(a.outcome));
  const started = taken[0] ? time(taken[0].created_at) : null;
  const remaining = plan.steps.filter(s => !done.has(s.id));
  const step = remaining[0] || null;
  const due = step ? new Date((started ? started.getTime() : now.getTime()) + (step.day - 1) * DAY) : null;
  return {
    sequence: plan.id, label: plan.label, total: plan.steps.length, completed: plan.steps.length - remaining.length,
    unattributed, started_at: started ? started.toISOString() : null,
    engaged_at: engaged ? time(engaged.created_at).toISOString() : null,
    finished: !step, step: step ? {...step, due_at: due.toISOString(), due: due <= now} : null,
    ends_at: started ? new Date(started.getTime() + (plan.steps.at(-1).day - 1) * DAY).toISOString() : null,
  };
}

/**
 * Where the current cycle began: the end of a completed rest, or the last time
 * this person responded, whichever is later.
 *
 * Without this the history never resets. A finished sequence stays finished
 * after its rest expires, so the prospect is capped again the moment they
 * return, and no route back to the first step exists.
 */
export function cycleStart(activities = [], rest = null, now = new Date()) {
  const restEnd = rest ? time(rest.resume_at) : null;
  const ended = restEnd && restEnd <= now ? restEnd : null;
  const responded = attempts(activities).filter(a => ENGAGED_OUTCOMES.has(a.outcome)).at(-1);
  const answered = responded ? time(responded.created_at) : null;
  const marks = [ended, answered].filter(Boolean);
  return marks.length ? new Date(Math.max(...marks.map(d => d.getTime()))) : null;
}

/**
 * The whole pacing decision for one person.
 *
 * `status` is what the worklist shows and why:
 *   blocked   an existing restriction; cadence has nothing to add and cannot lift it
 *   engaged   they answered — the sequence stops and a person takes over
 *   resting   a rest period is running
 *   capped    six touches inside the window; a rest is owed
 *   hold      the next step is scheduled, or its calling window is shut
 *   ready     the next touch is due now
 */
export function cadenceState({activities = [], lead = {}, quality = null, rest = null, sequence = 'priority', now = new Date()} = {}) {
  const plan = sequencePlan(sequence);
  // Only this cycle counts. A response or a completed rest closes the previous
  // one, so neither an old sequence nor a spent budget follows someone forever.
  const since = cycleStart(activities, rest, now);
  const answered = !!since && attempts(activities).some(a => ENGAGED_OUTCOMES.has(a.outcome) && time(a.created_at)?.getTime() === since.getTime());
  const current = since ? activities.filter(a => { const t = time(a.created_at); return t && t > since; }) : activities;
  const window = touchWindow(current, {now});
  const progress = sequenceProgress(current, plan, {now});
  const state = String(lead.state ?? '').trim().toUpperCase();
  const base = {version: CADENCE_VERSION, sequence: plan.id, label: plan.label, touches: window, progress,
    resume_at: null, call_window: null, step: null};

  // Order matters. A restriction outranks every schedule below it, and this
  // module must never be the reason a suppressed record is contacted.
  const restricted = lead.suppressed === true || quality?.status === 'excluded'
    || quality?.gates?.contact?.state === 'failed';
  if (restricted) return {...base, status: 'blocked', allowed: false,
    reason: quality?.gates?.contact?.reason || 'This record carries a contact restriction.'};

  const resume = rest ? time(rest.resume_at) : null;
  if (resume && resume > now) return {...base, status: 'resting', allowed: false, resume_at: resume.toISOString(),
    reason: `${String(rest.reason || 'A rest period is running').replace(/\.*$/, '')}. This person returns to the worklist on ${resume.toISOString().slice(0, 10)}.`};

  // Checked before the response below, because a reply ends the scripted
  // sequence and does not buy an unlimited number of further approaches. What a
  // reply does buy is a fresh budget, counted from the reply itself.
  if (window.count >= MAX_TOUCHES) return {...base, status: 'capped', allowed: false, resume_at: window.frees_at,
    reason: `${window.count} touches in ${WINDOW_DAYS} days reaches the limit of ${MAX_TOUCHES}. Rest this person for ${REST_DAYS} days, then re-qualify.`};

  if (answered) return {...base, status: 'engaged', allowed: true,
    reason: `This person responded. Stop the sequence and book the conversation. ${window.remaining} of ${MAX_TOUCHES} touches remain in this window.`};

  if (progress.finished) return {...base, status: 'capped', allowed: false,
    reason: `The ${plan.label.toLowerCase()} is complete with no response. Rest this person for ${plan.rest_days} days, then re-qualify.`};

  const step = progress.step;
  const call = step.channel === 'phone' ? callWindow(state, now) : null;
  const ready = step.due && (!call || call.open);
  return {...base, status: ready ? 'ready' : 'hold', allowed: true, call_window: call,
    step: {...step, ready, hold: ready ? null : !step.due ? `Scheduled for ${step.due_at.slice(0, 10)}.` : call.reason},
    reason: ready
      ? `Touch ${progress.completed + 1} of ${plan.steps.length}: ${step.label.toLowerCase()}. ${window.remaining} of ${MAX_TOUCHES} touches left in this window.`
      : !step.due ? `Next touch is ${step.label.toLowerCase()} on ${step.due_at.slice(0, 10)}.` : call.reason};
}

/**
 * Whether a touch about to be logged is permitted.
 *
 * Called before the write, so the refusal arrives while the advisor can still
 * act on it. It reports a breach of the pacing rules; it does not re-check
 * qualification, which the caller has already established.
 */
export function admitTouch(state, {channel = null, now = new Date()} = {}) {
  if (channel !== null && !CHANNELS.has(channel)) return {ok: false, status: 422, reason: 'Record the channel as email, phone or LinkedIn.'};
  if (state.status === 'blocked') return {ok: false, status: 422, reason: state.reason};
  if (state.status === 'resting') return {ok: false, status: 422, reason: state.reason};
  if (state.status === 'capped') return {ok: false, status: 422, reason: state.reason};
  // Calling hours are deliberately not enforced here. This application does not
  // place the call, so refusing the log would not prevent a badly timed one — it
  // would only lose the record of a touch that happened, and a touch missing
  // from the log is missing from the budget that governs the next six. The
  // window is reported on the worklist, where it can still change a decision.
  return {ok: true, step: state.step?.id || null};
}

/** The rest period owed once the cap is reached or a sequence ends unanswered. */
export function restPeriod(state, {now = new Date(), days = REST_DAYS} = {}) {
  if (state.status !== 'capped') return null;
  return {reason: state.reason, started_at: now.toISOString(),
    resume_at: new Date(now.getTime() + days * DAY).toISOString()};
}

// --- Service levels -----------------------------------------------------------
// Business days, so a lead added on Friday is not late by Monday morning.
const WEEKEND = new Set([0, 6]);
export function addBusinessDays(from, days) {
  const d = new Date(from); let left = days;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (!WEEKEND.has(d.getUTCDay())) left--; }
  return d;
}
export const FIRST_TOUCH_DAYS = 1;

/** Whether the first touch met the one-business-day service level. */
export function firstTouchSLA(addedAt, firstTouchAt, {now = new Date(), days = FIRST_TOUCH_DAYS} = {}) {
  const added = time(addedAt); if (!added) return {measurable: false};
  const due = addBusinessDays(added, days); due.setUTCHours(23, 59, 59, 999);
  const touched = time(firstTouchAt);
  if (!touched) return {measurable: true, met: false, pending: now <= due, due_at: due.toISOString(), touched_at: null};
  return {measurable: true, met: touched <= due, pending: false, due_at: due.toISOString(), touched_at: touched.toISOString()};
}

// --- The touch itself ---------------------------------------------------------
// A worklist that says "send the opening email" has handed the work back. These
// compose the message, so what arrives is text to read and send rather than an
// instruction to go and write one. Every slot is filled from the saved record;
// nothing is invented, and a slot that cannot be filled is reported by name
// instead of being left as a bracket for someone to notice in the sent folder.

const named = value => String(value ?? '').trim();
const priorEmployer = lead => {
  const raw = lead.former_employers;
  const list = Array.isArray(raw) ? raw : named(raw).split(/[;|]/);
  return named(list.map(named).filter(Boolean)[0]);
};

/** The next two business days, so the ask names times instead of asking for them. */
export function offerDays(now = new Date(), count = 2) {
  const days = []; const d = new Date(now);
  while (days.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!WEEKEND.has(d.getUTCDay())) days.push(new Date(d));
  }
  return days.map(x => ({iso: x.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat('en-US', {weekday: 'long', timeZone: 'UTC'}).format(x)}));
}

const DRAFTS = {
  opener: ({first, prior, company, advisor, days}) => ({
    subject: prior ? `Your ${prior} retirement plan` : 'Your former employer retirement plan',
    body: [`Hi ${first},`, '',
      company ? `Congratulations on the move to ${company}.` : 'Congratulations on your recent move.',
      '',
      `One thing that often gets left behind in a transition is the plan with a former employer${prior ? ` — in your case ${prior}` : ''}. Accounts left with a previous employer tend to drift: allocations go unreviewed, beneficiary designations go out of date, and nobody is watching the fees.`,
      '',
      `I would be glad to walk through what you have and what your options are — about twenty minutes, no obligation either way.`,
      '',
      `Would ${days[0].label} or ${days[1].label} work for a brief call?`,
      '', advisor.name || '', advisor.firm || ''].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'),
  }),
  connect: ({first, prior, company, advisor}) => ({
    subject: null,
    body: `Hi ${first} — I work with people on retirement and transition planning${advisor.metro ? ` in ${advisor.metro}` : ''}, and your background${prior ? ` at ${prior}` : ''}${company ? ` and ${company}` : ''} caught my eye. Would be glad to connect.`,
  }),
  'call-1': ({first, prior, advisor}) => ({
    subject: 'Voicemail script — under thirty seconds',
    body: [`Hi ${first}, this is ${advisor.name || '[your name]'} with ${advisor.firm || '[your firm]'}.`,
      `I sent you a note earlier this week about the retirement plan you may still have${prior ? ` at ${prior}` : ' with a former employer'}.`,
      `Most people in your position have three or four options for that account.`,
      `You can reach me at ${advisor.phone || '[your number]'}. Again, ${advisor.name || '[your name]'}, ${advisor.phone || '[your number]'}.`].join(' '),
  }),
  detail: ({first, advisor}) => ({
    subject: 'The sixty-day rule, briefly',
    body: [`Hi ${first},`, '',
      `One thing worth knowing before you move a former employer plan: if the cheque is made out to you rather than sent directly between custodians, the money has to land in the new account within sixty days, and the plan generally withholds twenty percent for taxes in the meantime. A direct transfer between custodians avoids both.`,
      '',
      `Happy to walk through which applies to your accounts.`,
      '', advisor.name || ''].filter(Boolean).join('\n'),
  }),
  'call-2': ({first}) => ({
    subject: 'Second call — no voicemail',
    body: `Call ${first}. Do not leave a voicemail; the first one has already been left and a second adds nothing.`,
  }),
  closing: ({first, prior, advisor}) => ({
    subject: 'Closing the loop',
    body: [`Hi ${first},`, '',
      `I'll stop reaching out — the timing may simply not be right.${prior ? ` If the ${prior} account ever moves up the priority list, the review offer stands.` : ' If a review of your former employer plan ever moves up the priority list, the offer stands.'}`,
      '',
      `One parting thought: beneficiary designations on old plans are the single most common thing we find out of date. Worth a five-minute check even if we never speak.`,
      '', `All the best,`, advisor.name || ''].filter(Boolean).join('\n'),
  }),
  options: ({first, advisor}) => ({
    subject: 'Four options for a former employer plan',
    body: [`Hi ${first},`, '',
      `When you leave an employer, the plan you leave behind generally has four paths: leave it where it is, move it into your new employer's plan, transfer it to an IRA, or cash it out. Each has different costs, investment choices and tax consequences, and the right answer genuinely differs by person.`,
      '', `No action needed — just useful to know it is a decision rather than a default.`,
      '', advisor.name || ''].filter(Boolean).join('\n'),
  }),
  timing: ({first, advisor}) => ({
    subject: 'The rollover mistake that costs the most',
    body: [`Hi ${first},`, '',
      `If a former employer plan is paid to you rather than transferred directly between custodians, you have sixty days to redeposit it and the plan generally withholds twenty percent up front. People discover this at tax time. A direct custodian-to-custodian transfer avoids it entirely.`,
      '', advisor.name || ''].filter(Boolean).join('\n'),
  }),
  checklist: ({first, advisor}) => ({
    subject: 'A short pre-retirement checklist',
    body: [`Hi ${first},`, '',
      `A few things worth confirming in the ten to fifteen years before retirement: where every account actually sits, whether the beneficiary designations still reflect your intentions, what each plan costs you annually, and how the whole picture is allocated when you look at it together rather than account by account.`,
      '', advisor.name || ''].filter(Boolean).join('\n'),
  }),
  ask: ({first, advisor, days}) => ({
    subject: 'Twenty minutes on your accounts?',
    body: [`Hi ${first},`, '',
      `I have been sending these along because the questions come up constantly. If it would help to go through your own accounts — what you have, what they cost and what your options are — I am glad to do that.`,
      '', `Would ${days[0].label} or ${days[1].label} work?`,
      '', advisor.name || ''].filter(Boolean).join('\n'),
  }),
};

/**
 * The message for a step, composed from the saved record.
 *
 * `needs` names the facts that would make it stronger and are not on file. The
 * draft is still returned: a usable message with one missing personalization is
 * more useful than no message, and the caller can see exactly what is thin
 * before deciding to send it.
 */
export function composeTouch(step, {lead = {}, advisor = {}, now = new Date()} = {}) {
  if (!step || !DRAFTS[step.id]) return null;
  const first = named(lead.first_name), prior = priorEmployer(lead), company = named(lead.company);
  const needs = [];
  if (!first) needs.push('a first name');
  if (!prior) needs.push('the previous employer');
  if (!named(advisor.name)) needs.push('your name in the advisor profile');
  if (step.channel === 'phone' && !named(advisor.phone)) needs.push('your callback number in the advisor profile');
  const draft = DRAFTS[step.id]({first: first || 'there', prior, company,
    advisor: {name: named(advisor.name), firm: named(advisor.firm), phone: named(advisor.phone), metro: named(advisor.metro)},
    days: offerDays(now)});
  return {step: step.id, channel: step.channel, subject: draft.subject, body: draft.body,
    needs, complete: needs.length === 0,
    // Composed from the saved record only. It carries no claim about what the
    // person holds, because this application has no basis for one.
    disclosure: 'Drafted from saved professional details. Confirm the facts named here before sending.'};
}

/** When the following step falls due, so the schedule is kept by the app. */
export function nextFollowUp(state, {now = new Date()} = {}) {
  if (!state || !state.allowed) return null;
  const plan = sequencePlan(state.sequence), done = state.progress?.completed ?? 0;
  const upcoming = plan.steps[done + 1] || null, current = plan.steps[done] || null;
  if (!upcoming || !current) return null;
  const start = state.progress?.started_at ? new Date(state.progress.started_at) : now;
  const at = new Date(start.getTime() + (upcoming.day - 1) * DAY);
  return {at: (at > now ? at : new Date(now.getTime() + DAY)).toISOString(), step: upcoming.id, label: upcoming.label, channel: upcoming.channel};
}
