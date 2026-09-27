# ProspectPilot Codex instructions

ProspectPilot's V1 goal is to turn a geography + prospect definition into evidence-backed, deduplicated, scored, contactable prospects with retirement-asset reasoning and advisor-ready export.

## Architecture rules

- Treat `prospectpilot.io` as the canonical production repository.
- Extend the existing PostgreSQL/research-job/provider architecture; do not create a second app or parallel database.
- Preserve existing APIs and tests unless a migration is explicit.
- Prefer small modules with deterministic functions and Node's built-in test runner.
- Every new production behavior needs a regression test under `test/`.

## Core data rules

- Never use a person's name alone as an identifier.
- Preserve field-level evidence and provenance. Do not silently overwrite conflicting evidence.
- Distinguish verified facts from estimates and inferences.
- Age should be a range + confidence unless an exact age is supported by reliable evidence.
- Keep these scores separate: qualification, rollover opportunity, data confidence, contactability. `priority` may combine them only for workflow sorting.
- A blocked or unavailable source must not terminate a campaign; move to the next configured source.
- Run free/public qualification before paid enrichment whenever practical.
- Store cost at the source/job/event level so cost per qualified contactable lead can be calculated.

## Discovery rules

Use a company-first funnel:

1. Discover companies matching geography + industry/company type.
2. Discover people within each company using title/seniority criteria.
3. Resolve identity before enrichment.
4. Collect evidence for age and career history.
5. Join employer retirement-plan evidence and money-in-motion signals.
6. Score the lead.
7. Enrich contact data only after qualification thresholds are met.
8. Export only records that meet explicit readiness criteria.

Do not make LinkedIn scraping a required source. LinkedIn information may be incorporated through authorized user/provider workflows, but public-web/company/SEC/DOL/WARN/association/university/PDF fallbacks must keep campaigns functional.

## Initial V1 modules

- `prospect-core.mjs`: lead/evidence normalization, conflict-aware evidence resolution, age estimation, four-dimensional scoring.
- `identity-resolution.mjs`: conservative identity matching and review outcomes.
- `campaign-engine.mjs`: campaign normalization, company-first queries, person research queries, source fallback order, funnel/cost metrics.

Integrate these primitives into existing `research-lab.mjs`, `prospect-workspace.mjs`, jobs, migrations, and UI incrementally. Avoid a big-bang rewrite.

## Definition of done for each increment

- Tests pass with `npm test`.
- No existing security/access/isolation tests regress.
- Evidence remains auditable to source.
- Duplicate resolution is conservative; ambiguous cases go to review.
- Cost metrics are preserved.
- The release can be rolled back without data loss.
