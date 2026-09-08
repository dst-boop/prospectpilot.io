# ProspectPilot Research Lab

Retirement prospect research with evidence-based qualification and measured cost per verified lead. Built on the supplied ProspectPilot Cloud Run application and Lead Qualifier workflows.

The authenticated home page provides daily discovery experiments, source results, a review queue, CSV imports and research exports. Existing lead-management and provider-enrichment pages remain available.

**A verified quality lead must meet all four reviewed criteria:** over age 55, US residence, retained employer-plan assets with a currently available IRA-eligible distribution, and an identified contact route. Employer plan assets, job titles, graduation years and WARN notices are research signals; they do not prove individual rollover eligibility.

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

## Data and cost handling

- PostgreSQL stores tasks, leases, review evidence, qualification history, costs and employer-plan records.
- The default provider budget is $0. Paid search requires explicit configuration and a budget reservation before each call.
- Imports, duplicates and newly sourced people are counted separately. No verified lead count is fabricated from estimated wealth or age.
- Provider, labor, infrastructure and subscription costs have separate ledger categories. Unrecorded costs remain unknown.
- Private lead exports, provider credentials and catalog artifacts stay out of this repository.
- No automatic contacting, LinkedIn session-cookie extraction or people-search household scraping is part of the Research Lab.
