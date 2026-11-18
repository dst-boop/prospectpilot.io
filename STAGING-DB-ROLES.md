# Candidate restricted staging database role

NOT applied or native-verified. This is an explicit route-compatible candidate,
not a claim that every granted DML operation is the mathematical minimum.
Initializer owns the dedicated staging DB/schema/objects. Runtime must be a
separate LOGIN NOCREATEDB NOCREATEROLE NOINHERIT role with no memberships and no
object ownership. Create runtime through SQL, not Cloud SQL's default elevated
built-in user creation path. No passwords belong in source or reports.

The generator assumes a fresh role; it does not remove existing direct privileges,
memberships or ownership. Never reuse an existing privileged role.

After guarded empty staging initialization, execute stagingGrants(database,role)
as its owner, in that database only. Marker and migration ledger are SELECT-only.
No default privileges are granted for future tables. New migrations require review.
No sequence privileges are granted without demonstrated route need.

Disposable proof (never Cloud SQL): start a fresh postgres:16 container with
POSTGRES_PASSWORD=synthetic-ci-only, POSTGRES_DB=prospectpilot_test, binding host
127.0.0.1:55439 to container5432. Build application image from this candidate.
Run image with --network host, --read-only, --tmpfs /tmp, environment
STAGING_DATABASE_URL=postgres://postgres:synthetic-ci-only@127.0.0.1:55439/prospectpilot_test
and command node scripts/verify-staging-db-role.mjs --synthetic-image.
The script refuses other URLs or inherited PG environment variables. It creates
random staging-prefixed DB/roles, connects with actual initializer/runtime LOGIN,
runs permitted workflow and denied SQL assertions, then removes only its own
random test DB and roles. No fake authentication enters runtime entrypoints.
