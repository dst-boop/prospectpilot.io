# Recorded pipeline milestones

The existing **Your funnel · last 30 days** disclosure now shows the progress of
the same cohort before the existing activity measurements. This is a read-only
addition to the existing scoreboard endpoint and advisor workspace.

## What is measured

- The cohort is research records created within the rolling window, inclusive of
  the exact start and end timestamps, that the signed-in account can currently
  access. Worklist search, view, pagination and the 2,000-row worklist scan do not
  limit this report. It is a record count, not an assertion of resolved unique
  people; pending duplicate candidates are not silently combined.
- Outcomes are personal: only rows logged by the signed-in advisor count. The
  current Research Lab visibility predicate is unchanged. Existing admins may
  see more records but do not acquire credit for another advisor's activities.
  No firm-role, membership, or reassignment permission is introduced.
- Every record counts at most once for each milestone. The first matching log
  supplies its date; each tile shows the latest of those first dates. The UI
  distinguishes a missing log from a known event and discloses the exact UTC
  cohort cutoffs. No future-created record or future-dated activity contributes.
- Approached uses outbound No answer, Connected, Follow-up agreed, or Meeting
  booked. An inbound conversation does not prove an approach was made.
  Conversation recorded uses Connected, Follow-up agreed, Meeting booked, or
  Meeting held, including inbound activity. Booked, held and client milestones
  each require their explicit outcome. Their definitions are available beside
  the counts, and they need not form a monotonically decreasing sequence.
- A client outcome is historical, not current status. Reopening does not erase
  the milestone, and logging it again does not move its first date. A Client
  status on a payload without a corresponding activity is not counted.
- Dates are when outcomes were logged, not signing dates, meeting attendance
  times, or transfer dates. No conversion rate, assets, revenue, forecast,
  outreach permission, or qualification is inferred from this view.

## Behavior and compatibility

The new pipeline object is additive on GET /api/lab/scoreboard. Existing activity
measurements and write paths remain unchanged. Five aggregates are added to the
existing scoped query; there are no new queries, provider calls, migrations or
stored data. Refresh clears prior figures and uses the existing request-version
guard. Worklist and scoreboard refresh independently, so a worklist failure does
not leave old funnel figures looking current. Empty, missing-response, loading,
failure and retry states are explicit.

The new module is included in the production Docker runtime. Rollback is a code
revert; there are no new records or schema changes to unwind.

## Verification

Synthetic regression coverage includes independent and absent milestones,
first-log deduplication after reopen, exact date boundaries, future logs, inbound
contact, status-only and colleague-only records, hidden/other-team records,
existing admin behavior, removed access, escaping, loading/failure/retry and
overlapping responses. A 150,000-row helper fixture checks aggregation without
argument-spread limits; it is not a production database performance benchmark.

Local browser verification used the supported synthetic demo, never real
contacts or provider adapters. Desktop and 390-pixel layouts, keyboard-operated
definitions, close/reopen, and search/view independence were checked. Logging a
fictional Connected outcome and then Became a client changed the milestone
counts from 5/0/0/0/0/0 to 5/1/1/0/0/1: the application did not invent a booked
or held meeting. Temporary viewport changes were reset.

Independent review found no blocker. Its three clarity/refresh suggestions were
addressed and re-reviewed: exact cutoff timestamps, precise qualifying-outcome
wording, and removal of stale totals after a failed worklist refresh.

Final local checks on 2026-11-15:

- `node build.mjs`: passed.
- `node --test --test-concurrency=4 test/*.test.mjs`: 858 tests, 853 passed,
  zero failed, five skipped because an explicit disposable PostgreSQL database
  was not configured (three concurrency/isolation checks and two staging cases).
- Final helper/UI regression run: 48 passed, zero failed or skipped.
- Runtime image-content and synthetic-environment safety guards: five passed.
  The aggregate guard initially caught missing Docker COPY/context entries for
  the new module; both are corrected and the final full run includes the fix.
- `node scripts/staging-smoke.mjs`: six PGlite tests passed, two real-PostgreSQL
  tests skipped. This exercises the current checkout with synthetic adapters.
- `node scripts/upgrade-rehearsal.mjs`: the PGlite rehearsal passed and the real
  PostgreSQL rehearsal skipped. This harness checks its pinned historical
  application revisions, not coverage of the new pipeline module.
- Six Python tests, four shell syntax checks, changed JavaScript syntax and
  `git diff --check`: passed. No dependency installation was needed.

No live data, external provider calls, deployment, or production migration was
performed. Real PostgreSQL, the full container build and production-scale query
plans require their separate environment checks; local embedded PostgreSQL
tests are not a substitute.
