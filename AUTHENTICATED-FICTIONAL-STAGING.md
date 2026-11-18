# Owner-only authenticated fictional staging scaffold

Local draft; NOT deployed and NOT proof of real Firebase/Cloud SQL compatibility.
Production `server.mjs`, `handler.mjs`, Firebase configuration, migrations and Docker
CMD are unchanged. This reuses the existing Contacts, Worklist, historical identity
and manual Audience implementations against an independently provisioned empty
staging database. It is not the unauthenticated loopback demo.

## Deliberately narrow pilot

Real Firebase Google authentication, a separate project, and one explicit approved
Firebase UID are mandatory. Verified email alone and `OWNER_EMAIL` never grant
access. The real Firebase SDK verifies token/cookie signatures and revocation;
the staging wrapper additionally checks UID, verified email, provider, audience,
issuer and expiration on login AND every authenticated request. No emulator or
fake identity adapter exists in the executable entrypoint. Tests inject stubs only.

Only the downloadable fictional CSV is accepted by the import/preview endpoints.
Download it after signing in, preview/import in Contacts, select a fictional contact,
and send it to Worklist. Review its next action there; evidence is incomplete by
default, never automatically verified. Editing and local review/activity recording
are available for these fictional records. Never enter real personal information.
The banner persists on all three application pages.

Provider/job/discovery execution, external research, legacy tools, Stripe,
LinkedIn, invitations, sharing, team assignment, arbitrary CSV imports and deletion
are not exposed. No provider adapters, job dispatch, timers or recipient resolution
are assembled. Unsupported buttons may remain in the shared UI and return an
explicit disabled-operation response. This is not full production parity. No API
call sends outreach. Browser navigation to documentation is separate from provider
execution. The Audience page retains `connect-src 'none'`.

## Deployment prerequisites (not performed by these scripts)

- Separate Google Cloud/Firebase project `prospectpilot-stg-*`, separate least-
  privilege runtime service account, with NO production roles or secret access.
- Separate PostgreSQL 16 instance, explicitly Enterprise, instance prefix
  `prospectpilot-stg-*`, region `us-central1`; instance sizing/performance remains
  unverified. Use the approved budget and monitor all services, including stopped
  SQL storage/IP costs. This document does not authorize additional spending.
- A dedicated empty database and database user named `prospectpilot_stg_*`.
  Runtime user should not have access to any other database. Initialization needs
  schema DDL access; remove unnecessary DDL privileges afterwards by an approved
  operator workflow. Do not clone, copy or connect production data.
- Firebase Google sign-in enabled in the staging project; authorize only the
  exact staging origin, never add a staging origin to production Firebase.
  Resolve the approved owner's staging Firebase UID before runtime startup.
- Exact Cloud Run service origin beginning `prospectpilot-stg-`, ending `.run.app`
  or `.us-central1.run.app`, HTTPS only. Verify actual configured host matches.
- No research-worker job or scheduler is required. A one-shot initialization job
  is an optional operator mechanism; do not deploy `research-worker.mjs`.

Required environment:

```
STAGING_PROJECT_ID=prospectpilot-stg-261118
GOOGLE_CLOUD_PROJECT=prospectpilot-stg-261118
STAGING_OWNER_UID=<approved owner UID in separate Firebase project>
STAGING_ORIGIN=https://<exact staging service hostname>
STAGING_CREATED_AT=<fixed ISO UTC timestamp>
STAGING_EXPIRES_AT=<fixed ISO UTC timestamp, recommended seven days later>
STAGING_FIREBASE_CONFIG={"projectId":"...","authDomain":"<stageproject>.firebaseapp.com","apiKey":"<public Firebase key>","appId":"<stage app ID>"}
PGHOST=/cloudsql/prospectpilot-stg-261118:us-central1:prospectpilot-stg-db
PGDATABASE=prospectpilot_stg_app
PGUSER=prospectpilot_stg_app
PGPASSWORD=<staging-only database secret>
```

Lifetime must be positive, not already expired, and at most 30 days after the
fixed creation timestamp. Expiry is checked on every request and stored in the
DB marker: changing only the environment cannot extend a running deployment.
**Expiry blocks app access; it does not stop or delete Cloud resources or their
charges.** Arrange an explicit resource-stop/cleanup plan within the approved budget.

Reject inherited PG overrides, ADC credential-file overrides, emulator host,
production-style defaults, all inherited `FORGET_TOMBSTONE_*` identity keys and
named provider/billing secrets. This fictional-only pilot uses existing legacy
identity-key mode in its empty isolated database, never production identity keys.
Real-data use would require a separately reviewed dedicated secret policy. Application Default
Credentials must resolve to the dedicated staging service identity.

One-shot initialization, only on the independently verified empty staging DB:
set `STAGING_INITIALIZE_EMPTY_DATABASE` to the exact staging database name and run
`node scripts/staging-initialize.mjs`. It refuses existing public tables. A failed
initialization is fail-closed; inspect it rather than automatically wiping/retrying.
It runs existing migrations and inserts a marker binding project, owner and expiry.
No contacts or fake authenticated users are seeded. This is never startup behavior.

Use the normal built image with an explicit alternate command:
`node scripts/staging-start.mjs`. It builds a separate in-memory login bundle from the validated staging Firebase
config, then starts the real-auth staging server. The unprivileged image user
needs no writable application directory and no generated files are overwritten. It does not read `generated/login.js` or `firebase-config.json`.
The runtime requires the exact marker and matching login manifest before listening.
The standard Docker CMD and production login bundle remain unchanged.

## Evidence and remaining gates

`node --test test/authenticated-staging.test.mjs` covers configuration refusal,
UID/project/revocation/expiry checks, default-deny routes and an actual existing-
application CSV preview/import -> Contacts -> Worklist path on disposable PGlite.
These are synthetic tests, not a successful real Google sign-in or Cloud SQL run.
Before exposing a link: independently review source, run full regression tests,
verify image contents and isolated runtime identity, demonstrate rejected nonowner
and expired access, sign in as the actual approved owner, test the fictional CSV
in-browser and confirm no provider/network/production activity. Invite no tester
until their identity and authorization have been separately settled.

### Explicit limitations and deployment gates
Only CSV import is technically restricted to the supplied fictional fixture. Editable contact fields, activity notes, advisor profile and list names still accept typed text. The fictional-only banner is an operator/user instruction, not a universal real-data detector. Do not type real personal data.

The runtime needs Firebase `firebaseauth.users.get` for revocation checks and `firebaseauth.users.createSession` for session exchange. Grant a narrowly scoped staging-only custom role, not Firebase Admin. Initialization requires DDL authority; do not describe the initializer credential as a least-privilege runtime role. Split and verify runtime SQL grants before browser exposure.

The added exact-image CI smoke uses disposable native PostgreSQL with a test-only injected auth adapter. It checks marker identity mismatches, runtime host guards, missing-config entrypoint refusal, assets, in-memory login compilation and fictional import/handoff. It does not prove Cloud SQL socket connectivity, deployed ADC/IAM, empty-database initializer execution or actual Google sign-in. Those remain explicit live staging gates. No production fake-auth switch is added.
