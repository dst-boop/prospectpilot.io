# ProspectPilot competitive benchmark

Objective updated September 9, 2026: continue improving ProspectPilot until it demonstrates an advantage over Wiza for the user's prospecting workflow. The overnight cutoff is canceled. The user explicitly selected data quality and total cost per usable professional contact as the priorities. Workflow speed, reliability and integrations support those priorities. This is an engineering target, not an achieved superiority claim.

## Current comparison

Wiza advertises on-demand contact verification, a searchable contact database, a browser extension, list exports and CRM synchronization. Its database-size and accuracy statements are vendor claims, not independently reproduced benchmark results. [Wiza product](https://wiza.co/), checked September 9, 2026.

Wiza's pricing page lists Starter at $49 per user monthly, with 100 valid email and 100 phone credits, and separate monthly and annual email/phone plans. Export limits, overages and annual commitments affect actual cost. Use the user's actual comparable plan and invoice, not headline pricing, in a head-to-head trial. [Wiza pricing](https://wiza.co/pricing), checked September 9, 2026.

Wiza documents two-way CRM sync. ProspectPilot currently has CSV export but no equivalent native CRM sync; CSV export must not be described as feature parity. [Wiza CRM sync](https://help.wiza.co/en/articles/16053117-wiza-two-way-crm-sync-everything-you-need-to-know), checked September 9, 2026.

| Dimension | ProspectPilot evidence | Gap and next action |
|---|---|---|
| Contact acquisition | Authorized ZoomInfo CSV workflow verified live; PDL adapter implemented | Licensed live search/enrichment not configured; demonstrate coverage on permitted real input |
| Email quality | Expiring verifier states, DNS checks, provenance, identity safeguards | Hunter live verification and actual accuracy remain untested; DNS is not mailbox verification |
| Phone quality | Provider-reported phone normalization | No independent ownership or reachability measurement |
| Workflow | Import preview, lists, saved searches, row reports, export | Measure time to usable list; improve high-friction steps with browser tests |
| CRM | CSV export | Native authorized CRM integration absent |
| Team workflow | Per-user isolation | Shared contact-workspace roles and collaboration absent |
| Cost | Reservations and shared API cap | Include subscriptions, export fees, labor and infrastructure; no proven cheaper-source claim |
| Source context | 584,266 distinct employer plans loaded; WARN source audit | Employer records are contextual, not individual contacts or evidence of individual wealth |
| Reliability | Automated tests and verified Cloud Run deployment | Publish each tested batch, record exact live revision and test actual workflows |

## Proposed acceptance criteria

Use an identical, licensed input cohort on both products within the same period. Start with 300 professional contacts across three relevant segments. This is an initial trial size, not a guarantee of statistical power. Preserve exclusions and unknowns, and pre-register the criteria before viewing results.

A usable contact must match the requested person's professional identity, match the requested segment and have an independently reviewed usable contact route. Unknown identity, suppression, missing evidence or a provider-only accuracy claim does not count as confirmed. Do not infer retirement assets or wealth from professional records.

Measure distinct usable contacts divided by all requested candidates; confirmed identity errors divided by reviewed outputs; total attributable cost divided by distinct usable contacts; and elapsed user time to create the same usable list. Record confidence intervals and segment-level results. Count unknowns and duplicates separately. If no usable contacts are established, cost per usable contact is undefined, not zero.

Working targets: no higher observed identity-error rate and no lower usable-contact coverage than the comparison, with at least 20% lower total cost per usable contact. At least 25% less user time is a secondary workflow target. The user explicitly prioritized data quality and cost per usable contact; the numeric thresholds remain proposed product targets, not facts about either system. A claim needs adequate evidence for the difference, not only a favorable point estimate.

Workflow acceptance also requires suppression-aware exports, tenant isolation, no unapproved paid requests, visible provider failures and no inflated verification statuses. Missing core workflows must be disclosed even if one metric wins.

## Execution queue

1. CI passed through commit `b784ce7ef62f76e20d9a37079df2e6fb95c840c4`, including the export evidence, comparison evaluator and non-public-domain cost guard. Deployment needs Google reauthentication, then custom-domain verification.
2. The local checkout is reconciled with published history and has an origin remote; local handoff documentation is preserved.
3. This branch's CSV exports include source dates, historical verification context and review flags; local tests pass, live verification pending.
4. The local comparison evaluator is implemented with regression coverage; it accepts measured outcomes and actual costs, refuses unsupported winners and needs no personal data in the repository. A real comparison remains pending licensed inputs and reviewed evidence.
5. Validate permitted real provider data when credentials and source samples are available; do not buy access or contact third parties without authorization.
6. Build the highest-priority integration after the user's CRM/workflow is established; do not guess a live destination for contact data.

## Offline comparison evaluator

Prepare a review file with `node scripts/prepare-contact-benchmark.mjs .tmp/contact-benchmark-draft.json 300 contact_trial`. The parent directory must exist. This creates equal candidate slots for ProspectPilot and Wiza and refuses to overwrite an existing file. Keep the mapping from each opaque candidate ID to one licensed, deduplicated person separately; the script does not select or invent people.

Every outcome starts with `returned: null`, meaning the trial has not been run. After each permitted search, explicitly set it to true or false and attach the documented review for returned contacts. Costs and user time also start unknown. The evaluator refuses a draft with unfilled outcome slots, so an unfinished trial cannot silently become a measured coverage failure. Retain source evidence and allocation records before entering any costs.

Run `node scripts/evaluate-contact-benchmark.mjs .tmp/benchmark.json`. The evaluator makes no network requests and prints aggregate JSON. Keep licensed data and reviewer evidence outside version control; use opaque canonical-person IDs, not names or email addresses. An evidence reference points to the separately retained review record; the evaluator does not inspect it or output it.

Input schema: `schema_version: 1`, opaque `cohort_id`, a unique `candidate_ids` array and exactly two `runs`. Each run needs a unique `label` and exactly one `outcomes` row for every candidate, including missing results. A row contains `candidate_id`, boolean `returned`, and optionally `review` for a returned record. A vendor's verification label alone is not a review.

A review requires `identity` (match/mismatch/unknown), `route` (usable/unusable/unknown), `in_segment` (true/false/null), `suppressed` (true/false/null), a nonempty `evidence_ref` and canonical UTC `reviewed_at` such as `2026-09-09T12:00:00.000Z`. Only a matched, in-segment, nonsuppressed contact with a reviewed usable route contributes to the usable count. Canonical candidate IDs must already deduplicate real people across aliases before the trial.

Each run's `costs_micros` has `provider`, `subscription`, `labor`, `infrastructure` and `export` categories, in nonnegative integer microdollars. One dollar is 1,000,000 microdollars. Use actual attributable costs allocated consistently to the trial, without double counting. Explicit zero means measured zero; null or an omitted category means unknown and prevents a total/unit-cost comparison. `user_seconds` is optional whole seconds. No usable contacts means undefined unit cost.

The output preserves all candidates in denominators, reports unknown reviews, and includes paired usable-contact counts and observed cost/time differences. It always leaves `superiority_established` false: representative sampling, independent evidence review and statistical uncertainty still need assessment. The regression tests use fictional outcomes solely to verify evaluator behavior.

## Interpreting uncertainty

Optionally supply `candidate_segments`, an object mapping every candidate ID to one opaque segment ID, with no missing or extra candidates and at most 50 segments. Define these assignments before reviewing outcomes; the evaluator checks completeness, not when the assignments were made. Segment output includes each run's confirmed usable coverage, its interval and paired usable counts, with all requested candidates retained in the segment denominator. Costs are not allocated to segments without measured attribution. Selecting favorable segments after seeing results cannot support a superiority claim, and multiple segment comparisons need an appropriate analysis.

Each run includes approximate two-sided 95% Wilson score intervals for confirmed usable-contact coverage and the identity-error rate among identity-reviewed outputs. The calculation follows the [NIST proportion confidence-interval formula](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm). Zero observed errors still have a positive upper bound; no reviewed identities produces a null identity-error interval.

These intervals assume independent representative candidates. They do not repair selection bias, correlated contacts within companies, missing reviews or inconsistent evidence standards. Coverage describes confirmed usable outcomes under the review rules, not unknowable true usability of unreviewed records. Separate run intervals do not test the paired difference; interval overlap or non-overlap must not be used as the evaluator's winner rule. Cost uncertainty and a defensible paired superiority analysis remain outstanding, and `superiority_established` stays false.

## Continuing work

The existing task automation is active every 10 minutes with the old cutoff removed. Keep working on independent authorized engineering when one external dependency is missing. Record every batch's tests, publication/deployment state and remaining gaps. Do not mark the objective achieved because of a checklist or fictional demo results.

## Required cost ceiling

The user requires no more than **$2 per lead**. With the confirmed priority of data quality and cost per usable contact, the acceptance ceiling is $2 all-in per unique, reviewed usable lead. Include provider/verification charges, attributable subscriptions, labor, infrastructure and export costs, including spend on missing, rejected and unusable results. The earlier 20% relative savings target cannot substitute for this absolute ceiling.

Each benchmark run now reports `cost_ceiling_assessment`: `pass` at or below 2,000,000 microdollars per reviewed usable contact, `fail` above it, or `unproven` when any cost is missing or there are no reviewed usable contacts. Compare unrounded totals against the usable count. A pass describes the measured cohort only; it does not establish future pricing, independent evidence validity or superiority over Wiza.

Provider batch reservations and daily caps are existing spend controls, not an all-in usable-lead cost guarantee. Do not enable or scale a paid acquisition workflow without a costed plan satisfying this ceiling and a defined stop rule. Real licensed outcomes and attributable costs remain necessary to validate the target.

For automated acceptance, use `node scripts/evaluate-contact-benchmark.mjs .tmp/benchmark.json --require-cost-ceiling prospectpilot`, substituting the exact run label. This emits the aggregate report and exits 0 only when that selected run meets the observed $2 ceiling; exceeded or unproven costs exit 2. Missing run labels, malformed arguments and invalid input fail with exit 1. Ordinary report mode remains available without the flag. This gate does not validate licensing, evidence truth, or future unit costs.
