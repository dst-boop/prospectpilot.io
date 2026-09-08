# Predeployment research audit — historical review
2026-09-05

## Decision
Updated September 6: the user removed the accuracy deployment requirement. The prior benchmark threshold is optional and does not block releases. Passing unit or browser tests is not a measurement of lead-data accuracy.

## Corrections made
1. Person matches require employer context near the name. A same-name person in the same city no longer matches a different employer.
2. Crossref attribution evaluates each author and their own affiliation; coauthors' employers cannot be borrowed.
3. Individual network calls have deadlines within the source budget. DNS resolution waits now honor cancellation, and rejected/redirected response streams are closed.
4. In-flight lookup keys include lead identity details, preventing an edited lead from reusing another identity's pending result.
5. Old machine-matched evidence and cached runs are excluded after the engine version change. User-reviewed evidence is retained.
6. Storage-limit results report omitted records rather than claiming they were saved. Cache results carry the persisted records only.
7. Added a lead overview grouping evidence by category, with links, dates, input identity, and explicit gaps. No wealth, buying intent, or individual layoff claims are generated.
8. Fixed a selection race so another lead's delayed overview cannot overwrite the current lead.
9. The accuracy deployment gate was subsequently removed at the user’s request; normal deployment tests remain.

## Validation
55 automated tests pass in total, including adversarial name/employer matching, cross-author affiliation, storage limits, access isolation, cache behavior, and deployment gate rejection. The isolated one-button browser test passes across all categories with persistence, deduplication and mobile layout.
These tests use synthetic fixtures for matching. They do NOT establish 99.5% real-world accuracy.
The previous live WARN audit loaded all 30 published feeds (38,407 notices at that snapshot), including 194 NY records. That demonstrates ingestion, not independently verified accuracy of every record.

## Source access
Automatic research adapters run server-side using public endpoints. End users do not supply provider keys, links, or external-source accounts. Optional LinkedIn authorization is separate and is not required or invoked.
App authentication is still required. The current production authentication policy remains owner-only; broader customer onboarding has not been verified by this review.

## Historical findings (see PRIORITY-IMPLEMENTATION.md for current status)
- No independent, representative, labeled benchmark for this exact package.
- Source matching still uses bounded text context, not verified biographical entity relationships. Even corrected matching can misattribute nearby people on complex pages.
- Several categories depend on limited indexed public pages rather than comprehensive dedicated databases. GDELT was unavailable in the prior live check.
- WARN lacks 21 jurisdictions in the published manifest; individual feed fields/date quality varies.
- Research execution is browser-driven, not a durable background job. Closing the page stops remaining requests.
- Multi-customer onboarding and real provider availability under production load have not been validated.

## Optional benchmark evidence
The optional benchmark validator accepts accuracy-validation.json for the exact source fingerprint, with independent reviewer identity, implementation review, and at least 600 unique labeled cases spread across all 12 source categories (at least 30 each). Cases must contain id, category, source_url, reviewed_by, and correct.
Cases must test missed relevant evidence as well as false attributions and usefulness against independently recorded expected outcomes, across industries, ambiguous names, locations and unavailable sources. This is a minimum gate, not proof that a biased dataset generalizes.
Acceptance is conservative: zero incorrect cases and a one-sided 95% exact lower bound of at least 99.5%. A changed package invalidates approval. No passing accuracy-validation.json has been created.
The positive gate unit test contains synthetic data solely to test gate logic; it is not a release benchmark.
