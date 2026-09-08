# ProspectPilot Research Lab

Retirement prospect research with evidence-based qualification and measured cost per verified lead. Built on the supplied ProspectPilot Cloud Run application and Lead Qualifier workflows.

The authenticated home page provides daily discovery experiments, source results, a review queue, CSV imports and research exports. Existing lead-management and provider-enrichment pages remain available.

**A verified quality lead must meet all five reviewed criteria:** age 45–73 inclusive, US residence, retained retirement assets with an eligible distribution or IRA transfer, an identified phone/email/LinkedIn contact route, and a disclosed net-worth lower bound of at least $250,000 excluding the home and net of liabilities.

Financial criteria require participant disclosure or an authorized financial document, with research consent recorded. Employer plan assets, job titles, graduation years, property values and WARN notices do not establish an individual's wealth or retirement holdings. The 0–100 score measures evidence completeness, not a probability of wealth, transfer eligibility, or investment suitability.

Traditional/contributory, rollover, and Roth IRAs support reviewed trustee-to-trustee transfers to matching tax-type destinations. Employer plans retain the existing distribution routes and in-service permission check. Unknown, stale, conflicting or suppressed records do not qualify. Age evidence uses whole attained years and accounts conservatively for possible birthdays; a 73-year-old needs current-day evidence to remain confirmed.

## Try the application locally

After installing dependencies, run `pnpm demo` and open [the local demonstration](http://127.0.0.1:8088). It uses the actual Research Lab API and an in-memory PostgreSQL-compatible database, with four clearly labeled fictional records. Imports, evidence reviews, exports and cost entries work. External source calls are disabled. State resets when stopped; do not enter real personal information. Production still uses `pnpm start`, Firebase authentication and Cloud SQL.

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

This update requires migration **007** before starting the new app and research worker. It preserves observations, adds the net-worth criterion, and invalidates old qualification totals so four-gate results cannot count under the new definition. Requalification records a new first-verification timestamp under rule `retirement-evidence-2`. The normal migration runner applies it once.

## Data and cost handling

- PostgreSQL stores tasks, leases, review evidence, qualification history, costs and employer-plan records.
- The default provider budget is $0. Paid search requires explicit configuration and a budget reservation before each call.
- Imports, duplicates and newly sourced people are counted separately. No verified lead count is fabricated from estimated wealth or age.
- Provider, labor, infrastructure and subscription costs have separate ledger categories. Unrecorded costs remain unknown.
- Private lead exports, provider credentials and catalog artifacts stay out of this repository.
- No automatic contacting, LinkedIn session-cookie extraction or people-search household scraping is part of the Research Lab.
