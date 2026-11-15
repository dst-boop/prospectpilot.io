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
