# Networking rollback compatibility candidate

## Scope and release limits

This is an isolated compatibility candidate based on
`b543fa4e52ee40f2e78a793733b9fbc3f6d29d50`, not an assertion that this source or
any image built from it is currently serving. It does not change the migration
runner (001-029), expose networking capture routes, or enable capture writes.
It does not merge the wider advisor integration or active feature branches.

The existing test-clock fix from upstream `0635b0c` is also retained in
`test/lead-costs.test.mjs` so October-only fixture windows do not break later
builds. No lead-cost application behavior or generated output is changed.

Only the deletion implementation is forward-compatible with a database where
migration 032 and captures already exist. The candidate retains its own
`identityLookupKeys` callback and identity dependencies; the PR99 gate imports
those actual modules rather than substituting the gate's newer callback.

This branch is a candidate for a future rollback floor, not an approved rollback
target or a production deployment. Do not deploy, migrate, change traffic, drop
032, or roll back to b543fa4 as a consequence of these tests.

## Deletion behavior

- Before 032: check table presence without selecting from a missing table.
  Deletion is allowed only when the migration ledger exists and has no 032.
  This avoids PostgreSQL's aborted-transaction behavior after undefined_table.
- With the capture table: read only the deleting owner's linked capture person
  fields, normalize them using this candidate's dependencies, hash all directory
  and Research Lab identities before the FK cascade, and retain no private notes
  or referrers. Another owner's aliases never become a shared block.
- If 032 is recorded but the table is missing, or table absence cannot be checked
  against a ledger, return 503 before any writes. Any schema probe, ledger read,
  capture read or normalization error aborts deletion; none becomes an empty list.
- Recheck on every deletion. No startup or cross-request schema cache can keep a
  pre-032 assumption after migration. The existing writer/deleter locks remain.

The ledger is an operational invariant, not tamper-proof evidence. The system
must not drop captures or erase ledger history, and must not route deletion to
an incompatible older revision once any capture has been saved. Already lost
private aliases cannot be reconstructed by this candidate.

## Tests

`node --test test/rollback-compatibility.test.mjs test/forget.test.mjs` exercises
pre-032 deletion, post-032 private alias hashes, transactional rollback, owner
isolation, directory/Lab reimports, missing table/ledger, and capture-read errors.
The same contract runs on PGlite and, with an explicit `POSTGRES_TEST_URL`, native
PostgreSQL. Only a verified disposable loopback database named with `test` may be
used; the guard cannot distinguish a production tunnel from a real local server.
Fixtures and imported people are synthetic; no provider calls are made.

The schema 032 fixture is the exact reviewed SQL from PR99 head
`3ba8bdbe55105fc0b9c83e2e3307966aa6499109`. It lives under `test/fixtures`, is
hash-checked, and is not registered as a release migration.

CI checks out the candidate's exact PR head and runs the full existing suite
against its PostgreSQL 16 service. It then checks out the pinned PR99 head into
an ignored directory and runs its non-skipping native rollback gate against:

1. This candidate's `forget.mjs` and `prospect-workspace.mjs`.
2. Those modules, and their own transitive dependencies, extracted from the
   runtime `/app` directory of the image CI just built.

The PR99 contract reconstructs 001-031, upgrades to 032 twice, captures private
aliases, calls the external candidate deletion/callback, and checks directory,
networking and Research Lab reimports. This tests forward deletion compatibility
with that schema. It does not establish that all 030/031-era app behavior is
supported by this old application, or validate an unknown live migration ledger.

CI saves the exact candidate commit, local content-addressed image ID, pinned
contract commit, external module SHA-256 values, and gate result. The image is
not pushed or deployed. A local Docker image ID is not a production registry
digest, and the generated evidence is not provenance of any existing service.

## Remaining approval and provenance gates

Before treating any build as a rollback floor, separately identify and verify
the intended service revision, immutable registry image digest and build source.
Run the contract against that exact image and retain the result with its CI/build
record. Verify the live migration ledger and test every pending migration with
the matching application/worker changes. Review mixed-revision behavior and keep
capture writers disabled until every possible deletion target is compatible.
Health and a Git marker alone do not satisfy these requirements.
