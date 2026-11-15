# Legacy owner recovery: aggregate inspection and future approval protocol

Status: isolated engineering draft based on PR #97 commit `c50d17b`. No production activation or data access. The only implemented capability is a read-only aggregate count. A safe production recovery writer is **not** implemented.

## Why this stops at counts

PR #97 makes a nonempty exact `discovery_leads.owner_user_id` authoritative. A null/blank value provides no immutable original account identity. The current schema does not contain independently verified ownership-recovery cases, durable per-record approval bindings, immutable recovery receipts or fences respected by every legacy handler/worker. An administrator's access to a record is not evidence of its rightful owner.

Consequently no email-match backfill, claim endpoint, owner suggestion, assignment mutation, automatic migration or transferable recovery token is supplied. There is no basis to infer how many production records are affected. These tests use only fictional records. Existing administrator and explicit sharing access means that a candidate is not necessarily inaccessible to everyone.

## Implemented aggregate inspector

`createLegacyOwnerRecoveryInspector` in `legacy-owner-recovery.mjs` is a single-use server-owned factory. There is no CLI, HTTP route, UI, environment-variable configuration or live database fallback. Its returned function accepts no arguments.

The caller must provide its PostgreSQL pool, real Firebase Admin authentication adapter, request session cookie, an explicitly configured narrow list of at most 16 operator UIDs, and the existing server-selected legacy team scope. Never accept these dependencies, allowlist or team from an HTTP body. The allowlist is an extra restriction, not an admin grant: the exact authenticated UID must also already have `discovery_users.role = 'admin'`.

1. Check the session using `verifySessionCookie(cookie, true)`, including the application's verified-email and Google/password provider requirements. Verified email is only an existing sign-in requirement, never owner evidence. No role/email/domain claim can add an operator.
2. Use one checked-out client and a verified `REPEATABLE READ READ ONLY` transaction. Set transaction-local 5-second statement, 1-second lock and 15-second idle-transaction timeouts. Check the stored admin UID before examining lead counts.
3. Return only separate aggregate counts for null, empty and all-whitespace owner UIDs in that legacy team. Whitespace follows the ECMAScript trim character set. Do not trim, case-fold, repair, classify or validate any nonblank UID. A missing Firebase account with a nonblank UID is outside coverage.
4. Commit, begin a new verified `READ COMMITTED READ ONLY` transaction, recheck current database admin authority, and revalidate the same session UID before returning counts. This detects demotion/revocation during the count; it is not an atomic Firebase/PostgreSQL authorization guarantee.
5. Sanitize dependency errors, roll back failed open transactions, and evict a client after failed rollback or uncertain read-only commit. Never return raw driver/auth errors or attached causes.

The result has `can_execute: false`, `recovery_eligible: false`, `production_ready: false` and fixed review blockers even when counts are zero. It contains no record IDs, UIDs, email addresses, names, payloads, shares, per-firm breakdowns or target-owner guesses. The count query does not read payloads or related tables. Counts describe a read point, not a complete inventory, proof of data rights, recovery eligibility or an authorization capability.

The future production caller must set pool acquisition and Firebase network deadlines, cap/rate-limit inspection requests, prevent shared caching, and supply durable minimized access auditing. Those controls are not implemented here, so this factory must remain unconnected to production. Prefer an inspection database role with only SELECT on the necessary team/owner and admin UID/role columns, plus no mutation privileges; transaction read-only is defense in depth, not replacement for database grants. Do not change production privileges as part of this branch.

## Required future recovery protocol (design only)

### 1. Open an exact, restricted case

A separately authorized recovery operator opens a case for an explicit bounded set of immutable record IDs. User-facing requests must not reveal whether a guessed record exists or let a claimant browse candidate records. Record inspection requires its own narrowly scoped access decision and audited action. Do not infer original ownership from a name, email, current email verification, company domain, billing membership, legacy team, shared access, linked contact or firm role.

### 2. Establish and retain independent evidence

Bind the case to the authentication issuer/project/tenant and exact target Firebase UID. Resolve the target through the trusted Admin API, require an enabled account and fresh authenticated proof of control. A signed one-time challenge can establish current account control, but does **not** establish historical record ownership.

Independently prove the original account-to-record relationship using authoritative retained provenance such as an authenticated original acquisition/import audit with immutable actor UID and exact record linkage, corroborated by the administrator's reviewed records. Email or a mutable payload field is not an acceptable fallback. If the original account was deleted, binding a replacement UID requires a separately approved identity-recovery decision based on independent evidence. If that proof cannot be obtained, leave the record quarantined rather than guess.

Persist a durable case with exact record IDs, expected missing/blank owner values, target auth namespace/UID, versioned evidence references/digests, evidence verifier UID, decision rationale, case version and timestamps. Evidence documents belong in restricted storage; the database/audit should hold references and digests, not secrets or copied private documents. Draft case information is not an authorization grant.

### 3. Review rights and all dependent state

A second authorized administrator must review the exact binding and evidence, distinct from the proposer and claimant. Review data consent/provider restrictions and whether this is restoration to the established owner or an ownership transfer requiring the separate transfer process. Scope review to each exact record, not all records associated with an email.

Inventory and version the root plus linked contacts/lists, `shared_with` and list shares, observations, authors, import/acquisition provenance, activity, suppression/tombstones, DNC/rest periods, touch limits, serviced-client status, costs/budgets, queues/jobs and networking history. Unresolved foreign ownership, provider rights, conflicting identity, stale firm assignment, private cross-scope references or incomplete worker fencing blocks execution. Do not enumerate private/other-firm content merely to explain the refusal.

Preserve existing sharing exactly, including its original recipients and limitations. If retaining a share conflicts with privacy/consent, stop for a separate authorized sharing decision; do not silently remove, broaden, relabel or convert sharing into ownership. Do not automatically reassign related contacts, resurrect suppressed records, enroll a firm member, re-enrich, resume jobs, move credentials or contact a prospect.

### 4. Bind approval to the reviewed version

Store a one-use expiring approval that binds the case version, exact immutable record set, original owner values, target identity namespace/UID, complete protected-state digests/versions, evidence review, proposer, independent approver and allowed action. Use a server-minted nonce/idempotency key. A hash or preview fingerprint alone is not a permission token. Any change to identity, record set, evidence, state, authority or scope invalidates the approval and requires a fresh review.

### 5. Execute atomically only after prerequisites exist

A future server-only writer must reauthenticate with revocation checking and reauthorize the recovery roles immediately before a serializable transaction. Lock the case, approval, records, authoritative review bindings and all scope/worker fences. Ensure the target account remains valid; Firebase and PostgreSQL cannot form a distributed transaction, so a documented fencing/recheck strategy is a prerequisite, not an assumption.

Use compare-and-swap against the exact still-null/blank owner bytes, immutable ID, version and full reviewed content/protection digest. A now-nonblank owner, concurrent privacy change or unresolved job prevents every mutation in the batch. Update only the authoritative root owner UID and explicit recovery bookkeeping; preserve original contact metadata, shares, payloads, authors, dates, acquisition/cost attribution, suppressions and provider evidence. Do not copy identity assertions into unrelated legacy metadata or normalize other ownership fields without a separate reviewed migration.

Insert an append-only minimized receipt on the same transaction, including actor/approver, case/evidence versions, target identity namespace/UID, exact IDs, before/after ownership states, protected-state digests, approval nonce, outcome and timestamps. Re-read postconditions after audit insertion and before commit so audit triggers cannot silently change protected data. Application roles must be unable to edit/delete receipts. A failed audit insert rolls back ownership changes.

The unique approval/idempotency key prevents double application. Replay requires current authorization and an exact matching request and returns the original receipt, not a new assignment. Serialization/conflict errors fail closed with no automatic blind retry. A lost commit acknowledgement has an unknown outcome: reconcile the original request/receipt, never retry under a new key or claim a rollback.

### 6. Validate and roll out separately

Before activation, implement the durable evidence/review/audit schema, operator provisioning, every dependent-state/fence adapter and a least-privilege writer. Independently review the implementation, test multi-session PostgreSQL races and current authenticated staging flows with synthetic data, coordinate the next migration number, and obtain explicit operational approval for any real inventory or remediation. A clean synthetic test run does not approve production recovery.

A mistaken recovery needs a new reviewed reversal linked to the original receipt. Revoke the new access through the established authorization layer, compare current versions, preserve subsequent legitimate work and privacy restrictions, and never blindly overwrite the owner with an old blank value. Roll back code by disabling the recovery entry point; retain evidence, approvals and receipts. Do not restore the vulnerable email-ownership policy.

## Firm hub and concurrent release boundaries

- `firm-preview-boundary.mjs` requires an explicit reviewed assignment and equality with the actual existing root owner UID. A null/blank root fails that equality. Do not relax it to recover a legacy row.
- `firm-scoped-snapshot.mjs` is explicitly incomplete for account offboarding and cannot authorize recovery. A firm assignment may be reviewed corroborating evidence, but alone is not sufficient proof of historical ownership or data/provider rights.
- `advisor-reassignment-execution.mjs` handles a separate synthetic transfer contract. Its complete-inventory/fencing/receipt prerequisites are absent from legacy recovery too. Do not route a missing owner through its source-to-target transfer path or enable it by flipping completeness flags.
- This branch changes none of those modules, the production handler/server, migration registry, ownership predicates, shared access or networking release-gate branch. The inspector is in Docker's build context solely for tests and is not copied into the runtime image.

## Verification and rollback

Run `node --test test/legacy-owner-recovery*.test.mjs` for focused synthetic coverage and `node build.mjs` followed by `node --test --test-concurrency=2 test/*.test.mjs` for repository verification. Opt-in PostgreSQL tests use only explicit `POSTGRES_TEST_URL` and disposable random synthetic schemas, never application database settings. PGlite tests are not evidence of multi-session concurrency.

This fallback is a code-only reversible draft. It has no migration or live state to undo. Verification results are recorded after the final run; no production row count, live Firebase check or deployed behavior is claimed.

### Final local verification, November 15, 2026

- `node build.mjs`: passed.
- `node --test --test-concurrency=2 test/*.test.mjs` (the complete package test script with bounded concurrency): 1,016 tests, 1,007 passed, zero failed, nine skipped, 232.8 seconds. The nine skips are opt-in real-PostgreSQL checks; `POSTGRES_TEST_URL` is absent.
- Focused recovery suite: 28 tests, 26 passed, zero failed, two PostgreSQL concurrency skips.
- All 195 tracked/new JavaScript/module files passed `node --check`; Git whitespace checks passed. There is no separate lint/type-check script in `package.json`.
- Independent review found an uncertain-BEGIN cleanup gap. Both transaction stages now roll back and evict after any failed BEGIN acknowledgement; new regressions reproduce the lost-acknowledgement case. Re-review found no remaining actionable findings in this isolated fallback and design scope.
- Full synthetic logs are retained in ignored `.tmp/legacy-recovery-full.log`; focused logs in `.tmp/legacy-recovery-focused.log`.
- Not run: real multi-session PostgreSQL, Docker image build (Docker unavailable), real Firebase/authenticated staging, remote CI, production inventory, recovery, migration or deployment. No production-readiness claim is made.
