# ProspectPilot

A professional contact workspace for discovering contacts, building lists, enriching email and phone data, verifying emails, and exporting results. Built on the existing Firebase-authenticated Cloud Run and Cloud SQL application.

The authenticated home page and `/prospect` provide directory filters, CSV import with deduplication, lists, saved searches, contact details, source and verification history, suppression controls, and CSV export. People Data Labs search/enrichment and Hunter verification run through background jobs with progress, explicit cost ceilings and shared daily budget reservations. Phone numbers remain provider-reported and unverified; email verification expires after 30 days.

See [provider setup](PROVIDER-SETUP.md) for credentials, provider entitlements, pricing and worker configuration. No provider subscription or proprietary contact database is bundled. The current production access policy permits the configured owner's verified Google account; this is not an open-signup SaaS service.

## Separate Research Lab

The existing `/lab` workflow provides daily discovery experiments, source results, evidence reviews and research exports. It is separate from the professional contact directory.

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

The contact workspace requires migrations **008** and **009** before starting the service and worker; these add contacts, lists, imports, saved searches, durable tasks and cost reservations. The migration runner applies all outstanding migrations in order.

The separate Research Lab uses migration **007**. It preserves observations, adds the net-worth criterion, and invalidates old qualification totals so four-gate results cannot count under the new definition. Requalification records a new first-verification timestamp under rule `retirement-evidence-2`. The normal migration runner applies it once.

## Data and cost handling

- PostgreSQL stores tasks, leases, review evidence, qualification history, costs and employer-plan records.
- The default provider budget is $0. Paid search requires explicit configuration and a budget reservation before each call.
- Imports, duplicates and newly sourced people are counted separately. No verified lead count is fabricated from estimated wealth or age.
- Provider, labor, infrastructure and subscription costs have separate ledger categories. Unrecorded costs remain unknown.
- Private lead exports, provider credentials and catalog artifacts stay out of this repository.
- No automatic contacting, LinkedIn session-cookie extraction or people-search household scraping is part of the Research Lab.
