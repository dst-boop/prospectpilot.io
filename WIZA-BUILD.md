# ProspectPilot contact workspace

## Production and scope

The contact workspace is deployed at https://prospectpilot.io. The source-quality release `review-20260908203511-11107`, Cloud Run revision `prospectpilot-00009-8pr`, is verified live. Cloud Build 51e996fe-f530-4595-ab15-5af224ef17d5 and GitHub run 34275517806 passed. Production preview/import matched the two existing fictional contacts, rejected a malformed row and kept the directory at two contacts.

The user selected ZoomInfo without API access. Authorized CSV exports are the primary acquisition workflow. Optional People Data Labs search/enrichment and Hunter verification adapters are implemented, but licensed credentials and contract prices are not configured. No real provider accuracy, volume or billing claims have been established.

Public Google and email/password signup are implemented with verified Firebase identities. Google login was tested in production. Real email verification and password-reset delivery still need a delivery test. User data is isolated by Firebase UID; legacy administrative routes remain owner-restricted.

## September 8 data-quality improvements

- Strict CSV parsing, physical row numbers, normalized US locations, placeholder handling and explicit rejected/ignored fields.
- Upload or paste CSV, preview without writes, commit-time identity rechecks and downloadable row reports.
- Source observation dates separated from import/provider retrieval dates; source history and field origins retained.
- Source import outcomes and current email-verification coverage by original source. No fabricated source accuracy scores.
- Shared-mailbox and namesake protections; legacy US location spellings remain searchable and deduplicate correctly.
- Provider response validation rejects missing/out-of-range identity confidence and malformed professional fields. Rejected provider rows count toward results.
- Pending, catch-all, invalid and unknown verifier states remain distinct. Current valid checks skip redundant requests and reservations.
- Saved import reports open as historical read-only reports. Source history and field origins are visible in contact details.
- Deployment preflight gives an explicit missing-Scheduler-API error instead of hiding an interactive prompt.

See [SOURCE-QUALITY.md](SOURCE-QUALITY.md) for interpretation and [PROVIDER-SETUP.md](PROVIDER-SETUP.md) for server configuration.

## Validation

149 Node tests and 6 Python tests pass. The production build and whitespace checks pass. A local browser test used only fictional data and verified the paste/preview/import workflow: one new contact, one duplicate with a differing title, one rejected bad email, ignored verification claims and an old source-date flag. The final browser check also verified per-source coverage, historical reports and the downloaded row-report CSV. A 5,000-row synthetic PGlite benchmark completed in 662 ms using 56 queries; this is not a production latency claim. A later-batch failure rolls back the full import.

Earlier production testing verified Google login, a two-contact fictional import, list membership, export, suppression-aware export, saved-search restoration and the verified-email filter. Those two fictional records remain in the owner's QA list.

## Remaining external validation

- Actual ZoomInfo export layout and licensed source quality on a user-supplied sample.
- Live PDL/Hunter identity accuracy, coverage, credit usage and worker results after licensed configuration.
- Real email-verification/password-reset message delivery for public signup.
- Source costs must include subscription/export charges and labor; current API reservations are conservative estimates, not invoices.

The repository work is on `codex/contact-workspace` in [draft PR #4](https://github.com/dst-boop/prospectpilot.io/pull/4). The broader Wiza-style goal is not complete merely because local tests or deployment pass.

## Additional source checks

DNS domain checks now run through durable jobs without paid data-provider credits. Domain-level results stay separate from mailbox verification, preserve observation times and can avoid paid requests after recent definitive failures. Local browser testing verified a completed synthetic domain job with a zero reservation; a live DNS-only lookup of example.com correctly returned null MX. No email was sent.

Production domain-job testing completed both fictional contacts with a $0 reservation. Their `.invalid` domains were identified as special-use and were not queried; neither address acquired a valid-mailbox badge.

Employer-plan selection uses the latest filing before applying termination/location filters, missing distribution indicators remain unknown, and blank plan numbers are rejected. Migrations 010 and 011 add the latest-filing index and domain-check job action. Source/review/suppression filters and compact directory responses are included. Release `review-20260908205751-26103`, revision `prospectpilot-00010-rqh`, is live; Cloud Build 83da899d-a844-4e41-89e8-84f3952fce76 and GitHub run 34277742223 passed.

The next catalog release adds Schedule I coverage, atomic refreshes, amendment ordering, archive fingerprints and distinct-plan dashboard counts. Full-source validation is recorded in SOURCE-VALIDATION-2026-09-08.json; loading this catalog into production is still pending.

WARN source auditing recovered dates for 9,837 retained notices, repaired the known Wisconsin merged header, and excluded two explicitly non-WARN records. The direct Texas integration adds 2,358 distinct notices; the combined tested result is 41,081 notices across 32 jurisdictions. Texas's July 7 update is flagged stale. Per-state unknown-date counts and fingerprints are recorded in WARN-VALIDATION-2026-09-08.json. Crawler-rule and WARN fixes are awaiting the next production release.

The first catalog execution failed before import because Python's container lacked system CA certificates. The runtime now installs `ca-certificates`, and CI checks Python's HTTPS trust store in the built image. The production retry is pending; the earlier app release remains live.

WARN review now flags 34 implausible-date records without silently correcting their source text; 4,649 records have unknown usable notice dates. The public-source image allowlist includes the crawler-rules module.
