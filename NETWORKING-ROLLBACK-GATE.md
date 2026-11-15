# Migration 032: rollback privacy release gate

## Release status

Migration 032 is additive, but retaining its table does **not** make arbitrary
application rollbacks safe. A contact deletion cascades its captures. Older
`forget.mjs` code hashes only the contact/lead identities and loses identities
found only in a matching private capture. A later directory, networking, or
Research Lab import can recreate the person under those aliases.

The pinned deletion module at commit
`b543fa4e52ee40f2e78a793733b9fbc3f6d29d50` is a negative control for this gap.
It is not a supported rollback baseline. This document and the tests do not
establish which revision, commit, or immutable image is currently live.

**Block capture rollout until the actual rollback image has passed the
capture-aware deletion contract.** Do not treat a healthy revision, matching
schema, passing new-code tests, or an unverified Git SHA as that evidence.

## Non-production test commands

Use only a disposable local PostgreSQL instance, such as CI's PostgreSQL 16
service and `prospectpilot_test` database. No production URL is needed. The
harness accepts only an explicit `POSTGRES_TEST_URL` with a loopback host, a
database name containing `test`, and no URL options. It never falls back to
application connection settings. Every run creates a randomized private schema,
omits `public` from its search path, and removes only that schema in `finally`.
Fixture people, owners, context, and notes are synthetic. No provider API runs.
Loopback and database naming are guardrails, not proof of isolation: a local
tunnel or a database named `production_test` would pass that URL validation.
The operator must use a verified disposable server, never a production proxy.

```sh
# PGlite mirror always runs; PostgreSQL cases also run when explicitly set.
node --test test/networking-rollback.test.mjs

# Mandatory native PostgreSQL gate: missing configuration is an error, not skip.
POSTGRES_TEST_URL=postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test \
  node scripts/verify-networking-rollback.mjs

# Gate reviewed rollback deletion AND its identity-key callback from that image.
# Keep its relative imports/dependencies intact. Never execute unknown code.
POSTGRES_TEST_URL=postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test \
  node scripts/verify-networking-rollback.mjs \
    --forget-module /path/to/rollback/forget.mjs \
    --contact-keys-module /path/to/rollback/prospect-workspace.mjs
```

The last command must fail when given `test/fixtures/forget-b543fa4.mjs` and
`prospect-workspace.mjs` as its current-key negative-control callback. The ordinary
suite explicitly expects that negative-control vulnerability so it can detect a
fixture that accidentally stops reproducing the old gap. A passing negative
control is **not** approval of that rollback target.

The current-source gate runs as a separate non-skipping CI step. For a release,
also run it with the deletion module and dependencies from the exact proposed
rollback image, including that image's `identityLookupKeys` callback. The command
requires both external modules together and reports each source file's SHA-256.
Record the immutable image digest as well; these two hashes do not attest to all
transitive dependencies. Passing current source alone cannot approve a different image.
This focused 031-to-032 upgrade is not evidence for an unknown live migration
ledger. If the verified live ledger predates 031, separately test every pending
migration and the corresponding worker/application changes before rollout.

## Covered contract

1. Reconstruct migrations 001 through 031 with the real migration files and
   ledger; seed two owners' existing contacts before 032 exists.
2. Run the real migration runner; verify existing contact payloads, timestamps,
   and prior migration ledger entries are unchanged.
3. Save matching captures with private-only company and normalized LinkedIn
   aliases. Confirm public/shared contact data remains unchanged.
4. Rerun migration 032 and preserve captures unchanged.
5. Execute the selected deletion module transactionally, inject a failure after
   deletion, and verify contacts, cascaded captures, and tombstones all roll back.
6. Execute the deletion module again, commit, and confirm the private capture
   is gone, only hashed identities remain, import caches contain no private
   details, and another owner retains their contact/capture and has no tombstone.
7. Reimport without the original identifying email/company through directory,
   networking, and Research Lab paths. Require all three to stay blocked.
8. Reject old request-key replay and preserve another owner's independent use.

This is database/identity-contract evidence, not a complete historical app
deployment, multi-revision concurrency test, browser/login test, or proof of a
production migration. Existing networking/forget tests cover additional private
alias isolation and permissions; native concurrency tests remain separate.

## Safe release sequence to prepare, not execute here

- Establish a compatibility release that preserves current capture-aware
  deletion while capture writes remain unavailable. If that release precedes
  032, its optional capture read must tolerate the absent table without leaving
  the deletion transaction aborted; test it both before and after 032.
- Alternatively apply the additive table first while no capture writer can
  run, then deploy and verify a capture-aware compatibility release. Do not
  enable capture writes during the interval with an incompatible rollback.
- Verify the compatibility revision's health and immutable image provenance,
  then run this gate against its extracted deletion code/dependencies. Record
  the exact revision, image digest, tested source, CI run, and result.
- Make that verified compatibility image the rollback floor for the full
  networking release. Every rollback target must retain capture-aware deletion
  and the table. Never drop 032 to repair an application failure.
- Keep this release blocked if that evidence is missing or if an old rollback
  target could still receive deletion traffic after any capture has been saved.
  Disabling new capture writes after captures already exist does not fix this:
  existing deletion paths must still retain the compatible protection.

If an incompatible deletion already occurred, the cascade has removed the
private aliases. A later application upgrade cannot reconstruct those hashes
from the deleted rows. Do not claim that reapplying 032 repairs the gap.

No rollout, production migration, traffic change, or compatibility deployment
is performed by this test work.
