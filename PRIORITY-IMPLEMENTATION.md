# Priority implementation — September 5, 2026

Updated September 6: the user removed the accuracy deployment requirement. Normal build, regression, migration, and smoke checks remain. No real-world accuracy percentage is claimed.

Implemented locally:
- PostgreSQL research jobs, resumable per-source progress, bounded retries, expired lease recovery, user isolation and lead identity snapshots.
- One-button research queues work and restores progress when returning to a lead. A separate Cloud Run worker and five-minute recovery scheduler have provisioning scripts.
- GLEIF registry adapter requires exact company name and matching city. Records without matching location are omitted. LEI coverage is not universal business coverage.
- Structured sourced facts and conflicting values appear in the research overview. Existing excerpts remain available for review.
- Benchmark packet generator leaves human judgments blank. Validation is bound to the exact package fingerprint.
- WARN publication timestamps and stale/unknown publication status. upstream-warn/warn-sync.yml adds pyquery/lxml and publication timestamps; PR #100 was merged and the refresh succeeded: 31 jurisdictions published; 10 scrapers still fail.

Validation: regression suite and isolated Edge browser test. These tests establish implementation behavior, not 99.5% real-world accuracy.
Remaining: live Cloud Run worker/IAM validation and remaining broken state scrapers; broader registry/licensing/SEC coverage.

Deployment sequence:
1. Provision worker using setup-research-worker.sh.
2. Run release.sh, which migrates, updates the worker image, then the web service.
3. Verify Cloud Scheduler and complete production smoke checks.

Optional benchmark usage:
node research-benchmark.mjs prepare captured-cases.json review-packet.json
An independent reviewer must label actual cases and implementation readiness.
node research-benchmark.mjs validate review-packet.json accuracy-validation.json

Public adapter references:
https://www.gleif.org/en/lei-data/gleif-api
