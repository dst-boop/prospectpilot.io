# Full-function schema033 rollback artifact draft

Dan chose to wait for a safer rollback rather than deploy without one. This draft builds toward that requirement; it does not approve a floor or authorize rollout.

## Frozen source and explicit entrypoints

Starts at reviewed draft129 fd4964501f2a498eb3222fec344d3b774f0e3bb5. Current UID ownership, alias deletion, DNC, advice-decision rules, observations and normal application functions are retained. No return to old112 DNC/qualification semantics. Normal application entrypoints are unchanged.

The optional Docker target `rollback-runtime` starts `rollback-server.mjs`. `rollback-worker.mjs` is the corresponding explicitly invoked worker entrypoint. Both inspect the exact033 schema before importing normal app/worker startup, and never migrate. Explicit read-only degradation is refused by these full-function entrypoints; this is not a new decision to remove commitment recording or other service. The default Docker target remains normal production.

A dedicated connection holds a shared advisory lock505002, the migration runner's exclusive lock key, through runtime lifetime. Busy migration lock, failed inspection or a lost guard connection prevents/terminates startup. Workers release the guard after completing. The web process keeps it until process exit. This fences cooperating migrations, NOT arbitrary DDL, other revisions or schedulers. Startup inspection is not a replacement for externally verified quiescence. Running workers can execute existing queues: never start them merely because web recovery passes; explicitly review reservations, leases and pending work first.

## What the artifact proves and does not prove

This is an independently versioned build of a frozen core, not an independently reimplemented auth/evaluation system. It can protect against subsequent release regressions only after compatibility with that successor is rehearsed. It cannot recover from a defect already shared by this core. Image IDs printed in CI are local build identities, not published immutable registry digests or approved floors.

Schema inspection covers the version ledger and declared schema contract. It is not an attestation of database privileges, infrastructure, user identity or arbitrary changes after inspection. Unsupported/missing/intermediate/future/drifted schema is refused. That refusal does not deliver application service on029. Full advice decisions cannot be represented under029's observation CHECK. Therefore this draft does not solve the initial029→033 bootstrap merely by existing; a separately verified quiesced transition/restore plan remains mandatory.

The exact runtime-image rehearsal uses disposable native PostgreSQL, synthetic identities and no providers. It checks full-function guarded handler return, unchanged preexisting rows, normal activity writes, decision qualification, recycled-email UID denial, retained pending/leased/reserved work, same-number DNC replay/export denial, and capture-only alias tombstones. It does not test a different successor image, actual server entrypoint/Firebase credentials or production rollout. Those are explicit remaining gates, not implied by green tests.

## Before any floor registration or rollout

- Native PostgreSQL and exact image tests, independent review, real server/bootstrap and real-auth staging, published immutable image and source provenance.
- Rehearse the actual successor→this exact image with unchanged033 schema and all security/DNC/advice contracts. No schema down-migration or observation deletion.
- Verify current production schema/revisions/jobs/traffic, backup/PITR and tested restore, all writers fenced and drained, maintenance/abort/recovery owners and time/loss objectives.
- Establish a viable initial029→033 recovery procedure without legacy qualification or blind paid-work replay.
- Only then nominate/approve the immutable floor under the release policy. `floors:[]` is intentionally unchanged. No merge/deploy or production action in this draft.
