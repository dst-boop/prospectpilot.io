# Full synthetic upgrade and application rollback rehearsal

This is a repeatable **source-based** rehearsal, not a production backup, production-schema inspection, deployment approval, or proof that production runs the baseline revision. No production database, live auth, provider account, or secret is used.

## Pinned source revisions

- Baseline: `b543fa4e52ee40f2e78a793733b9fbc3f6d29d50`, whose actual migration runner ends at 029. This is a known source/release marker only; the deployed revision remains unverified.
- Upgrade: PR97 `6fb7209a425a6b92c8ca52f4fdf22d247c9e8a3f`, applying 030 personal-events, 031 autopilot, and 032 networking capture.
- Application rollback: PR100 candidate `402e079d7d31297bd56412d4c236bec18d98d130`. This is **not** the unmodified baseline application and does not perform a destructive schema downgrade.

Historical migration code, SQL and application modules are read directly from these Git objects into randomly named temporary directories under the checkout, then removed. This deliberately avoids constructing a hand-written approximation of schema 029 or copying real customer data. The root checkout supplies the same locked package dependencies.

## Run

Fetch full repository history (including the pinned candidate) first. Missing source objects fail the rehearsal instead of silently testing another revision.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm upgrade:rehearse  # PGlite only; PostgreSQL is visibly skipped
# Disposable PostgreSQL16, using compose.staging.yaml or the CI service:
STAGING_DATABASE_URL=postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test pnpm upgrade:postgres
```

The Git-history rehearsal is intentionally separate from the ordinary `test/*.test.mjs` image-build suite: production image contexts have neither Git nor historical objects. CI runs the explicit `pnpm upgrade:postgres` step before the ordinary suite and image build; it cannot silently substitute a skipped image test for this evidence.

The PostgreSQL command must connect to PostgreSQL major version 16. It fails without the explicit test connection. Only the fixed test credentials, loopback host and `prospectpilot_test` database are accepted; inherited PG overrides, URL parameters and production mode are rejected. The subprocess environment is allowlisted and does not inherit provider/auth/database credentials. A defense-in-depth network guard allows only the disposable database port. It is not an OS firewall.

Each run owns a random `pp_staging_*` schema and drops only that schema. CI provisions an ephemeral `postgres:16` service and injects only published synthetic credentials. No workflow secret, cloud deployment action, app server or paid provider is used.

## Coverage

1. Execute the exact baseline migration runner through 029. Seed synthetic legacy contacts for two owners, shared-list membership, imports, discovery leads, all six old observation fields, qualification, activity, discovery runs, task/job keys, costs, usage, hashed tombstones and both acquisition-ledger channels.
2. Snapshot **every baseline table**, including row contents/timestamps, and all schema indexes/constraints. Verify legacy unique keys reject collisions before and after upgrade.
3. Inject real SQL failures immediately after the history insert for each of 030, 031 and 032. The real migration transaction must restore all data, schema and ledger entries to 029 after every failure.
4. Upgrade successfully and rerun. Every baseline row and old index/constraint (except the intentionally widened observation check) stays identical; each migration is recorded once. A successful replay changes no data or schema.
5. Exercise accepted/rejected observation fields, autopilot live-run and budget/cursor/status checks (including a list-less live-run collision), capture owner-scoped request keys, foreign keys, NOT NULL, replay and changed-payload rejection. Contact deletion cascades captures but preserves acquisition and cost history.
6. Create actual networking records through the upgraded application for two owners. Confirm existing shared contact evidence is unchanged; private alias, meeting, referrer and note fields do not leak via workspace search or the shared-list contact route.
7. Run the actual pinned PR100 migration runner and application on the fully upgraded database. Confirm retained 030–032 schema/data/ledger, no networking writer, legacy import replay without duplicate contacts, private shared-list reads, transaction rollback after deletion, owner-only deletion, hashed captured-alias tombstones and rejected alias reimport. Other-owner records and ledger/cost history survive.
8. Roll the upgraded application forward again without changing retained data, and confirm deleted private aliases remain blocked.

## Limits

This covers synthetic schema/record compatibility, not actual production contents, data scale, concurrent deployment lock timing, live Firebase, external providers, browser behavior, or a full rolling mixed-version deployment. The rollback candidate retains new tables and data; it does not promise the removed networking/autopilot features are available. Production approval still needs the deployed revision/migration history to be verified and an actual backup/restore and release plan reviewed separately.

Local PGlite success and CI PostgreSQL16 success are separate evidence. Inspect the exact PR commit's CI result before treating the PostgreSQL portion as passed.

## Release enforcement

The [networking release gate](NETWORKING-RELEASE-GATE.md) refuses an unverified previous serving revision as rollback. This source rehearsal does not populate the immutable registry-image policy or satisfy live auth/database readiness. The policy remains empty until exact image provenance and compatibility evidence are independently reviewed.
