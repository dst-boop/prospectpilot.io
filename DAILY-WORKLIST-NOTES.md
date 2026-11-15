# Daily worklist evidence summary

This increment extends the existing advisor worklist. It does not create a new dashboard or change qualification, cadence, assignment, outreach, provider spending, or record data.

- The next-move panel shows due follow-ups split into those with a current reviewed contact route, those needing contact review, and those on hold. The categories are exclusive; held records stay due.
- Counts cover the authorized search-matching scan across all views, before pagination. The existing 2,000-record limit is disclosed next to the summary, with a check time. Meetings, future follow-ups, resting records, closed records, and clients are not counted as due.
- Each existing card can disclose contact-review, timing, and outstanding fit checks separately. A reviewed route is not outreach permission, proof of assets, or transfer eligibility.
- The next-prospect button skips paused or scheduled records when another task on the visible page can proceed. If the view contains only held or future work, the button and heading explicitly offer review rather than claiming the next step is ready.
- The baseline worklist views and their filters are preserved, including the existing Due follow-ups view.
- Loading, failure, search debounce, and overlapping requests cannot leave stale due counts or a stale next-prospect action available.

## Verification

Run the package scripts with npm (or their exact Node equivalents if npm is unavailable):

- node build.mjs
- node --test test/*.test.mjs
- python -m unittest discover -s test -p 'test_*.py'

Focused coverage lives in test/advisor-workflow.test.mjs and test/lab-client.test.mjs. It checks live evidence expiry, scope/search/page independence, ownership, exclusive count categories, contact/fit separation, closed and resting records, held-only navigation, escaping, and stale-response/error recovery.

No database migration is needed. Reverting this feature changes labels and computed summaries only; it does not write records.

This is a compatibility port onto the serving-marker source baseline, not the later unified-advisor branch. Existing views, qualification, cadence, sorting, private data boundaries, and write paths are unchanged. Fresh candidate verification and provenance limits are recorded in [MINIMAL-RELEASE-CANDIDATE.md](MINIMAL-RELEASE-CANDIDATE.md).
