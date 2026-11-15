# Daily worklist evidence summary

This increment extends the existing advisor worklist. It does not create a new dashboard or change qualification, cadence, assignment, outreach, provider spending, or record data.

- The next-move panel shows due follow-ups split into those with a current reviewed contact route, those needing contact review, and those on hold. The categories are exclusive; held records stay due.
- Counts cover the authorized search-matching scan across all views, before pagination. The existing 2,000-record limit is disclosed next to the summary, with a check time. Meetings, future follow-ups, resting records, closed records, and clients are not counted as due.
- Each existing card can disclose contact-review, timing, and outstanding fit checks separately. A reviewed route is not outreach permission, proof of assets, or transfer eligibility.
- The next-prospect button skips paused or scheduled records when another task on the visible page can proceed. If the view contains only held or future work, the button and heading explicitly offer review rather than claiming the next step is ready.
- The existing three primary queues and all other views are preserved. Due follow-ups remain available under Other views.
- Loading, failure, search debounce, and overlapping requests cannot leave stale due counts or a stale next-prospect action available.

## Verification

Run the package scripts with npm (or their exact Node equivalents if npm is unavailable):

- node build.mjs
- node --test test/*.test.mjs
- python -m unittest discover -s test -p 'test_*.py'

Focused coverage lives in test/advisor-workflow.test.mjs and test/lab-client.test.mjs. It checks live evidence expiry, scope/search/page independence, ownership, exclusive count categories, contact/fit separation, closed and resting records, held-only navigation, escaping, and stale-response/error recovery.

Local browser verification used scripts/demo.mjs with synthetic contacts, no external provider calls, and loopback port 8109. Checked desktop and 390-pixel layouts, readiness disclosure, view switching, and brief open/close. Nothing was sent or logged to external systems.

No database migration is needed. Rollback is reverting this commit; no records are changed by the added summary.
## Networking follow-up

Existing CSV imports and conversation notes can carry personal-network contacts and agreed follow-up times, without treating a corporate match as a relationship. The primary worklist currently lacks a quick manual add-person form, structured referrer/relationship/intro-permission fields, a warm-introduction task, or an in-person activity channel. These are useful follow-up increments; this change does not invent relationships or bypass evidence gates.

## Local verification result (2026-11-15)

- Final Node suite with concurrency 4: 619 tests, 618 passed, zero failures, one pre-existing PostgreSQL integration skip.
- Focused advisor/client regression suite: 64 passed, zero failures.
- Production asset build, six Python tests, four shell syntax checks, JavaScript syntax, and whitespace checks passed.
- Independent review found a scheduled-versus-held label issue; fixed and re-reviewed with no remaining findings.
- Real PostgreSQL, Docker image build, authenticated staging, and production deployment were not run. npm was not on PATH, so the package build/test scripts were invoked directly with Node. No paid providers or real contacts were used.
