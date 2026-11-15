# Isolated audited reassignment execution contract

Status: synthetic engineering increment based on PR #97 commit `9b0ba00`. No production writer, route, migration, backfill, deployment or activation is supplied.

## What is implemented

`advisor-reassignment-execution.mjs` is a reusable, server-owned transaction orchestrator. The only concrete storage adapter lives in `test/fixtures/reassignment-execution-fixture.mjs`, in a disposable synthetic state table. It is not a second application database or an adapter for existing prospect records.

The current `firm-scoped-snapshot.mjs` remains `complete: false` and `can_execute: false`. The execution contract intentionally rejects it, as well as the older planner contract. Turning either flag on does not satisfy this contract and is not a valid integration step.

The executor requires:

1. A verified server actor and firm selection. No role, grant, adapter or snapshot is accepted from an HTTP body. The future HTTP boundary must independently verify the current session with revocation checking, origin and authorization controls. There is no HTTP boundary in this increment.
2. An actual `SERIALIZABLE READ WRITE` transaction on one checked-out PostgreSQL client. Isolation settings are checked; statement, lock and idle-transaction timeouts are transaction-local. Pool acquisition and network deadlines remain caller responsibilities.
3. Exact-pair execution authorization before receipt or inventory reads, including idempotent replay. The adapter must lock the active firm, active supervisor/owner, departed source and active recipient membership until commit.
4. An authoritative complete inventory, durable scope version, membership versions, explicit source access/session/worker fencing, active verified recipient, and zero unresolved identity, relationship, share or serviced-account review issues.
5. Versioned, affirmative redistribution rights for each exact firm/source/recipient/record. A legacy ownership assignment, email domain or provider record is not a rights grant. No rights are inferred or invented by the executor.
6. Authoritative versioned manifests for recipient identities, relationships, shares, suppressions, tombstones, rest periods, touch limits, jobs, schedules, imports, acquisitions, costs, privacy, networking, service ownership and provider rights. Jobs and every resumable child task must be terminal, not queued, running, paused or unknown. In particular, a stopped Autopilot parent can retain queued steps; the adapter must enumerate those descendants and refuse them rather than certify quiescence from the parent status. Scope and worker fences must prevent new work from appearing while the transaction runs.
7. A reviewed SHA-256 fingerprint of that entire metadata envelope. It includes content digests, so payload-only changes must invalidate the review, not merely assignment changes. The fingerprint is not authentication or permission.
8. Compare-and-swap using expected scope, exact record IDs, firm, old owner, assignment versions, rights versions and inventory fingerprint. No partial apply is accepted.
9. Reloading the same pinned inventory and verifying that only owner, assignment version and scope version changed. All protected manifests, record content digests, authors, job/cost attribution, rights, membership and access fences remain identical. Suppressions/jobs are neither copied, deleted, cancelled nor reassigned by this module.
10. An immutable, minimized before/after audit receipt inserted and read back on the same transaction before commit. The pinned complete inventory is checked again after audit insertion and final authorization so audit-trigger side effects cannot silently alter protection state. Receipt data contains stable IDs, hashes, versions, counts and actor/pair identifiers, not prospect payloads or licensing text.

## Adapter obligations, not claims of proven authority

The adapter methods are `authorizeAndLock`, `findReceipt`, `loadAndLockSnapshot`, `compareAndSwap`, and `insertReceipt`. Every operation receives the one transaction client. Authorization, receipt reads and snapshot reads must be side-effect-free; only CAS and receipt insertion may write. Deferred commit triggers must not mutate protected collections or receipt content after validation. A production adapter must never open its own connection, use a pool, call a provider, change Firebase state or enqueue external work during this transaction.

The envelope's affirmative fields are attestations from trusted application code. This module cannot establish their truth from `complete: true`, a manifest digest or a role string. A reviewed production adapter must derive them from authoritative storage and defend their full predicate closure against inserts and concurrent changes. All other readers/writers/workers must obey the same scope and access fences. The fixture supplies fictional evidence solely to exercise this protocol.

Each manifest must cover the actual complete protected collection and all relevant bytes; zero-count manifests still need affirmative completeness and a stable digest/version. Contact/lead payload changes, identities, notes, evidence, follow-up dates, historical authors and legacy-owner fields must participate in the proper digest/version. The post-apply reload must read the pinned record set even though those assignments no longer belong to the source.

The adapter must enforce a unique `(firmId, actorUid, idempotencyKey)` receipt key. Receipt storage must be append-only to application roles. Current authority is rechecked before commit. A replay returns the original receipt only after current authorization and an exact original-request match; it cannot cause a second write. It does not constitute a new current-state inventory or claim that nobody subsequently edited the transferred records.

Database serialization/deadlock/lock/uniqueness conflicts fail closed; no automatic retry is performed. A lost COMMIT acknowledgement returns `reassignment_outcome_unknown` and evicts the connection. The caller must reconcile with the same request and idempotency key. It must not claim a rollback, use a new key or re-run unrelated side effects. Audit and assignment changes otherwise roll back together.

## Why production execution remains blocked

The current firm schema has reviewed assignment metadata but no universal monotonic resource/scope versions, authoritative whole-scope privacy/job/suppression model, durable cross-handler/worker fences, immutable transfer receipt store or complete destination duplicate coverage. Firebase revocation and PostgreSQL changes are not a distributed atomic transaction. Existing ownership APIs and workers do not obey the hypothetical fence contract.

Consequently this increment does not make existing private UID-owned data transferable. It does not infer that a team supervisor can access a user's entire directory, move provider credentials or budgets, or treat serviced clients as new prospects. No production adapter or numbered migration has been introduced. A production implementation must first resolve and review those ownership/licensing/security contracts, then prove them with real PostgreSQL and authenticated staging journeys. Do not activate this module against legacy tables.

## Tests and packaging

- `node --test test/advisor-reassignment-execution*.test.mjs` runs synthetic PGlite transaction/rollback tests and opt-in PostgreSQL tests.
- PGlite uses real transactions with a single-connection queue. Its queued-call tests are not evidence of multi-session PostgreSQL concurrency.
- The two PostgreSQL tests use only explicit `POSTGRES_TEST_URL`, random disposable schemas and synthetic rows. They exercise simultaneous idempotent requests and stale competing transfers. They skip when that variable is absent and never fall back to application database settings.
- The execution module reaches Docker's build context only so build-stage tests can import it. It is not copied into the runtime image. The fixture is under `test/`, not `scripts/`.
- Regression tests keep the existing snapshot incomplete and ensure server, handler, Team Lead Hub, migration registry and runtime image do not reference the executor.

Rollback is a code-only revert; there is no live data change to undo. This is an isolated contract and guard-test milestone, not an end-to-end departure workflow or release-ready reassignment feature.

## Final local verification

- Build passed with `node build.mjs`.
- Final full regression run: `node --test --test-concurrency=4 test/*.test.mjs` reported 965 tests, 958 passed, zero failed, seven skipped (164.9 seconds).
- Focused execution suite: 107 tests, 105 passed, zero failed, two opt-in PostgreSQL concurrency tests skipped because `POSTGRES_TEST_URL` is absent.
- All 187 tracked JavaScript/module files passed `node --check`; staged Git whitespace checks passed. The repository has no separate lint/type-check command.
- Independent review identified two safety gaps: error payloads bearing trusted-looking codes, and protected state changing during audit insertion after the first verification. Both were fixed and regression-tested; re-review found no remaining blocking issue in this isolated scope. Receipt field minimization and Unicode-stable fingerprint ordering also have regressions.
- Not run: actual multi-session PostgreSQL execution, Docker build (Docker unavailable), real Firebase/authenticated staging, remote CI, production migration, live reassignment or deployment. No production-readiness claim is made.

Local verification logs are ignored under `.tmp/audited-transfer-final.log` and `.tmp/audited-transfer-focused.log`.
