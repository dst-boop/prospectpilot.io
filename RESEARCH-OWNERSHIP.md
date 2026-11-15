# Research lead ownership boundary

## Policy

`discovery_leads.owner_user_id` is authoritative ownership. A nonempty authenticated UID must match it exactly. `owner_email` is contact/display metadata and does not grant ownership, even when its normalized value matches a signed-in account's verified email. A user keeps ownership after changing email; a different account does not inherit it when an address is recycled.

Rows with null, empty, or missing owner UIDs are not automatically claimed. The current schema requires a non-null UID, but older or malformed records can still exist in imported databases. Recover those records only through a separately authorized, independently verified ownership process. This change does not introduce a migration, claim endpoint, data rewrite, or new admin authority.

Existing administrator access and legacy explicit `shared_with` read/workflow permissions are preserved. Sharing is not ownership: a shared advisor cannot edit identity fields, add owner-only research, enrich, export through ownership-only tools, or delete the owner's lead. The separate email-address-based sharing policy is not redesigned here.

## Covered paths

- Research Lab detail, lists, related people, qualification review, exports, inventory selection, employer fallback, metrics, advisor worklists, activity and scoreboards use the shared UID-only SQL boundary.
- Research Lab import matching and identity-review merge targets use UID ownership or the existing admin role. A reassigned probable-review arrival is hidden from its former owner.
- Suppressed directory handoff links only the requesting UID's records. Deleting a directory copy cannot follow a stale contact link into another UID's lead. Existing opt-out and tombstone behavior remains in force.
- Legacy discovery list/detail, field edits, bulk delete, native research, weekly leads, provider selection and enrichment use UID ownership. Import deduplication cannot mutate a foreign-owned record; an independently supplied import may create the importing user's own copy.
- Enrichment checks UID ownership again inside its atomic commit guard so matching email cannot authorize a transfer between preview/read and commit.

## Verification

`test/owner-identity.test.mjs` uses only synthetic fixtures (in-memory PGlite locally; a fresh isolated PostgreSQL schema when `POSTGRES_TEST_URL` is provided by CI) for recycled-email read/write/delete denial, import deduplication, suppression handoff, stale linked deletion, same-UID changed-email access, tombstone isolation, identity reviews and null/empty legacy ownership.

`test/legacy-owner-identity.test.mjs` covers the legacy API paths, explicit shared access, import scope, and both pre-commit and atomic-commit UID reassignment. `test/database.test.mjs` asserts a same-email different-UID record is excluded from owned weekly/enrichment results.

Build with `node build.mjs`. Run the complete test script with `npm test` (equivalently `node --test test/*.test.mjs`; `--test-concurrency=2` limits local memory pressure). No production credentials, provider calls, live data, or migration execution are needed.

## Release and rollback

No schema or stored ownership changes are required. Existing API shapes and saved data remain intact. Restoring the old code would restore email-based ownership authorization and must not be treated as a security-safe rollback. Publication, deployment and any real ownership remediation are separate authorized operations.

## Isolated baseline port

This branch starts at `b543fa4`, a supplied production marker, not independently verified deployed source. It ports the ownership portion of `c50d17b` (PR #97) without the later daily priorities, pipeline metrics, networking ledger, or allowance changes. The only conflict adaptations retain the baseline worklist and scoreboard response shapes and shift the UID-only SQL parameters. The scoreboard regression asserts baseline `added`, rather than the newer `pipeline.records` field.

Dependencies, package lock, migration list, all SQL schemas, runtime deployment configuration, and the release scripts are unchanged. The same 12 ownership regressions run against PostgreSQL 16 in CI; CI checks out the PR head explicitly. The draft targets a frozen baseline branch so its merge does not silently include newer main changes. No production database, deployment, migration, or real ownership remediation is performed.

Legacy records without a usable owner UID become unavailable to ordinary users even if email matches. Existing administrator access and explicit legacy sharing remain separate permissions. The size of affected production inventory is unknown because no live-data audit was performed. Treat loss of access as a recovery case, never automatically reattach by email. Deploying requires independent source/image/schema provenance and release approval. A code rollback has no schema rollback requirement but would reopen the email-reuse authorization vulnerability; prefer a forward fix.

### Baseline test-clock correction

The first full run produced 596 passing tests, three failures, and one local PostgreSQL-only skip. All three failures reproduced on unchanged `b543fa4`: October report windows excluded database-clock ledger rows written in November. This branch also ports only `test/lead-costs.test.mjs` from the existing test correction `0635b0c`, fixing fixture timestamps without changing production accounting behavior or adding dependencies.

Direct synthetic baseline-versus-hotfix probes confirmed the security difference: recycled-email visible records changed from 1 to 0; foreign stale-link suppression changed from true to false; UID-less email-matched visibility changed from 1 to 0.
