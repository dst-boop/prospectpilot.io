# Rollover targeting

The daily `plan` command now returns `rollover_sourcing` alongside the existing
executable ZoomInfo queries. It describes company-first job-change, WARN and
acquisition research, optional university research, and authorized existing-account
review. These additional research tasks are plans, not new paid connectors.
No automatic IRA balance discovery or LinkedIn graph access is claimed.

`config.json` sets the $100,000 movable-asset target and 1977–1990 graduation
preference. `alumni_schools` is empty until institutions are supplied; documented
graduation years can still contribute a preference score.

The select command reads `evidence-*.json` in its external scratch directory:

```json
{"meta":{"kind":"rollover_evidence"},"evidence":[
 {"person_id":"101","kind":"graduation","school":"Fictional University",
  "year":1985,"source_ref":"https://example.com/fixture","observed_at":"2026-09-30"}
]}
```

Evidence joins by provider person ID, never name. Supported kinds are job_change,
former_employer, layoff, acquisition, graduation, age, account and movable_assets.
Every item needs person_id, source_ref and observed_at. Conflicted, future-dated,
or over-one-year-old evidence does not produce a positive score. Graduation
needs school/year; age uses a documented minimum_years, never graduation-derived
age. Financial confirmation requires an authorized participant disclosure or
document, retained assets, eligible route and a lower bound of at least $100,000.
In-service and SIMPLE IRA cases have additional review flags. Conflicting amounts
require review; balances are never added together. Do not store account numbers.

Existing provider search envelopes accept tiers D (reported account), E (alumni)
and F (in-service review), as well as the existing A/B/C employer paths. Every
candidate still passes existing identity, delivery-ledger, exclusion, contact and
employer-cap rules. The exported Why Now states whether $100,000+ is confirmed
or unconfirmed; enrichment cannot turn a provider estimate into a disclosure.

This scoring controls daily sourcing priority, not the older five-gate Worklist
qualification model. It does not rewrite previously reviewed evidence, certify
financial suitability, send outreach, or change spending limits.

### Duplicate enrichment responses

Daily sourcing combines enrichment files by provider person ID. Empty responses do not erase prior values, and any recorded do-not-call flag remains active. Conflicting fields are withheld from CSV output and named in the review note; first/last-name conflicts withhold all contact channels. The in-memory result retains each field observation with its input file and row reference. Original scratch files remain the source of evidence; this does not change saved contact records, automatically re-run enrichment, resolve conflicts, or reset suppression.

Restrictions are also combined before daily search deduplication, including from rows excluded in another lane. A later selected duplicate cannot clear a known restriction. Ranking awards freshness only to valid past/current dates. Contact details are described as available, never as permission to call.
