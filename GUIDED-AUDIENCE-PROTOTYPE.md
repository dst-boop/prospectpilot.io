# Guided audience manual-search prototype

This is a draft component stacked on the advice-decision candidate, not the deployed security branch. No deployment, account login, paid search, export, contact upload or prospect outreach was performed.

## Architecture
- `audience-catalog.mjs`: dated, edition-specific official UI filter catalog, audience recipe model, plain-text search plan and optional evidence-gated event draft.
- `audience-client.js`, `audience.html`, `audience.css`: client-only guide, no API calls or browser storage. Per-value copy and full-plan fallback; edit/refine; no real lead preview.
- Existing authenticated handler serves `/audience` and its three assets with no-store and connect-src none; existing normal/read-only precedence is unchanged. Server assets and Docker build/runtime allowlists are wired explicitly.
- Contacts links to the guide; the guide hands off to the existing `/prospect?import=1` CSV preview. It does not introduce another importer or change DNC handling.

## Behavior and boundaries
First audience explores potential old workplace plans. Around age 40+ remains a research hypothesis, not an available age filter or proof of assets. Beginner can start broad, choose hands-on/office/both as a planning preference, and optionally narrow industry, title, employer size or geography. Small 10–20-person employers and partners are not excluded by default; no seniority filter is mandatory.

Exclusions are proposals to test against relevant kept, irrelevant removed and relevant missed, not automatic filters or Boolean queries. DNC and permission safeguards cannot be relaxed to improve yield.

Official public documentation establishes these GTM One labels, not Dan's SalesOS UI or entitlements. The guide copies individual advisor-proposed values, not a verified executable query. Text inputs and menus must be matched to the actual account. No age, wealth, retirement date, former-employer or years-of-experience UI filter is invented. Live connector request acceptance elsewhere does not establish this app's integration or validate a UI mapping.

Before upload, actual leads must be reviewed in ZoomInfo. After an authorized export, the existing Contacts preview/import provides review in ProspectPilot. This guide neither fetches results nor automatically evaluates uploaded cohorts. Exports can cost credits; the guide warns before the Excel/CSV action and distinguishes the Export arrow from a remembered destination.

Optional professional-event draft requires a valid nonfuture event date, HTTPS source and advisor-reviewed person-level evidence. This is self-attested review, not app verification. Changing event evidence or audience clears review; rebuilding clears event fields. Source is displayed; no draft is sent. A company event alone does not establish an individual's event or interest.

## Sources
- Filter labels and GTM One navigation, verified November 17, 2026: https://gtm.ai/docs/gtm-one/advanced-search/overview-of-the-filters-available-in-advanced-search
- Export destination and credit cautions: https://gtm.ai/docs/gtm-one/advanced-search/export-advanced-search-results
No logged-in SalesOS account was inspected. The user's actual filter choices and exact paste behavior remain unverified.

## Tests and remaining gates
Run `node --test --test-concurrency=4 test/*.test.mjs` and `node build.mjs`. Focused tests: audience model/client, prospect-auth and image-contents. VM DOM tests cover manual navigation/state/copy; they are not a real browser.

Installed Chromium could not start because the execution environment denied its local socket; browser visuals, actual clipboard permission behavior, real Firebase and actual Docker image execution remain unverified. Do not claim mobile/desktop visual QA from CSS or the synthetic harness.

Independent reviewers found and verified fixes for omitted Docker assets, hidden industry overwrites, inaccessible clipboard fallback, broad-baseline restrictions and reused event confirmation. Before release: integrate with the selected candidate and DNC replay fix (PR 122 is separate), rerun exact-head native/image/browser CI, validate actual account/UI where allowed, and retain existing migration/rollback/production approval gates. No merge or deploy is authorized by this draft.

Final local verification: 1,084 tests; 1,071 passed, 13 native PostgreSQL-only skips, zero failures. Focused final suite: 31/31. Build and diff check passed.
