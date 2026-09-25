// Pacing, and what it refuses.
//
// Most of this suite is refusals, because withholding a touch is the whole
// point of the module. The parts that are easy to get subtly wrong — a state
// spanning two time zones, a touch logged before the schema knew about
// channels, a cap that should not be liftable by a rest period expiring — get
// their own cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createResearchLab} from '../research-lab.mjs';
import {cadenceState, touchWindow, sequenceProgress, callWindow, composeTouch, admitTouch, cycleStart,
  restPeriod, nextFollowUp, firstTouchSLA, addBusinessDays, offerDays, sequencePlan,
  MAX_TOUCHES, WINDOW_DAYS, SEQUENCES, dialBudget, DIAL_CAP} from '../outreach-cadence.mjs';

const now = new Date('2026-09-24T15:00:00Z');           // a Thursday, 11:00 in New York
const lead = {id: 'fixture', first_name: 'Jamie', last_name: 'Rivera', company: 'Northline Manufacturing',
  former_employers: 'Harbor Steel', email: 'jamie@example.com', estimated_age_range: '62', country: 'US', state: 'NY'};
const csv = 'First Name,Last Name,Company,Title,Email,Estimated Age Range,Country,State,Former Employers\nJamie,Rivera,Northline Manufacturing,Director,jamie@example.com,62,US,NY,Harbor Steel';
const touch = (days, extra = {}) => ({outcome: 'no_answer', channel: 'email',
  created_at: new Date(now.getTime() - days * 86400000).toISOString(), ...extra});

async function fixture() {
  const db = new PGlite();
  for (const file of ['generated/schema.sql', 'migrations/006-research-lab.sql', 'migrations/007-quality-v2.sql',
    'migrations/008-prospect-workspace.sql', 'migrations/012-plan-catalog-summary.sql',
    'migrations/013-advisor-workflow.sql', 'migrations/014-outreach-cadence.sql', 'migrations/015-dial-budget.sql'])
    await db.exec(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
  const pool = {query: (...a) => db.query(...a), connect: async () => ({query: (...a) => db.query(...a), release() {}})};
  const user = {uid: 'owner', email: 'owner@example.com'};
  const lab = createResearchLab({pool, now: () => now, sources: {readiness: {}}});
  await lab.importCSV(user, {csv});
  const id = (await lab.list(user)).leads[0].lead.id;
  return {db, lab, user, id};
}
async function reviewBasics(lab, user, id) {
  const d = await lab.detail(user, id);
  for (const [field, value] of Object.entries({age: {min: 62, max: 62}, residence: {country: 'US', scope: 'residence'},
    contact: {channel: 'email', address: 'jamie@example.com', identity_confirmed: true}}))
    await lab.review(user, id, {field, value, verdict: 'confirmed', source: 'Synthetic authorized fixture',
      note: 'Synthetic evidence only.', observed_at: now.toISOString(), identity_signature: d.quality.identity_signature});
}

test('the touch budget counts every channel together and releases as touches age out', () => {
  const inside = touchWindow([touch(1), touch(10, {channel: 'phone'}), touch(40, {channel: 'linkedin'})], {now});
  assert.equal(inside.count, 3);
  assert.equal(inside.remaining, MAX_TOUCHES - 3);
  assert.deepEqual(inside.by_channel, {email: 1, phone: 1, linkedin: 1, unrecorded: 0});
  // Older than the window, so it is not part of this budget.
  assert.equal(touchWindow([touch(WINDOW_DAYS + 1)], {now}).count, 0);
  // A touch logged before the schema recorded channels still consumes budget.
  assert.equal(touchWindow([touch(1, {channel: null})], {now}).by_channel.unrecorded, 1);
  // Reopening a record is an administrative act, not an approach.
  assert.equal(touchWindow([touch(1, {outcome: 'reopen'})], {now}).count, 0);
  const full = touchWindow(Array.from({length: MAX_TOUCHES}, (_, i) => touch(i + 1)), {now});
  assert.equal(full.remaining, 0);
  assert.equal(full.frees_at.slice(0, 10), '2026-11-02');
});

test('the sequence advances by step, and an unattributed touch spends budget without advancing it', () => {
  const plan = SEQUENCES.priority;
  const fresh = sequenceProgress([], plan, {now});
  assert.equal(fresh.step.id, 'opener');
  assert.equal(fresh.completed, 0);
  const going = sequenceProgress([touch(3, {step: 'opener'}), touch(2, {step: 'connect', channel: 'linkedin'})], plan, {now});
  assert.equal(going.step.id, 'call-1');
  assert.equal(going.completed, 2);
  // Day 1 is the first touch, so day 4 of a sequence that began three days ago is today.
  assert.equal(going.step.due, true);
  assert.equal(sequenceProgress([touch(0, {step: 'opener'})], plan, {now}).step.due, false, 'day 2 is not due on day 1');
  const manual = sequenceProgress([touch(1)], plan, {now});
  assert.equal(manual.step.id, 'opener', 'a touch with no step cannot complete one');
  assert.equal(manual.unattributed, 1);
  const done = sequenceProgress(plan.steps.map((s, i) => touch(20 - i, {step: s.id})), plan, {now});
  assert.equal(done.finished, true);
  assert.equal(done.step, null);
});

test('calling hours are judged across every zone a state spans, and an unknown state is not dialed', () => {
  // 15:00 UTC is 11:00 in New York — inside the window on both coasts.
  assert.equal(callWindow('NY', now).open, true);
  // 12:00 UTC is 08:00 Eastern but 07:00 Central, and part of Florida is Central.
  const early = new Date('2026-09-24T12:00:00Z');
  assert.equal(callWindow('NY', early).open, true);
  assert.equal(callWindow('FL', early).open, false, 'the Central panhandle is still an hour short');
  assert.match(callWindow('FL', early).reason, /calling opens at 8:00 local/);
  // 01:00 UTC is 21:00 Eastern: closed, whatever it is further west.
  assert.equal(callWindow('NY', new Date('2026-09-25T01:00:00Z')).open, false);
  const unknown = callWindow('', now);
  assert.equal(unknown.known, false);
  assert.equal(unknown.open, false, 'no state means no way to show the call is in hours');
  assert.equal(callWindow('ZZ', now).open, false);
});

test('a restriction outranks the schedule, and cadence can never lift one', () => {
  const blocked = cadenceState({lead: {...lead, suppressed: true}, quality: {status: 'excluded', gates: {contact: {state: 'failed', reason: 'An existing suppression is active.'}}}, now});
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.allowed, false);
  assert.equal(admitTouch(blocked, {channel: 'email', now}).ok, false);
  // Even with budget to spare and a step due, the refusal stands.
  assert.equal(blocked.step, null);
});

test('reaching the limit opens a rest period, and the rest outlives the window that caused it', () => {
  const capped = cadenceState({activities: Array.from({length: MAX_TOUCHES}, (_, i) => touch(i + 1)), lead, now});
  assert.equal(capped.status, 'capped');
  assert.equal(capped.allowed, false);
  assert.match(capped.reason, /reaches the limit of 6/);
  const rest = restPeriod(capped, {now});
  assert.equal(rest.resume_at.slice(0, 10), '2026-12-23');
  assert.equal(restPeriod(cadenceState({lead, now}), {now}), null, 'no rest is owed before the limit');
  // Once resting, ageing touches out of the 45-day window must not reopen contact.
  const later = new Date('2026-11-20T15:00:00Z');
  const resting = cadenceState({activities: Array.from({length: MAX_TOUCHES}, (_, i) => touch(i + 1)),
    lead, rest: {reason: rest.reason, resume_at: rest.resume_at}, now: later});
  assert.equal(resting.touches.count, 0, 'the touches have aged out');
  assert.equal(resting.status, 'resting');
  assert.equal(resting.allowed, false, 'and the rest period still holds');
  assert.equal(admitTouch(resting, {channel: 'email', now: later}).ok, false);
  // After it expires, work resumes from the top of the sequence.
  const after = cadenceState({activities: [], lead, rest: {reason: rest.reason, resume_at: rest.resume_at},
    now: new Date('2026-12-24T15:00:00Z')});
  assert.equal(after.status, 'ready');
});

test('a response stops the sequence, and an exhausted sequence owes a rest', () => {
  const replied = cadenceState({activities: [touch(2, {step: 'opener'}), touch(1, {outcome: 'connected', channel: 'phone'})], lead, now});
  assert.equal(replied.status, 'engaged');
  assert.match(replied.reason, /Stop the sequence/);
  // The priority sequence spends the whole budget, so the limit speaks first.
  const spent = cadenceState({activities: SEQUENCES.priority.steps.map((s, i) => touch(20 - i, {step: s.id})), lead, now});
  assert.match(spent.reason, /reaches the limit of 6/);
  // The nurture plan is shorter, so running out of steps is its own ending.
  const exhausted = cadenceState({sequence: 'nurture', lead, now,
    activities: SEQUENCES.nurture.steps.map((s, i) => touch(40 - i, {step: s.id}))});
  assert.equal(exhausted.status, 'capped');
  assert.match(exhausted.reason, /nurture sequence is complete with no response/);
});

test('a phone step waits for local calling hours without holding up the rest of the plan', () => {
  const beforeCall = [touch(3, {step: 'opener'}), touch(2, {step: 'connect', channel: 'linkedin'})];
  const atNight = new Date('2026-09-28T03:00:00Z');   // 23:00 Sunday in New York
  const held = cadenceState({activities: beforeCall.map(a => ({...a, created_at: new Date(new Date(a.created_at).getTime() - 4 * 86400000).toISOString()})), lead, now: atNight});
  assert.equal(held.step.channel, 'phone');
  assert.equal(held.status, 'hold');
  assert.equal(held.step.ready, false);
  assert.match(held.reason, /calling closed at 21:00 local/);
  assert.equal(admitTouch(held, {channel: 'phone', now: atNight}).ok, true,
    'a call that happened is still logged: dropping it would corrupt the budget, and the app did not place it');
  // An email step is unaffected by calling hours.
  const email = cadenceState({activities: [], lead, now: atNight});
  assert.equal(email.step.channel, 'email');
  assert.equal(email.status, 'ready');
});

test('the draft is a message, not an instruction, and names what it could not personalize', () => {
  const advisor = {name: 'Dana Whitfield', firm: 'Example Advisors', phone: '516-555-0142', metro: 'Long Island'};
  const state = cadenceState({lead, now});
  const draft = composeTouch(state.step, {lead, advisor, now});
  assert.equal(draft.channel, 'email');
  assert.match(draft.subject, /Harbor Steel/);
  assert.match(draft.body, /Hi Jamie,/);
  assert.doesNotMatch(draft.body, /Northline Manufacturing/,
    'the current employer only appeared as part of congratulating a move nothing establishes');
  assert.equal(draft.complete, true);
  assert.deepEqual(draft.needs, []);
  assert.doesNotMatch(draft.body, /\[/, 'no unfilled brackets reach a drafted message');
  // The application has no basis for a claim about what this person holds.
  assert.doesNotMatch(draft.body, /meaningful account|likely a (large|significant)|\$/);
  // The ask names days rather than handing the prospect a scheduling task.
  assert.match(draft.body, /Would Friday or Monday work/);
  // Missing facts are reported, and the draft still arrives usable.
  const thin = composeTouch(state.step, {lead: {first_name: 'Jamie'}, advisor: {}, now});
  assert.deepEqual(thin.needs, ['a previous employer to name', 'your name in the advisor profile']);
  assert.match(thin.body, /plan with a former employer/);
  assert.doesNotMatch(thin.body, /\[/);
  const voicemail = composeTouch({id: 'call-1', channel: 'phone'}, {lead, advisor: {}, now});
  assert.ok(voicemail.needs.includes('your callback number in the advisor profile'));
});

test('service levels count business days, and the offered days skip the weekend', () => {
  const friday = new Date('2026-09-25T15:00:00Z');
  assert.equal(addBusinessDays(friday, 1).toISOString().slice(0, 10), '2026-09-28');
  // One business day means the end of that day, not the same clock time.
  const late = firstTouchSLA(friday, '2026-09-28T22:00:00Z', {now: new Date('2026-09-29T00:00:00Z')});
  assert.equal(late.met, true, 'any time on Monday meets a Friday one-business-day target');
  assert.equal(firstTouchSLA(friday, '2026-09-29T09:00:00Z', {now: new Date('2026-09-30T00:00:00Z')}).met, false);
  // A missing timestamp must not read as the epoch: an untouched lead is late
  // or waiting, never silently on time.
  const waiting = firstTouchSLA(friday, null, {now: friday});
  assert.equal(waiting.pending, true);
  assert.equal(waiting.met, false);
  assert.equal(waiting.touched_at, null);
  assert.equal(firstTouchSLA(friday, null, {now: new Date('2026-10-05T00:00:00Z')}).met, false, 'never touched is never met');
  assert.equal(firstTouchSLA(null, null).measurable, false);
  assert.equal(firstTouchSLA('', null).measurable, false);
  assert.deepEqual(offerDays(friday).map(d => d.label), ['Monday', 'Tuesday']);
  assert.equal(sequencePlan('nonsense').id, 'priority', 'an unknown sequence falls back rather than throwing');
});

test('the workflow records the channel, schedules the next step itself, and refuses a seventh touch', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let detail = await lab.advisor.detail(user, id);
    assert.equal(detail.cadence.status, 'ready');
    assert.equal(detail.draft.channel, 'email');
    assert.match(detail.draft.body, /Harbor Steel/);

    // An unanswered touch does not ask the advisor for a date.
    const first = await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'email',
      signature: detail.action.signature, idempotency_key: 'touch-1'});
    assert.ok(first.scheduled, 'the application scheduled the next step');
    assert.equal(first.scheduled.slice(0, 10), '2026-09-25');
    const saved = (await db.query('SELECT channel,step FROM advisor_activities WHERE lead_id=$1', [id])).rows[0];
    assert.deepEqual(saved, {channel: 'email', step: 'opener'});

    detail = await lab.advisor.detail(user, id);
    assert.equal(detail.cadence.progress.completed, 1);
    assert.equal(detail.cadence.step.id, 'connect');

    // Fill the budget; the sixth touch opens the rest period.
    for (let n = 2; n <= MAX_TOUCHES; n++) {
      const d = await lab.advisor.detail(user, id);
      const result = await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'email',
        signature: d.action.signature, idempotency_key: 'touch-' + n});
      if (n === MAX_TOUCHES) assert.ok(result.resting_until, 'the limit opens a rest period on the same write');
    }
    const rest = (await db.query('SELECT resume_at FROM advisor_rest_periods WHERE lead_id=$1', [id])).rows[0];
    assert.ok(rest, 'a rest period was recorded');

    const d = await lab.advisor.detail(user, id);
    assert.equal(d.cadence.status, 'resting');
    assert.equal(d.action.bucket, 'resting');
    assert.equal(d.draft, null, 'nothing is drafted for someone who may not be contacted');
    await assert.rejects(lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'email',
      signature: d.action.signature, idempotency_key: 'touch-7'}), {status: 422});

    const work = await lab.advisor.worklist(user, {view: 'resting'});
    assert.equal(work.total, 1);
    assert.equal(work.counts.resting, 1);
    assert.equal(work.counts.today, 0, 'a resting prospect is not today’s work');
  } finally { await db.close(); }
});

test('an unusable channel is refused, and the scoreboard separates what it measured from what it cannot', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    const detail = await lab.advisor.detail(user, id);
    await assert.rejects(lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'carrier pigeon',
      signature: detail.action.signature, idempotency_key: 'bad-channel'}), {status: 422});
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone', next_at: '2026-09-30T14:00:00Z',
      signature: detail.action.signature, idempotency_key: 'booked'});

    const board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.worked, 1);
    assert.equal(board.untouched, 0);
    const reply = board.measured.find(m => m.id === 'reply_rate');
    assert.equal(reply.value, 100);
    assert.equal(board.measured.find(m => m.id === 'meetings_per_100').value, 100);
    assert.deepEqual(board.unmeasured, [], 'every metric on the deck is now recorded');
    assert.deepEqual(board.measured.map(m => m.id),
      ['first_touch_sla', 'reply_rate', 'meetings_per_100', 'show_rate', 'second_meeting', 'clients_recorded']);
    // Nothing has been recorded as a client, and that is a counted zero rather
    // than the unmeasured dash a rate with an empty denominator has to show.
    const won = board.measured.find(m => m.id === 'clients_recorded');
    assert.equal(won.value, 0);
    assert.equal(won.target, null);
    assert.match(board.basis, /nobody logged is invisible/);
    await assert.rejects(lab.advisor.scoreboard(user, {days: 0}), {status: 422});
    // Another advisor sees none of this.
    assert.equal((await lab.advisor.scoreboard({uid: 'other', email: 'other@example.com'}, {})).worked, 0);
  } finally { await db.close(); }
});

test('the advisor profile signs the drafts and is scoped to its owner', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    assert.deepEqual(await lab.advisor.profile(user), {name: '', firm: '', phone: '', metro: '', time_zone: 'UTC'});
    const saved = await lab.advisor.saveProfile(user, {display_name: 'Dana Whitfield', firm: 'Example Advisors',
      phone: '516-555-0142', metro: 'Long Island', ignored: 'x'});
    assert.equal(saved.name, 'Dana Whitfield');
    const detail = await lab.advisor.detail(user, id);
    assert.match(detail.draft.body, /Dana Whitfield/);
    assert.deepEqual(detail.draft.needs, []);
    assert.deepEqual(await lab.advisor.profile({uid: 'other', email: 'other@example.com'}), {name: '', firm: '', phone: '', metro: '', time_zone: 'UTC'});
  } finally { await db.close(); }
});

// --- regressions found in review ---------------------------------------------

test('a response stops the sequence without buying unlimited further touches', () => {
  // Answering at touch two leaves the budget intact, counted from the answer.
  const replied = cadenceState({lead, now,
    activities: [touch(20, {step: 'opener'}), touch(19, {outcome: 'connected', channel: 'phone'})]});
  assert.equal(replied.status, 'engaged');
  assert.equal(replied.touches.count, 0, 'the budget restarts at the response');
  assert.match(replied.reason, /6 of 6 touches remain/);
  // Six unanswered approaches after that response still reach the limit.
  const after = cadenceState({lead, now,
    activities: [touch(20, {step: 'opener'}), touch(19, {outcome: 'connected', channel: 'phone'}),
      ...Array.from({length: MAX_TOUCHES}, (_, i) => touch(10 - i))]});
  assert.equal(after.status, 'capped', 'the limit applies after a response as well as before');
  assert.equal(after.allowed, false);
  assert.equal(admitTouch(after, {channel: 'email', now}).ok, false);
  assert.ok(restPeriod(after, {now}), 'and the rest it owes is still created');
});

test('a completed rest starts the prospect over instead of capping them again', () => {
  // A nurture plan run to its end, rested, and now past the resume date.
  const done = SEQUENCES.nurture.steps.map((s, i) => touch(200 - i, {step: s.id}));
  const expired = {reason: 'The nurture sequence is complete with no response.', resume_at: '2026-09-01T00:00:00Z'};
  const state = cadenceState({sequence: 'nurture', lead, now, activities: done, rest: expired});
  assert.equal(state.status, 'ready', 'the rest ended, so the cycle restarts');
  assert.equal(state.progress.completed, 0, 'the finished sequence belongs to the previous cycle');
  assert.equal(state.step.id, 'options');
  assert.equal(state.touches.count, 0);
  // Still resting while the date is in the future.
  assert.equal(cadenceState({sequence: 'nurture', lead, activities: done,
    rest: {...expired, resume_at: '2026-12-01T00:00:00Z'}, now}).status, 'resting');
  assert.equal(cycleStart(done, expired, now).toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(cycleStart([], null, now), null, 'a prospect never touched has no previous cycle');
});

test('reopening preserves an active rest and its completed-cycle boundary', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    await db.query(`INSERT INTO advisor_rest_periods(lead_id,user_id,reason,started_at,resume_at)
      VALUES($1,$2,'Completed sequence','2026-08-01T00:00:00Z','2026-10-30T00:00:00Z')`, [id,user.uid]);
    let d = await lab.advisor.detail(user,id);
    await lab.advisor.save(user,id,{outcome:'reopen',signature:d.action.signature,idempotency_key:'reopen-rest'});
    d = await lab.advisor.detail(user,id);
    assert.equal(d.action.bucket,'resting');
    await assert.rejects(lab.advisor.save(user,id,{outcome:'no_answer',channel:'email',
      signature:d.action.signature,idempotency_key:'blocked-touch'}), /rest period|returns to the worklist/i);
    assert.equal((await lab.advisor.worklist(user,{view:'due'})).total,0);
    // The expired row also matters: it marks where the next cycle starts.
    await db.query(`UPDATE advisor_rest_periods SET resume_at='2026-09-01T00:00:00Z' WHERE lead_id=$1`,[id]);
    d = await lab.advisor.detail(user,id);
    await lab.advisor.save(user,id,{outcome:'reopen',signature:d.action.signature,idempotency_key:'reopen-expired'});
    assert.equal((await db.query('SELECT lead_id FROM advisor_rest_periods WHERE lead_id=$1',[id])).rows.length,1);
  } finally { await db.close(); }
});

test('a resting prospect is never shown as due, whatever date is saved on them', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    for (let n = 1; n <= MAX_TOUCHES; n++) {
      const d = await lab.advisor.detail(user, id);
      await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'email',
        signature: d.action.signature, idempotency_key: 'r-' + n});
    }
    // A follow-up date left over from the sequence must not outrank the rest.
    // Backdate the sequence so day 4 has genuinely arrived. The saved follow-up
    // date is the step's own due date, so in practice the two agree — the point
    // of the finding is that the saved date was being read first.
    await db.query(`UPDATE advisor_activities SET created_at='2026-09-20T10:00:00Z' WHERE idempotency_key='step-1'`);
    await db.query(`UPDATE advisor_activities SET created_at='2026-09-21T10:00:00Z' WHERE idempotency_key='step-2'`);
    await db.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_date}','"2026-09-23T10:00:00Z"')::text WHERE id=$1`, [id]);
    const d = await lab.advisor.detail(user, id);
    assert.equal(d.action.bucket, 'resting', 'a past due date does not make a resting prospect due');
    assert.equal((await lab.advisor.worklist(user, {view: 'due'})).total, 0);
    assert.equal((await lab.advisor.worklist(user, {view: 'resting'})).total, 1);
    // The last touch of a sequence leaves no next step, so no date is invented.
    assert.equal(d.schedules, null);
  } finally { await db.close(); }
});

test('the service level counts prospects nobody reached, once their deadline has passed', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    // A second prospect, added well before the window and never touched.
    await db.query(`INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload,created_at)
      VALUES('stale','wealth-management',$1,$2,$3,'2026-09-01T09:00:00Z')`,
      [user.uid, user.email, JSON.stringify({first_name: 'Sam', last_name: 'Ortiz', company: 'Example Co'})]);
    const detail = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'email',
      signature: detail.action.signature, idempotency_key: 'touched'});

    const board = await lab.advisor.scoreboard(user, {days: 30});
    const sla = board.measured.find(m => m.id === 'first_touch_sla');
    assert.equal(board.worked, 1);
    assert.ok(board.untouched >= 1);
    assert.equal(sla.value, 50, 'one met and one overdue untouched is half, not a perfect score');
    assert.match(sla.basis, /deadline has passed/);
  } finally { await db.close(); }
});

// --- what a draft may not assert -----------------------------------------------
// Raised in review: the drafts assumed a recent job change, an account that
// exists, and an email that may never have been sent. These hold for every
// draft rather than the three that were named, because the next template
// somebody adds will be written from the same habit.

const EVERY_STEP = [...SEQUENCES.priority.steps, ...SEQUENCES.nurture.steps];
const FORBIDDEN = [
  [/congratulat/i, 'congratulates something the record does not establish'],
  [/the move to|your (recent|new) (move|role)|recently (joined|moved|started)/i, 'asserts a job change'],
  [/\byour (401|account|plan)\b|the Harbor Steel account/i, 'asserts an account this person holds'],
  [/single most common|most people in your position|we (always|usually) find/i, 'makes an unsupported claim'],
  [/\$|meaningful account|significant (balance|account|sum)/i, 'implies a balance'],
];

test('no draft asserts a job change, an account, a balance or a finding', () => {
  const advisor = {name: 'Dana Whitfield', firm: 'Example Advisors', phone: '516-555-0142', metro: 'Long Island'};
  for (const step of EVERY_STEP) {
    for (const record of [lead, {first_name: 'Jamie'}]) {
      const draft = composeTouch(step, {lead: record, advisor, now, sent: EVERY_STEP.map(s => s.id)});
      const text = [draft.subject || '', draft.body].join('\n');
      for (const [pattern, why] of FORBIDDEN)
        assert.doesNotMatch(text, pattern, `${step.id} ${why}`);
      assert.doesNotMatch(draft.body, /\[/, `${step.id} left an unfilled bracket`);
    }
  }
});

test('a plan is named as a condition, never as a fact this person has one', () => {
  const advisor = {name: 'Dana Whitfield', firm: 'Example Advisors', phone: '516-555-0142'};
  const opener = composeTouch(SEQUENCES.priority.steps[0], {lead, advisor, now});
  assert.match(opener.body, /If you still have a retirement plan with a former employer/);
  // The reported employer may be named — the record says they worked there —
  // but only as where they worked, never as where an account sits.
  assert.match(opener.body, /from your time at Harbor Steel/);
  assert.doesNotMatch(opener.body, /at Harbor Steel is|your Harbor Steel/);
  const closing = composeTouch({id: 'closing', channel: 'email'}, {lead, advisor, now});
  assert.match(closing.body, /If a review of a former employer plan .* ever becomes useful/);
  // With no employer on file the sentence still reads, without a dangling clause.
  const bare = composeTouch(SEQUENCES.priority.steps[0], {lead: {first_name: 'Sam'}, advisor, now});
  assert.match(bare.body, /If you still have a retirement plan with a former employer, it can be worth a look/);
});

test('the voicemail claims an earlier email only when one was logged', () => {
  const advisor = {name: 'Dana Whitfield', firm: 'Example Advisors', phone: '516-555-0142'};
  const step = {id: 'call-1', channel: 'phone'};
  const unsent = composeTouch(step, {lead, advisor, now, sent: []});
  assert.doesNotMatch(unsent.body, /I sent you a note/);
  assert.match(unsent.body, /I'm calling about retirement plans/);
  const sent = composeTouch(step, {lead, advisor, now, sent: ['opener']});
  assert.match(sent.body, /I sent you a note earlier this week/);
  // And the sequence supplies that list from the log, not from the plan.
  const progress = sequenceProgress([touch(3, {step: 'opener'})], SEQUENCES.priority, {now});
  assert.deepEqual(progress.done, ['opener']);
  assert.deepEqual(sequenceProgress([touch(3)], SEQUENCES.priority, {now}).done, [],
    'a touch logged without a step cannot claim the email was sent');
});

test('the workflow hands the draft only the steps the log shows happened', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    await lab.advisor.saveProfile(user, {display_name: 'Dana Whitfield', firm: 'Example Advisors', phone: '516-555-0142'});
    let detail = await lab.advisor.detail(user, id);
    assert.deepEqual(detail.cadence.progress.done, []);
    await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'email',
      signature: detail.action.signature, idempotency_key: 'opener-sent'});
    detail = await lab.advisor.detail(user, id);
    assert.deepEqual(detail.cadence.progress.done, ['opener']);
    // Step two is the connection note; drive to the call and check its script.
    await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'linkedin',
      signature: detail.action.signature, idempotency_key: 'connect-sent'});
    detail = await lab.advisor.detail(user, id);
    assert.equal(detail.cadence.step.id, 'call-1');
    assert.match(detail.draft.body, /I sent you a note earlier this week/);
  } finally { await db.close(); }
});

// --- meeting outcomes ----------------------------------------------------------
// A booked meeting is an intention. Whether it happened is a separate fact, and
// without it neither the show rate nor a second conversation can be reported.

test('a held meeting is engagement and a no-show is not', () => {
  const held = cadenceState({lead, now,
    activities: [touch(9, {step: 'opener'}), touch(8, {outcome: 'meeting_booked', channel: 'phone'}),
      touch(2, {outcome: 'meeting_held', channel: 'phone'})]});
  assert.equal(held.status, 'engaged');
  assert.equal(held.touches.count, 0, 'the budget restarts at the meeting');
  // A no-show does not reset anything by itself: they agreed and did not appear,
  // so what follows is outreach again and is paced like it.
  const missed = cadenceState({lead, now,
    activities: [touch(9, {step: 'opener'}), touch(8, {outcome: 'no_show', channel: 'phone'})]});
  assert.equal(missed.progress.engaged_at, null);
  assert.equal(missed.touches.count, 2, 'both the approach and the missed meeting spend budget');
});

test('meeting outcomes are recorded, and a no-show has to be rescheduled', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'booked'});
    d = await lab.advisor.detail(user, id);
    await assert.rejects(lab.advisor.save(user, id, {outcome: 'no_show', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'missed-no-date'}), {status: 422},
      'a no-show without a new time would lose the prospect');
    await lab.advisor.save(user, id, {outcome: 'no_show', channel: 'phone', next_at: '2026-09-28T14:00:00Z',
      signature: d.action.signature, idempotency_key: 'missed'});
    assert.equal((await lab.detail(user, id)).lead.follow_up_status, 'Follow-up');
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'held'});
    assert.equal((await lab.detail(user, id)).lead.follow_up_status, 'Met');
    // Booked and held are conversations. A no-show is not one: nobody spoke.
    assert.equal((await lab.advisor.worklist(user, {})).activity.conversations, 2);
  } finally { await db.close(); }
});

test('the show rate counts only meetings with an outcome, and names the ones without', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    // Two meetings booked in the past; one held, one still unrecorded.
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'm1'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-09-20T14:00:00Z' WHERE idempotency_key='m1'`);
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'h1'});

    let board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.measured.find(m => m.id === 'show_rate').value, 100);
    assert.equal(board.meetings.awaiting_outcome, 0);

    // A second past meeting with nothing recorded against it.
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-26T14:00:00Z', signature: d.action.signature, idempotency_key: 'm2'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-09-21T14:00:00Z' WHERE idempotency_key='m2'`);
    board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.meetings.awaiting_outcome, 1);
    assert.match(board.meetings.note, /passed without Met or No-show recorded/);
    assert.equal(board.measured.find(m => m.id === 'show_rate').value, 100,
      'an unrecorded meeting does not count as held');
    assert.equal(board.meetings.held, 1);

    // A no-show moves the rate, which is the point of recording it.
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'no_show', channel: 'phone', next_at: '2026-09-30T14:00:00Z',
      signature: d.action.signature, idempotency_key: 'ns'});
    board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.measured.find(m => m.id === 'show_rate').value, 50);
    assert.equal(board.meetings.awaiting_outcome, 0);
  } finally { await db.close(); }
});

test('a second conversation is a meeting booked after one was held', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'first'});
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'held'});

    let board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.measured.find(m => m.id === 'second_meeting').value, 0,
      'meeting someone once is not a second conversation');
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-10-05T14:00:00Z', signature: d.action.signature, idempotency_key: 'second'});
    // The fixture clock is frozen, so every row lands on the same instant. Real
    // saves are separate requests; the ordering has to be real for the
    // comparison to mean anything.
    await db.query(`UPDATE advisor_activities SET created_at='2026-09-24T16:00:00Z' WHERE idempotency_key='second'`);
    board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.measured.find(m => m.id === 'second_meeting').value, 100);
    assert.match(board.measured.find(m => m.id === 'second_meeting').basis, /1 of 1 prospects you have met/);
  } finally { await db.close(); }
});

test('a directory do-not-call blocks pacing, and pacing cannot override it', async () => {
  // The seam between the directory restrictions merged from main and this
  // module. Neither side alone proves a phone that became do-not-call in the
  // directory stops the sequence that was already running against it.
  const {db, lab, user, id} = await fixture();
  try {
    await db.query('INSERT INTO prospect_contacts(id,user_id,payload) VALUES($1,$2,$3::jsonb)',
      ['contact', user.uid, JSON.stringify({first_name: 'Jamie', last_name: 'Rivera', company: 'Northline Manufacturing',
        email: 'jamie@example.com', phone: '+15165550142', title: 'Director', source: 'Synthetic professional export'})]);
    await lab.importContacts(user, {ids: ['contact']});
    const linked = (await db.query('SELECT lead_id FROM advisor_contact_links WHERE contact_id=$1', ['contact'])).rows[0].lead_id;
    await reviewBasics(lab, user, linked);
    let d = await lab.advisor.detail(user, linked);
    assert.equal(d.cadence.status, 'ready');
    assert.ok(d.draft, 'a draft exists while contact is permitted');

    // The directory marks the number do-not-call after the sequence started.
    await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','true') WHERE id='contact'`);
    d = await lab.advisor.detail(user, linked);
    assert.equal(d.cadence.status, 'blocked', 'pacing defers to the restriction rather than scheduling around it');
    assert.equal(d.cadence.allowed, false);
    assert.equal(d.draft, null, 'nothing is drafted for someone who may not be contacted');
    assert.equal(d.action.bucket, 'closed');
    await assert.rejects(lab.advisor.save(user, linked, {outcome: 'no_answer', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'after-dnc'}), {status: 422});
  } finally { await db.close(); }
});

// --- raised in review on the meeting outcomes ---------------------------------

test('attendance cannot be recorded for a meeting that was never booked', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let d = await lab.advisor.detail(user, id);
    // Without this, Meeting held on an untouched prospect marks them Met,
    // restarts the touch budget and adds a held meeting to the show rate.
    await assert.rejects(lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'phantom'}), {status: 422});
    await assert.rejects(lab.advisor.save(user, id, {outcome: 'no_show', channel: 'phone',
      next_at: '2026-09-30T14:00:00Z', signature: d.action.signature, idempotency_key: 'phantom-ns'}), {status: 422});
    assert.notEqual((await lab.detail(user, id)).lead.follow_up_status, 'Met', 'the refusal left the record alone');
    assert.equal((await lab.advisor.scoreboard(user, {})).meetings.held, 0);

    // With a booking outstanding it is accepted, and only once.
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'real'});
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'attended'});
    d = await lab.advisor.detail(user, id);
    await assert.rejects(lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'attended-twice'}), {status: 422},
      'the booking is spent; a second attendance needs a second booking');
  } finally { await db.close(); }
});

test('one prospect’s extra outcome cannot hide another’s unresolved meeting', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    // A: books, does not appear, is rebooked, then attends — two outcomes
    // against two bookings, and a global subtraction would leave a surplus.
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'a1'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-09-20T14:00:00Z' WHERE idempotency_key='a1'`);
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'no_show', channel: 'phone', next_at: '2026-09-26T14:00:00Z',
      signature: d.action.signature, idempotency_key: 'a2'});
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-27T14:00:00Z', signature: d.action.signature, idempotency_key: 'a3'});
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'a4'});

    // B: a booking whose time has passed with nothing recorded against it.
    await db.query(`INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload,created_at)
      VALUES('b','wealth-management',$1,$2,$3,'2026-09-22T09:00:00Z')`,
      [user.uid, user.email, JSON.stringify({first_name: 'Sam', last_name: 'Ortiz', company: 'Example Co'})]);
    await db.query(`INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,next_at,created_at)
      VALUES('b1','b',$1,'b1','meeting_booked','2026-09-22T14:00:00Z','2026-09-22T10:00:00Z')`, [user.uid]);

    const board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.meetings.awaiting_outcome, 1,
      'B’s unresolved meeting survives A’s surplus of outcomes over due bookings');
    assert.match(board.meetings.note, /1 meeting passed without/);
  } finally { await db.close(); }
});

test('meeting rates are dated by the meeting, not by when the prospect arrived', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    // Added long before the window; the meeting happens inside it.
    await db.query(`UPDATE discovery_leads SET created_at='2026-06-01T09:00:00Z' WHERE id=$1`, [id]);
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'old-lead'});
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'held-now'});

    const board = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(board.measured.find(m => m.id === 'show_rate').value, 100,
      'a meeting held yesterday belongs in this window whenever the person arrived');
    assert.equal(board.meetings.held, 1);
    // The cohort measures still describe only the prospects added in the window.
    assert.equal(board.added, 0, 'nobody was added inside the window');
    assert.equal(board.measured.find(m => m.id === 'reply_rate').value, null);
    // And each rate says which population it came from.
    assert.equal(board.measured.find(m => m.id === 'show_rate').scope, 'activity');
    assert.equal(board.measured.find(m => m.id === 'first_touch_sla').scope, 'cohort');
    assert.ok(board.scopes.cohort && board.scopes.activity);
    // A meeting outside the window is not counted in it.
    assert.equal((await lab.advisor.scoreboard(user, {days: 1})).meetings.held, 1);
    await db.query(`UPDATE advisor_activities SET created_at='2026-06-02T10:00:00Z' WHERE idempotency_key='held-now'`);
    assert.equal((await lab.advisor.scoreboard(user, {days: 30})).meetings.held, 0);
  } finally { await db.close(); }
});

// --- the daily dial budget -----------------------------------------------------
// Carriers judge behaviour, not intent. A number labelled "Spam Likely" ends the
// channel for the whole list, so the cap is the cheapest protection available.

test('dials are counted in the advisor’s own day, not UTC', () => {
  const dial = (minutesAgo, at = now) => ({outcome: 'no_answer', channel: 'phone',
    created_at: new Date(at.getTime() - minutesAgo * 60000).toISOString()});
  const budget = dialBudget([dial(0), dial(30), dial(60)], {now});
  assert.equal(budget.placed, 3);
  assert.equal(budget.remaining, DIAL_CAP - 3);
  assert.equal(budget.spent, false);
  // Email and LinkedIn are not dials.
  assert.equal(dialBudget([{outcome: 'no_answer', channel: 'email', created_at: now.toISOString()}], {now}).placed, 0);
  // Yesterday does not count against today.
  assert.equal(dialBudget([dial(60 * 30)], {now}).placed, 0);

  const full = dialBudget(Array.from({length: DIAL_CAP}, (_, i) => dial(i)), {now});
  assert.equal(full.spent, true);
  assert.equal(full.remaining, 0);
  assert.match(full.reason, /reaches the daily limit of 60/);

  // 22:00 Thursday in Los Angeles is already Friday in UTC. Rolling the budget
  // at UTC midnight would hand one working evening a second allowance.
  const evening = new Date('2026-09-25T05:00:00Z');
  assert.equal(dialBudget([dial(0, evening)], {now: evening, zone: 'America/Los_Angeles'}).placed, 1);
  assert.equal(dialBudget([dial(0, evening)], {now: evening, zone: 'UTC'}).placed, 1);
  // 23:00Z on the 24th: a different UTC day from 05:00Z on the 25th, but the
  // same working afternoon in Los Angeles.
  assert.equal(dialBudget([dial(60 * 6, evening)], {now: evening, zone: 'UTC'}).placed, 0,
    'in UTC that dial was yesterday');
  assert.equal(dialBudget([dial(60 * 6, evening)], {now: evening, zone: 'America/Los_Angeles'}).placed, 1,
    'in the advisor’s day it was this afternoon, and spends the same budget');
  // An unusable zone falls back rather than throwing.
  assert.equal(dialBudget([dial(0)], {now, zone: 'Not/AZone'}).placed, 1);
});

test('a spent dial budget holds the call without holding up the email', () => {
  const spent = {placed: DIAL_CAP, cap: DIAL_CAP, remaining: 0, spent: true, reason: '60 dials today reaches the daily limit of 60.'};
  // Days 1 and 2 done, so the call is what is due.
  const beforeCall = [touch(4, {step: 'opener'}), touch(3, {step: 'connect', channel: 'linkedin'})];
  const held = cadenceState({lead, now, activities: beforeCall, dials: spent});
  assert.equal(held.step.channel, 'phone');
  assert.equal(held.status, 'hold');
  assert.equal(held.step.ready, false);
  assert.match(held.reason, /daily limit of 60/);
  assert.equal(held.dials.spent, true);
  // The same prospect on an email step is unaffected.
  assert.equal(cadenceState({lead, now, activities: [], dials: spent}).status, 'ready');
  // And a dial that happened is still recorded: the app did not place it.
  assert.equal(admitTouch(held, {channel: 'phone', now}).ok, true);
  // With budget left the call is ready again.
  assert.equal(cadenceState({lead, now, activities: beforeCall,
    dials: {...spent, placed: 10, remaining: 50, spent: false}}).status, 'ready');
});

test('the worklist reports one budget for the line, and the profile sets its day', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let work = await lab.advisor.worklist(user, {});
    assert.equal(work.dials.placed, 0);
    assert.equal(work.dials.remaining, DIAL_CAP);
    assert.equal(work.dials.zone, 'UTC', 'an unset profile still has a day boundary');

    const d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'no_answer', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'dial-1'});
    work = await lab.advisor.worklist(user, {});
    assert.equal(work.dials.placed, 1, 'the budget is the line’s, counted across every prospect');
    assert.equal((await lab.advisor.detail(user, id)).cadence.dials.placed, 1);

    const saved = await lab.advisor.saveProfile(user, {display_name: 'Dana', time_zone: 'America/New_York'});
    assert.equal(saved.time_zone, 'America/New_York');
    assert.equal((await lab.advisor.dialsToday(user)).zone, 'America/New_York');
    // A zone the runtime cannot use would move the boundary silently, so it is
    // refused in favour of the working one rather than resetting the day to UTC.
    assert.equal((await lab.advisor.saveProfile(user, {time_zone: 'Mars/Olympus'})).time_zone, 'America/New_York');
    // With nothing usable ever stored, UTC is still the fallback.
    assert.equal((await lab.advisor.saveProfile({uid: 'fresh', email: 'fresh@example.com'},
      {time_zone: 'Mars/Olympus'})).time_zone, 'UTC');
    // Another advisor's dials are not on this line.
    assert.equal((await lab.advisor.dialsToday({uid: 'other', email: 'other@example.com'})).placed, 0);
  } finally { await db.close(); }
});

// --- raised in review on the dial budget ---------------------------------------

test('a due follow-up on hold does not head the list of things you can do', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    // Walk to the phone step. Each unanswered touch sets follow_up_date, so by
    // the call the saved date has arrived and the due branch would otherwise win.
    for (const [n, channel] of [[1, 'email'], [2, 'linkedin']]) {
      const d = await lab.advisor.detail(user, id);
      await lab.advisor.save(user, id, {outcome: 'no_answer', channel,
        signature: d.action.signature, idempotency_key: 'step-' + n});
    }
    // Backdate the sequence so day 4 has genuinely arrived. The saved follow-up
    // date is the step's own due date, so in practice the two agree — the point
    // of the finding is that the saved date was being read first.
    await db.query(`UPDATE advisor_activities SET created_at='2026-09-20T10:00:00Z' WHERE idempotency_key='step-1'`);
    await db.query(`UPDATE advisor_activities SET created_at='2026-09-21T10:00:00Z' WHERE idempotency_key='step-2'`);
    await db.query(`UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_date}','"2026-09-23T10:00:00Z"')::text WHERE id=$1`, [id]);
    let d = await lab.advisor.detail(user, id);
    assert.equal(d.cadence.step.channel, 'phone');
    assert.equal(d.action.bucket, 'due');
    assert.equal(d.action.rank, 0, 'with budget left the call is ordinary due work');

    // Spend the day's dials on a different prospect: the budget belongs to the
    // line, and piling them onto this one would trip the 45-day cap instead.
    await db.query(`INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload,created_at)
      VALUES('other','wealth-management',$1,$2,$3,$4)`,
      [user.uid, user.email, JSON.stringify({first_name: 'Sam', last_name: 'Ortiz', company: 'Example Co'}), now.toISOString()]);
    await db.query(`INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,channel,created_at)
      SELECT 'bulk-'||n,'other',$1,'bulk-'||n,'no_answer','phone',$2::timestamptz FROM generate_series(1,${DIAL_CAP}) n`,
      [user.uid, now.toISOString()]);
    d = await lab.advisor.detail(user, id);
    assert.equal(d.cadence.dials.spent, true);
    assert.equal(d.action.bucket, 'due', 'it is still due — the prospect is owed a call');
    assert.equal(d.action.held, true);
    assert.ok(d.action.rank > 0, 'but it no longer outranks work that can be done now');
    assert.match(d.action.reason, /daily limit/);
    assert.equal(d.action.label, 'Follow-up due, on hold');
  } finally { await db.close(); }
});

test('a dial counts against the line however the call ended', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    const d = await lab.advisor.detail(user, id);
    // "Not interested" is not a touch for the 45-day cap, but it was a dial.
    await lab.advisor.save(user, id, {outcome: 'not_interested', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'rejected'});
    const dials = await lab.advisor.dialsToday(user);
    assert.equal(dials.placed, 1, 'a call that ended in rejection still put volume on the number');
    // And it is still not a touch against the contact limit.
    assert.equal(touchWindow([{outcome: 'not_interested', channel: 'phone', created_at: now.toISOString()}], {now}).count, 0);
  } finally { await db.close(); }
});

// --- raised in review on the merge to main -------------------------------------

test('a meeting is counted in the window it happened in, not the one it was logged in', async () => {
  // An advisor who writes up the week's meetings on Friday should not move them
  // into Friday's window. Both directions are wrong: an old meeting recorded
  // today would inflate the current show rate, and a meeting inside the window
  // recorded after it closed would vanish from the period it belongs to.
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let d = await lab.advisor.detail(user, id);
    // Booked for a time 40 days ago. The save has to take a future date, so the
    // meeting time is moved back afterwards, as the other meeting tests do.
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'stale-meeting'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-08-15T14:00:00Z' WHERE idempotency_key='stale-meeting'`);
    d = await lab.advisor.detail(user, id);
    // Recorded today, six weeks after it happened.
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'written-up-late'});

    const thirty = await lab.advisor.scoreboard(user, {days: 30});
    assert.equal(thirty.meetings.held, 0,
      'a meeting held six weeks ago is not part of the last thirty days because the note was typed today');
    assert.equal(thirty.measured.find(m => m.id === 'show_rate').value, null);
    // Widen the window past the meeting itself and it appears.
    const sixty = await lab.advisor.scoreboard(user, {days: 60});
    assert.equal(sixty.meetings.held, 1);
    assert.equal(sixty.measured.find(m => m.id === 'show_rate').value, 100);
    // The booking's own time is what places it, so the unresolved count and the
    // show rate are drawn from the same clock and cannot disagree.
    assert.equal(sixty.meetings.awaiting_outcome, 0);
    assert.equal(thirty.meetings.awaiting_outcome, 0,
      'a meeting outside the window is neither held in it nor outstanding in it');
  } finally { await db.close(); }
});

test('a no-show is dated by the meeting that was missed, not by its replacement', async () => {
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'missed'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-08-10T14:00:00Z' WHERE idempotency_key='missed'`);
    d = await lab.advisor.detail(user, id);
    // The replacement is inside the thirty-day window. The missed meeting is not,
    // and it is the missed meeting this outcome describes.
    await lab.advisor.save(user, id, {outcome: 'no_show', channel: 'phone', next_at: '2026-09-30T14:00:00Z',
      signature: d.action.signature, idempotency_key: 'absent'});

    assert.equal((await lab.advisor.scoreboard(user, {days: 30})).meetings.no_shows, 0);
    assert.equal((await lab.advisor.scoreboard(user, {days: 60})).meetings.no_shows, 1);
  } finally { await db.close(); }
});

test('the browser can correct a stored time zone without wiping the rest of the profile', async () => {
  // The profile field is readonly by design -- nobody types an IANA zone -- so
  // if a saved zone won a tie against the browser, an advisor who moved could
  // never fix it and the dial allowance would keep rolling over on the old day.
  // The page reconciles it on load, which means a one-field write must leave the
  // four typed fields alone.
  const {db, lab, user} = await fixture();
  try {
    await lab.advisor.saveProfile(user, {display_name: 'Dana Reyes', firm: 'Northline Advisors',
      phone: '+15165550101', metro: 'Long Island', time_zone: 'America/New_York'});
    const moved = await lab.advisor.saveProfile(user, {time_zone: 'America/Denver'});
    assert.equal(moved.time_zone, 'America/Denver');
    assert.equal(moved.name, 'Dana Reyes', 'a zone correction is not a request to blank the signature');
    assert.equal(moved.firm, 'Northline Advisors');
    assert.equal(moved.phone, '+15165550101');
    assert.equal(moved.metro, 'Long Island');
    // The dial day follows the corrected zone immediately.
    assert.match((await lab.advisor.dialsToday(user)).reason, /\d/);
    // A zone the runtime cannot use leaves the working one in place rather than
    // silently moving the day boundary to UTC.
    assert.equal((await lab.advisor.saveProfile(user, {time_zone: 'Mars/Olympus'})).time_zone, 'America/Denver');
    assert.equal((await lab.advisor.saveProfile(user, {time_zone: ''})).time_zone, 'America/Denver');
    // The details form still sends every field, and an emptied field still clears.
    const cleared = await lab.advisor.saveProfile(user, {display_name: '', firm: '', phone: '', metro: '',
      time_zone: 'America/Denver'});
    assert.equal(cleared.firm, '');
    assert.equal(cleared.time_zone, 'America/Denver', 'clearing the typed fields is not a request to reset the zone');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM advisor_profiles')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('only a first conversation can lead to a second, and the window is the first meeting’s', async () => {
  // Dating by the meeting makes the label true: the figure asks what share of
  // first conversations produced another. A prospect first met months ago is not
  // a new first conversation because they were met again this month -- counting
  // them would quietly measure second-to-third and report it as discovery.
  const {db, lab, user, id} = await fixture();
  try {
    await reviewBasics(lab, user, id);
    let d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'b1'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-08-01T14:00:00Z' WHERE idempotency_key='b1'`);
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'h1'});
    await db.query(`UPDATE advisor_activities SET created_at='2026-08-01T15:00:00Z' WHERE idempotency_key='h1'`);
    // A second meeting, inside the thirty-day window.
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_booked', channel: 'phone',
      next_at: '2026-09-25T14:00:00Z', signature: d.action.signature, idempotency_key: 'b2'});
    await db.query(`UPDATE advisor_activities SET next_at='2026-09-20T14:00:00Z' WHERE idempotency_key='b2'`);
    d = await lab.advisor.detail(user, id);
    await lab.advisor.save(user, id, {outcome: 'meeting_held', channel: 'phone',
      signature: d.action.signature, idempotency_key: 'h2'});

    const thirty = await lab.advisor.scoreboard(user, {days: 30});
    // The second meeting is a meeting held in the window and counts as one.
    assert.equal(thirty.meetings.held, 1);
    assert.equal(thirty.measured.find(m => m.id === 'show_rate').value, 100);
    // It is not a first conversation, so it is not in this rate either way.
    assert.equal(thirty.measured.find(m => m.id === 'second_meeting').value, null);
    // Widen the window to reach the first conversation and it is measured, and
    // it did lead to a second.
    const ninety = await lab.advisor.scoreboard(user, {days: 90});
    assert.equal(ninety.meetings.held, 2);
    assert.equal(ninety.measured.find(m => m.id === 'second_meeting').value, 100);
    assert.match(ninety.measured.find(m => m.id === 'second_meeting').basis, /1 of 1 prospects you have met/);
  } finally { await db.close(); }
});
