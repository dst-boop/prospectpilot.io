# Isolated synthetic staging smoke

This is a reproducible **test environment**, not a deployed staging site or a
production-readiness claim. It uses the existing application, migrations, HTTP
transport and authentication boundary. Only identity verification, provider
adapters and dispatch are fictional. Nothing is deployed, emailed or purchased.

## Quick local check

With Node 24 and the repository's installed dependencies:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm staging:smoke
# Equivalent when pnpm is not on PATH:
node scripts/staging-smoke.mjs
```

This starts an ephemeral loopback HTTP server, tests it and closes it. The default
uses a new in-memory **PGlite** database; the two real-PostgreSQL cases explicitly
report skipped. A successful default run is not PostgreSQL validation. The test
prints its backend and randomly generated schema. There is no interactive
Firebase login or persistent account.

The existing `pnpm demo` is still available for a persistent, fictional browser
walkthrough. It is separate: it bypasses authentication and is not evidence that
the production sign-in boundary works.

## Disposable local PostgreSQL 16

If Docker is already installed, create only this throwaway service. Do not use an
existing development, staging or production database, tunnel or Cloud SQL proxy.
The container's storage is tmpfs; no production credentials or data are needed.

```sh
docker compose -f compose.staging.yaml up -d --wait
STAGING_DATABASE_URL='postgres://postgres:synthetic-ci-only@127.0.0.1:55432/prospectpilot_test' pnpm staging:postgres
docker compose -f compose.staging.yaml down
```

PowerShell:

```powershell
docker compose -f compose.staging.yaml up -d --wait
try {
  $env:STAGING_DATABASE_URL = 'postgres://postgres:synthetic-ci-only@127.0.0.1:55432/prospectpilot_test'
  node scripts/staging-smoke.mjs --postgres
  if ($LASTEXITCODE -ne 0) { throw 'Synthetic PostgreSQL smoke failed.' }
} finally {
  Remove-Item Env:STAGING_DATABASE_URL -ErrorAction SilentlyContinue
  docker compose -f compose.staging.yaml down
}
```

`--postgres` fails if its explicit URL is missing, invalid or unreachable. It
cannot silently fall back to PGlite. Both real-PostgreSQL cases and the HTTP
journey must pass, with **zero skipped tests**. `POSTGRES_TEST_URL` is also accepted
for the existing CI service; two different supplied URLs are rejected.

Allowed connections have all of these properties:

- Loopback hostname only, database `prospectpilot_test`, user `postgres`, password
  `synthetic-ci-only`; no URL query options, host overrides or Unix sockets.
- Inherited nonempty `PG*` settings are rejected before connection, rather than
  allowing service files, SSL or search-path settings to redirect the test.
- `DATABASE_URL` is never used. The runner starts a new process with only OS path
  variables and the validated test URL. Provider keys, Firebase/Google credentials,
  billing keys, app origins and Node preload options are not inherited.
- Each fixture creates `pp_staging_<24 random hex digits>` and sets its own
  search path. It migrates and drops only that schema, never the database or
  `public`. Independent fixture schemas are tested for isolation and cleanup.

If a process is forcibly killed before cleanup, discard this disposable
container; never run wildcard schema cleanup against a shared database.

## CI

The existing `tests` workflow runs `pnpm staging:postgres` against its ephemeral
PostgreSQL 16 service **before** the complete Node/Python/image checks. No new
service account, secret, provider account, Firebase project or paid resource is
created. The full suite still includes the existing real-PostgreSQL row-lock and
firm-snapshot concurrency tests.

Keep the exact commit SHA, CI run URL and complete TAP summary with the result.
A zero process exit with skipped PostgreSQL tests does not count as a PostgreSQL
pass. Container build/runtime checks are a separate stage.

## What is exercised

- Actual HTTP transport and production `createHandler` with fake Firebase
  adapter: recent verified identity, same-origin session creation, secure cookie
  flags, signed-out redirect, invalid token, forged identity/host rejection and
  revoked-session denial.
- Signed-in `/`, `/lab`, `/prospect`, `/networking` and their JS/CSS assets.
  Actual pages are served and checked; this is not a rendered-browser UI test.
- Networking capture, safe retry, changed-payload conflict, forged-owner refusal,
  unverified contact state, private notes, cross-user read/export denial and no
  accidental lead qualification.
- Explicit contact-to-lead handoff, evidence review, advisor worklist and tenant
  isolation. One reviewed field never becomes a fully verified lead. All five
  fictional evidence gates then qualify the lead; verified-only export excludes
  it before qualification and includes it afterward, with observations retained.
- Actual persistent provider job/task state machine, idempotency, list membership,
  enrichment/verification simulation and CSV export. All quotes and reservations
  are zero. Providers are deterministic local functions, not HTTP mocks around
  real adapters. Reserved example-domain addresses are fictional fixtures.
- Actual 001-031 migration baseline with preserved contact, lead and acquisition
  ledger; 032 upgrade; failure after 032 DDL/history write rolls back atomically;
  successful retry; repeat migration preserves data.
- Independent migrated schemas and cleanup cannot affect another fixture.

The HTTP journey installs in-process guards for outbound fetch, socket connection
and DNS. Only its explicitly named loopback listener/database ports are allowed;
it asserts no outbound attempt occurred before testing the denial paths. This is
defense in depth, **not an OS-level firewall** or a security boundary for arbitrary
untrusted code. Production adapters, credential discovery, Stripe and Cloud Run
job dispatch are never instantiated.

## Remaining real-staging limits

This cannot validate Firebase SDK sign-in or account verification, Google OAuth
redirect/authorized-domain configuration, actual ID-token signatures/revocation,
Firebase session behavior in a browser, or provider/Stripe contracts. The HTTP
transport reconstructs HTTPS URLs as it does behind Cloud Run; the test manually
returns the secure session cookie over its loopback HTTP client. It does not prove
browser cookie delivery, HTTPS termination, Hosting rewrites or CSP behavior.

Real Cloud SQL/IAM, deployed migration timing, load/concurrency at production
scale, worker IAM/dispatch, secrets, network reachability, image rollout and
rollback require a separately authorized real staging environment. Supervisor
Team Lead Hub remains deliberately unavailable without authoritative adapters.
Do not turn fake authentication into a production environment variable or route.

On the initial Windows validation machine, PostgreSQL and Docker are not installed.
PGlite results are available locally; real PostgreSQL results must be obtained
from the exact commit's CI run before claiming those cases pass.
