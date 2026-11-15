# Schema 029 → 033: quiesced pilot release plan

Status: draft operating plan, not authorization to execute. No production mutation has been performed by this validation work. This supersedes no existing security gate. `scripts/release-rollback-policy.json` remains empty. Do not run `release.sh` or bypass its floor gate until the release path and evidence below are reviewed.

## Known inventory and evidence

- Project `lead-qualifier-505002`; region `us-central1`; web service `prospectpilot`; research job `prospectpilot-research`.
- Migration job is named `prospectpilot-migrate` in release.sh; verify deployed configuration/identity before use.
- Parent reports a five-minute scheduler and backup/PITR/deletion protection enabled earlier at 20:18 UTC. These are historical observations, NOT current readiness evidence. SQL instance/database, exact scheduler, retention/recovery window, storage headroom and backup completion require fresh verification.
- Baseline is hardened schema029 production source138dcbe; target is reviewed PR109 plus selected validation/fallback improvements. Resolve final commit and immutable image digest after integration. PR numbers or branch names are not release identifiers.
- PR111 passed normal advisor workflow + Chromium desktop/mobile validation and native suite. PR112 exact5616b8d native621 tests/image gates passed; synthetic10,000-row DDL took23ms, but this is NOT a production duration estimate. PR113 exacte510ebac native1053 tests/image gates passed; later UI/staging changes need their own exact-head evidence.

## Decisions required before scheduling a window

Owner/release operator must approve an outage window and recovery objectives. Proposed safety objective: no accepted application writes lost; no paid jobs replayed without reconciliation. No numeric RTO is promised until timed isolated restore/rehearsal demonstrates it. Establish an explicit abort time that leaves the measured restore/recovery duration within the window.

There is no approved rollback floor today. The PR113 read-only mode is a PR109-derived degradation option, NOT independent protection against bugs in its retained evaluator or shared authentication/read modules. PR112 preserves rows/security but changes advice-decision prioritization; do not silently choose that semantic downgrade. If neither is safe, remain in maintenance and fix forward or restore through a reviewed plan.

## Gate A: evidence before production access

1. Integrate reviewed commits without changing security fixes; record source SHA, CI run, immutable registry digest, build provenance and dependency lock hash. Verify the same digest, not a later rebuilt tag, in isolated staging.
2. Rehearse schema029→033, normal synthetic workflow, read-only activation, blocked writes/providers, tenant isolation, worker no-op, recovery, deletion aliases and failed-migration rollback against PostgreSQL and that image. Record all failures/limitations. Real authentication remains a separate signed-in gate if test identities are synthetic.
3. Record table sizes/row counts, indexes, constraints, live transactions/locks, pool capacity and disk headroom through read-only production inspection. Do not print prospect rows or secrets. Rehearse a representative volume and workload based on aggregate evidence; 10k fixtures alone do not establish capacity.
4. Verify successful backup completion, PITR enabled and earliest/latest recoverable timestamps, retention, service-account access and restore location/capacity. Exercise a restore into a separately approved restricted environment and validate schema, counts and ownership/deletion invariants. A backup entry is not a restore test. Production data must not enter public CI, screenshots or local fixtures.
5. Inventory all writers: web revisions/tagged URLs, research scheduler and active job executions, migration/catalog/import jobs, external webhook delivery, direct administrative scripts. Capture sanitized resource configuration and exact pre-window revision/digests. Never publish secret-bearing environment snapshots.

## Gate B: quiesce, then backup checkpoint

1. Announce maintenance duration and limitations. Pause the verified scheduler and any additional writers through the reviewed deployment procedure. Keep queues intact; do not mark work complete or delete it.
2. Route public traffic to a maintenance response that accepts no mutations; include webhook503 so delivery retries rather than acknowledging unapplied events. Disable alternate reachable revision/tag routes or prove they cannot write. Do not use the schema033 read-only app against schema029.
3. Drain existing HTTP requests and existing research executions. Inspect provider reservations, job leases and external requests already in flight. If they cannot finish safely, STOP and choose explicit cancellation/reconciliation; a new worker flag cannot cancel an old process. Never kill database sessions automatically.
4. Verify no application writers or long-running readers remain through Cloud Run execution and PostgreSQL activity checks. A quiet homepage does not prove quiescence. Observe at least one former scheduler interval without new execution and record zero active writers.
5. Create/verify a consistent pre-migration backup checkpoint after writes stop; record its completion, timestamp, schema029 ledger, aggregate row counts and exact serving image. Confirm PITR target and tested restore procedure. Retain the checkpoint through the agreed release verification period.

## Gate C: migrate once

Run only the reviewed immutable migration image, exactly one task/parallelism1/max retries0, preserving verified runtime identity, database and secret references. Do not refresh plan catalogs or run unrelated jobs in this window.

`migrate.mjs` runs all pending migrations in one transaction with advisory lock505002, lock_timeout5s and statement_timeout120s. Migration030 and033 replace the observation CHECK constraint;031/032 create tables/indexes/FKs. Locks can block readers and writers until commit. The existing release script's task timeout180s is a separate wall-clock ceiling: compare it with measured total migration duration, not a single statement limit. Do not raise timeouts reactively during contention.

Success gate: task exit0 AND ledger001–033 complete in the intended database AND required tables/constraints/indexes present AND aggregate data unchanged except expected new structures. Capture task execution ID and elapsed duration. Do not infer commit from a disconnected console or partially streamed log.

Failure gate: keep maintenance, inspect transaction outcome. Verify ledger/schema/data remain029 if transaction rolled back. On ambiguous timeout/disconnect, inspect database before retrying. Do not rerun automatically, drop constraints or delete ledger rows. If schema033 committed, do not run ad-hoc down migrations; new decision/capture data must remain preserved.

## Gate D: validate before reopening

1. Start the exact target web image with no ordinary traffic. Keep workers/scheduler paused. Verify release ID, expected feature versions, schema033 readiness, correct identity/connection and signed-in UID isolation.
2. Exercise owner-authorized synthetic canary records only: review decision/residence/contact → priority → follow-up → reload; include duplicate save and wrong-UID denial. Keep fixture IDs for cleanup using the tested deletion path, never broad SQL deletion.
3. Demonstrate the read-only candidate on schema033: authenticated worklist/brief still use advice-decision policy; all mutation routes/webhooks fail closed; worker produces executed:false and no provider/DB job changes. Verify visual search/pagination at desktop/mobile widths after improvements.
4. If healthy, route web traffic deliberately and monitor failures/latency/lock waits. Reconcile webhooks, paid reservations, expired leases and queued work BEFORE enabling normal workers. Resume one controlled worker execution, verify its outcome/costs, then restore the verified scheduler. Do not blindly drain/replay paid jobs.
5. Confirm public/custom-domain and signed-in behavior, deletion/privacy invariants, correct worker image, no stray writer revisions and backup availability. Record monitoring owner and explicit rollback/degradation triggers.

## Degradation and recovery

For a normal-mode mutation/worker fault with healthy retained reads, maintain queues, quiesce old revisions, set PROSPECTPILOT_READ_ONLY=true consistently on web AND worker, verify exact image/mode and no writes before restoring read access. Exports, edits, follow-up logging, networking, providers, billing and webhook application are unavailable; tell advisors not to assume commitments are saved.

For authentication/privacy, corruption or evaluator faults, do not rely on this fallback. Block access and investigate. Restore to a new isolated database rather than overwriting the only copy; validate it, quantify any post-checkpoint writes, then obtain the necessary cutover approval. A restore can lose accepted changes if quiescence was incomplete.

To recover normal service: validate the corrected exact image, preserve new schema/data, reconcile queued/provider/webhook state, disable read-only on both components only through reviewed rollout, run one controlled execution and then resume cadence. Never claim restoration complete from health/version alone.

## Evidence record (complete before go/no-go)

Final source/digest/provenance: PENDING
SQL instance/database/scheduler/identities: PENDING fresh verification
Backup/PITR checkpoint and successful restore evidence: PENDING
Representative migration and quiescence timing: PENDING
Exact-image activation/recovery + real-auth tests: PENDING
Approved outage/abort time/RTO and recovery owner: PENDING
Approved rollback floor/release gate decision: PENDING; do not bypass
