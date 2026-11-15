# Explicit firm snapshot loader

Status: isolated read-only draft, November 15, 2026. Not production-wired.

## Scope and honest completeness

`firm-scoped-snapshot.mjs` supplies `createFirmScopedSnapshotLoader`. It reads a bounded **metadata inventory** of explicitly assigned source contacts, source lists, source discovery leads, and explicitly assigned receiving contacts. It is not a transferable data bundle or a whole-account offboarding snapshot.

The returned object has `inventory_complete: true` only for the enumerated, supported metadata collections at one database read point. It always has `complete: false`, `can_execute: false`, and explicit coverage exclusions. The legacy `previewAdvisorReassignment` rejects this object. This deliberate incompatibility prevents a partial firm inventory from being presented as complete account offboarding. There is no production route, feature flag, mutation path, automatic enrollment, migration registration, or provider call.

The existing schema does not authoritatively associate private work, account-wide queues, schedules, detached tasks, import batches, research runs, tombstones or global suppression with a firm. The loader does not infer that authority from a Firebase UID, email, billing entitlement, shared legacy team, or a child reference. Those resources need their own reviewed ownership model before a usable complete offboarding preview can be enabled.

## Server authentication and transaction

Construct one loader per authenticated request with a server-owned PostgreSQL pool, Firebase Admin `auth`, the request's session cookie, and a server-selected firm ID. The function accepts only source and target UIDs. Never expose the factory or adapter settings to the request body, and never reuse or cache a loader.

1. Verify the session cookie with Firebase revocation checking enabled. Require the same verified-email and Google/password provider rules as `handler.mjs`.
2. Check out one client and begin `REPEATABLE READ READ ONLY`. Verify the actual transaction settings, with statement (5 seconds), lock (1 second), and idle-transaction (15 seconds) timeouts.
3. In that transaction, authorize an active owner/supervisor in an active firm and the exact active/departed source plus active target memberships before any inventory/account enumeration.
4. Resolve source/target account state through Firebase and require an active, verified target. No email, claims, credential, lease token or account metadata enters the inventory.
5. Load assignments, legacy owner checks and every supported child collection on that same client and read point. Root assignment/legacy ownership drift fails closed.
6. Check the requesting session again before commit. After commit, use a second short read-only transaction to recheck current firm membership and detect revocation committed during the snapshot.

Firebase and PostgreSQL cannot form a distributed atomic snapshot. A status change after the final check remains possible. The metadata is a point-in-time read, not a cached authorization grant, tenant-isolation mechanism for legacy APIs, transfer approval, or account-revocation guarantee. The eventual write path must independently reauthorize and lock its inventory. The caller must configure pool acquisition and Firebase network timeouts; database timeouts do not bound those external waits.

Errors roll back and release the client. Rollback failure evicts it. Queries are read-only except transaction-local settings. There is no snapshot pagination token; more than 1,000 rows in any collection, 5,000 total rows, excessive identity keys or a 2 MB response is refused rather than silently truncated.

## Supported metadata and scope closure

- Root records: explicit `firm_*_assignments`, matching actual owner, IDs, receiving/source contact identity keys, rights-review digests/timestamps and the untouched discovery `legacy_team`. A legacy team is never relabeled as a firm.
- List members and shares: only source assigned lists; recipient UID, role and creation time, never recipient/owner email. A mixed list member or incoming membership from an unassigned list causes refusal.
- Contact links: both source endpoints must be explicitly assigned, with the original source author. Private endpoints are not returned.
- Observations, qualifications, activities, rest periods, call records and lead-bound blocks: only assigned source leads and source authors, with allowlisted metadata columns. Another author's related row is refused rather than silently omitted or reassigned.
- Acquisition metadata: explicitly related source contact/lead endpoints with every non-null endpoint inside scope. Historical actor, owner, source and acquisition dates remain unchanged. No cost or ownership attribution is rewritten.

Identity keys are internal server inventory fields, not suitable for raw HTTP exposure. The future response layer must minimize further. Record payloads, names, notes, phones, observation evidence and full provider reports are never selected. The fingerprint hashes only returned metadata; it does not detect omitted payload-only edits and is never an approval token.

## Fail-closed unsupported resources

An existence-only check refuses linked prospect tasks, research jobs, lab runs, Autopilot, identity reviews, acquisition import/job/run provenance, charges or provider-usage rows because their parent scope is not established. Embedded import/job/run identifiers in assigned contact/lead JSON payloads are also refused; the acquisition ledger captures only initial provenance, so it is not sufficient by itself.

The loader does not fetch the private endpoint or unsupported parent's content to explain the refusal. Unrelated private/other-firm work is not read and is not claimed absent. Account-wide work and tombstones remain unknown even when no related rows are found. Full suppression, shared-touch, provider-budget and import-history coverage is not certified.

Permanent blockers explicitly state that private recipient duplicate coverage is unavailable, serviced-account continuity and the service owner are unverified, data/provider rights need review, and apply is not implemented. Do not treat existing serviced accounts as uncontacted or available prospects. Firm procedures and regulatory applicability have not been determined by this engineering increment.

## Activation and rollback

No numbered migration was added; networking migration 032 is untouched. No production database, Firebase account, private prospect, paid provider or external destination was accessed. The draft schema remains test-only. The loader and draft fixtures enter the Docker build context solely for tests and are not copied into the runtime image. `server.mjs`, `handler.mjs`, and `migrate.mjs` are unchanged.

Revert this code-only branch to remove the experiment. No live data rollback is needed. Before any activation: approve authoritative resource scope and rights, model unsupported queues/provenance/privacy stores, add durable minimized access audit, reconcile the planner contract, validate real PostgreSQL concurrency, and test synthetic staging/authentication flows. No migration/backfill/production activation is authorized here.

## Verification

Focused command: `node --test test/firm-scoped-snapshot*.test.mjs test/image-contents.test.mjs`.

The suite exercises revoked/invalid sessions, exact pair/role membership, owner drift, same UID in two firms, private receiving/source contacts, cross-scope list/link/acquisition edges, original authors, unsupported jobs/runs/imports and embedded provenance, bounded reads, malformed identities, transaction downgrade, real read-only enforcement in PGlite, failure cleanup, final membership recheck, unusual Firebase UIDs and legacy-planner refusal.

`test/firm-scoped-snapshot-postgres.test.mjs` supplies opt-in two-client PostgreSQL tests for one consistent read point during concurrent edits and refusal after concurrent membership revocation. It uses only `POSTGRES_TEST_URL`, random disposable schemas and synthetic data. It never falls back to application database settings. Those tests are skipped when the explicit test URL is absent; PGlite is not claimed as multi-session PostgreSQL proof.

### Final local verification, November 15, 2026

- `node build.mjs`: passed.
- `node --test --test-concurrency=4 test/*.test.mjs`: 793 tests, 790 passed, zero failed, three skipped, 144.8 seconds. Skips are the existing PostgreSQL test and the two new PostgreSQL concurrency tests; `POSTGRES_TEST_URL` is not configured.
- Focused snapshot/packaging suite: 43 tests, 41 passed, zero failed, two PostgreSQL skips.
- All 161 tracked/new JavaScript/module files passed `node --check`; Git whitespace checks passed.
- Independent review found four issues; acquisition closure, unusual UID handling, final authorization timeouts and embedded provenance coverage were fixed and re-reviewed with no remaining actionable findings in the isolated metadata scope.
- Full log: ignored `.tmp/scoped-full.log`; focused log: ignored `.tmp/scoped-focused.log`.
- Not run: real PostgreSQL concurrency, Docker image build (Docker unavailable), real Firebase or staging journeys, remote CI, production migration/activation/deployment or transfer execution. No release-readiness claim is made.


## Networking integration boundary

The later integration includes registered networking migration 032 for an owner-only private capture ledger; the firm-boundary draft schema remains unregistered. A capture linked to any assigned source contact now fails the snapshot closed through an existence-only query. Capture payloads are never selected. Unrelated private captures and target collision-only contacts stay outside the transfer-root inventory and do not alter its fingerprint. Regression tests cover all three cases. No production activation or live migration occurred.
