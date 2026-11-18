# Synthetic initial029→034 preactivation rehearsal

This isolated follow-up preserves green draft137. It does not authorize a migration, production outage, floor registration or deployment.

## Precisely limited scenario

The rehearsal uses pinned historical029 source `b543fa4e52ee40f2e78a793733b9fbc3f6d29d50` and target source from green137 `358e0c9d8d737fb6c1082fae829c17f96cafb7dc`, with synthetic saved records only. It runs only against an explicitly allowlisted loopback test database and the exact local PostgreSQL16 service container. The runner strips cloud/provider credentials and remote Docker configuration.

A dedicated synthetic writer role/session demonstrates activity and then quiescence. Revocation/termination is scoped to the role and sessions created by this fixture. This does not discover, fence or attest production application revisions, jobs, schedulers or privileged writers.

A schema-scoped native backup is taken after quiescence. The test checks PostgreSQL16 and matches the container cluster identifier/database to the fixture connection before backup. It preserves schema/data, sequence state, object owners and effective privileges. Docker uses only the local Unix socket; both client and in-container commands have bounded time/output. Injected failures during030–034 must restore the original transactional state. Successful034 migration must preserve original029 data and satisfy the guarded runtime contract. A preactivation abort then restores the native029 backup, verifies schema and saved data, and invokes historical application code only after029 has been restored. Old application code is never assumed safe on034.

## Restore boundary

This is a **preactivation abort**, with no accepted post-backup application writes. It is not a guarantee that an029 backup can recover new034 advice decisions, historical identity reviews or other new work. Any accepted post-backup work requires a separately reviewed loss/replay decision and compatible recovery plan; this rehearsal supplies neither permission nor that plan.

## Remaining production gates

Real database/role topology, complete writer inventory and drain, backup/PITR and independently tested restore, maintenance owner/window, real Firebase/session validation, normal worker behavior, image provenance and successor-to-floor compatibility remain separate. Local PGlite tests cannot prove native pg_dump/pg_restore. Native CI results must be recorded before claiming this rehearsal passed. No production data or external providers are used.
