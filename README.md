# ProspectPilot

An advisor workspace for choosing the next prospect, reviewing evidence, and keeping follow-ups moving, alongside a professional contact directory and research tools. Built on the existing Firebase-authenticated Cloud Run and Cloud SQL application.

The authenticated home page now opens the advisor worklist. `/prospect` continues to provide directory filters, CSV import with deduplication, lists, saved searches, contact details, source and verification history, suppression controls, and CSV export. People Data Labs search/enrichment and Hunter verification run through background jobs with progress, explicit cost ceilings and shared daily budget reservations. Phone numbers remain provider-reported and unverified; email verification expires after 30 days.

**Selected source: ZoomInfo CSV exports, without API access.** Import an authorized export using the ZoomInfo preset, then manage and export the contact list. Automated API search/enrichment and independent email verification are optional separate integrations. See [provider setup](PROVIDER-SETUP.md) for credentials, provider entitlements, pricing and worker configuration. No provider subscription or proprietary contact database is bundled. The app supports public account creation with Google or email/password. Email addresses must be verified before accessing a workspace. Contacts, lists, jobs and exports are isolated by Firebase user ID. `OWNER_EMAIL` designates the administrator for older tools; it is not a signup allowlist. Deployment and Firebase Email/Password enablement remain pending.

## Advisor worklist and research

The home page and `/lab` prioritize overdue follow-ups, prospects with reviewed age/residence/contact evidence, and the next missing evidence task. Open a prospect for its conversation brief, verified contact shortcut, outcome log, and next follow-up time. The existing daily discovery and source economics controls remain under the expandable research section.

Select directory contacts and choose **Add to advisor worklist** to reuse their professional identifiers without a CSV round trip (100 at a time). This does not verify their qualification. Directory suppression is honored in linked research records; **Do not contact** in the worklist also suppresses linked directory contacts. Other directory corrections can be brought across by adding the contacts again; financial evidence is never inferred.

Conversation and meeting counters reflect manually logged outcomes over seven rolling days, not sent messages or calendar attendance. Meeting counts deduplicate people. A worklist scan is capped at 2,000 candidates; larger directories show a scope notice and can be narrowed by name/company search.

See [the advisor workflow release](ADVISOR-WORKFLOW-RELEASE.md) for the short usage flow and deployment status.

## Outreach pacing and the next touch

The qualification gates decide whether someone may be approached. This decides
how often, and writes the next message.

**Six touches in any rolling 45 days, counting email, phone and LinkedIn
together.** Reaching the limit opens a mandatory 90-day rest, recorded against
the prospect with the reason, and the worklist shows them under **Resting**
until it ends — a saved follow-up date does not make a resting prospect look
due. A rest survives its touches ageing out of the 45-day window, so waiting
does not quietly restore contact.

A prospect who responds leaves the sequence immediately, and the budget
restarts from their reply: a reply ends the script, it does not buy an
unlimited number of further approaches. Six unanswered touches after a reply
reach the limit like any other six. When a rest period ends, the previous cycle
ends with it and the prospect returns at the first step rather than arriving
already finished.

**The next touch arrives written.** Open a prospect and the brief carries the
actual message for the step that is due — subject and body for an email, the
script for a voicemail, the note for a connection request — composed from the
saved record and signed from **Your details**. A fact that is not on file is
named (*"Add the previous employer to personalize this further"*) rather than
left as a bracket in a sent message. Nothing is sent from the application, and
the draft makes no claim about what the person holds, because nothing here
establishes that.

**The schedule is kept for you.** Logging an unanswered touch sets the next
step's date from the sequence and pre-selects its channel; you are not asked for
a date the plan already knows. A follow-up or meeting still takes an explicit
time, because a person agreed to that one.

Two sequences ship, as data in `outreach-cadence.mjs`: a six-touch priority plan
over fourteen days across three channels, and a four-email nurture plan over six
weeks. Editing the plan is an edit to that table.

Calling hours are 8am-9pm local to the prospect's state, and a state spanning
two zones is judged in both - if it is 7am anywhere in the state it is too early
for the state. A prospect with no recorded state is not shown as ready to dial.
The window is reported, not enforced against the log: this application does not
place calls, so refusing to record one that happened would lose the touch from
the budget that governs the next six.

**Pacing is only as good as the logging.** A touch nobody recorded is invisible
to the limit and to the scoreboard. `GET /api/lab/scoreboard` reports first-touch
service level, response rate and meetings booked per 100 prospects worked, and
names the two metrics it cannot report - whether a booked meeting was held, and
whether a first conversation led to a second - rather than estimating them.

Requires migration **014**, which adds the channel and sequence step to logged
activity, the rest-period table, and the advisor profile used to sign drafts.

**A verified quality lead must meet all five reviewed criteria:** age 45–73 inclusive, US residence, retained retirement assets with an eligible distribution or IRA transfer, an identified phone/email/LinkedIn contact route, and a disclosed net-worth lower bound of at least $250,000 excluding the home and net of liabilities.

Financial criteria require participant disclosure or an authorized financial document, with research consent recorded. Employer plan assets, job titles, graduation years, property values and WARN notices do not establish an individual's wealth or retirement holdings. The 0–100 score measures evidence completeness, not a probability of wealth, transfer eligibility, or investment suitability.

Traditional/contributory, rollover, and Roth IRAs support reviewed trustee-to-trustee transfers to matching tax-type destinations. Employer plans retain the existing distribution routes and in-service permission check. Unknown, stale, conflicting or suppressed records do not qualify. Age evidence uses whole attained years and accounts conservatively for possible birthdays; a 73-year-old needs current-day evidence to remain confirmed.

## Try the application locally

After installing dependencies, run `pnpm demo` and open [the local demonstration](http://127.0.0.1:8088). It uses the actual workspace and Research Lab APIs with an in-memory PostgreSQL-compatible database and clearly labeled fictional records. Contact search, lists, provider-job simulation, verification simulation, exports and Research Lab reviews work. External source calls are disabled. State resets when stopped; do not enter real personal information. Production still uses `pnpm start`, Firebase authentication and Cloud SQL.

## Measure source performance

The source table reports unique people first acquired during the reporting period, currently qualified people in that cohort, observed qualification yield, and reserved provider cost per qualified person. Repeated lookups and duplicate imports do not inflate acquisition counts. This cohort yield is different from the daily newly-verified count, which can include older acquisitions reviewed today. Provider-only costs are not total acquisition cost; record labor, subscriptions and infrastructure in the cost ledger.

Actual daily capacity, predictive precision, and the cheapest source are **not established** by this implementation or its fictional fixtures. Use [the research protocol](RESEARCH-PROTOCOL.md) to measure them with authorized data.

## Run checks

Requires Node 24, pnpm 11.19.0 and Python 3 for the public plan catalog tools.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
python3 -m unittest discover -s test -p 'test_*.py'
```

## Deploy

Use the existing authenticated Google Cloud environment:

```bash
REFRESH_PLAN_CATALOG=1 bash release.sh
```

Read [the release handoff](RELEASE-2026-09-07.md) for prerequisites, validation, costs, source coverage and rollback. The release verifies the new version through the custom domain. Production deployment is not implied by a successful local build or GitHub push.

The advisor workflow adds migration **013** for activity history and contact links, and **014** for outreach pacing, drafted touches and the advisor profile. The contact workspace requires migrations **008** and **009** before starting the service and worker; these add contacts, lists, imports, saved searches, durable tasks and cost reservations. The migration runner applies all outstanding migrations in order.

The separate Research Lab uses migration **007**. It preserves observations, adds the net-worth criterion, and invalidates old qualification totals so four-gate results cannot count under the new definition. Requalification records a new first-verification timestamp under rule `retirement-evidence-2`. The normal migration runner applies it once.

## Data and cost handling

- PostgreSQL stores tasks, leases, review evidence, qualification history, costs and employer-plan records.
- The default provider budget is $0. Paid search requires explicit configuration and a budget reservation before each call.
- Imports, duplicates and newly sourced people are counted separately. No verified lead count is fabricated from estimated wealth or age.
- Provider, labor, infrastructure and subscription costs have separate ledger categories. Unrecorded costs remain unknown.
- Private lead exports, provider credentials and catalog artifacts stay out of this repository.
- No automatic contacting, LinkedIn session-cookie extraction or people-search household scraping is part of the Research Lab.
