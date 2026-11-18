# Prepared commands only: authenticated fictional staging

NOT executed. Do not copy blindly. This is blocked pending source review, actual
owner UID/config, separate SQL creation and credentials, approved IAM, and a
verified image build. Every cloud command below explicitly selects the staging
project. No commands create a Firebase user, invite anyone, change production,
create secrets or grant IAM. Existing approved staging resources are prerequisites.

## Image compatibility inspection

Current Dockerfile copies `scripts/` and all existing core app modules/assets.
`firebase`, `firebase-admin`, `pg`, and `esbuild` are production dependencies and
survive `pnpm prune --prod`. The separate login bundle is built in memory, so
`USER node` needs no writable `/app`. The stage entrypoint initializes exactly one
Firebase Admin app with the validated staging project. The default Docker CMD is
UNCHANGED: deployment MUST explicitly override it to staging-start.mjs.
No local Docker daemon is available here; this is source inspection, not a built
image smoke-test result. Run the normal full test-gated build in isolated staging.

## Fixed guards and build (operator shell)

```sh
set -eu
PROJECT=prospectpilot-stg-261118
REGION=us-central1
REPO=prospectpilot-stg
SERVICE=prospectpilot-stg-app
INIT_JOB=prospectpilot-stg-initialize
INSTANCE=prospectpilot-stg-db
SA=prospectpilot-stg-runtime@prospectpilot-stg-261118.iam.gserviceaccount.com
[ "$PROJECT" = prospectpilot-stg-261118 ]
[ "$REGION" = us-central1 ]
[ -z "$(git status --porcelain)" ] # do not submit an unreviewed dirty tree
REV=$(git rev-parse HEAD)
TAG="$REGION-docker.pkg.dev/$PROJECT/$REPO/app:$REV"
# Verify repository, service identity and SQL instance already exist and are isolated.
gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT"
gcloud iam service-accounts describe "$SA" --project "$PROJECT"
gcloud sql instances describe "$INSTANCE" --project "$PROJECT" \
  --format='yaml(name,connectionName,databaseVersion,settings.edition,settings.tier,settings.dataDiskSizeGb)'
# Only after reviewing those identities and spending authorization:
gcloud builds submit . --tag "$TAG" --project "$PROJECT"
# Read immutable digest; never deploy an unverified mutable tag.
gcloud artifacts docker images describe "$TAG" --project "$PROJECT" --format='value(image_summary.digest)'
```

Set `IMAGE` to that exact reviewed staging image URI plus `@sha256:<digest>`.
Verify it points to this project/repository, not a production image. Inspect the
build test results and record commit/digest. Cloud Build may require build-service
IAM; do NOT broaden roles automatically if it fails.

## Explicit one-shot initialization

Have the approved operator create two private environment files from
AUTHENTICATED-FICTIONAL-STAGING.md. No password in either file. `init-env.yaml`
also includes `STAGING_INITIALIZE_EMPTY_DATABASE: prospectpilot_stg_app`.
`runtime-env.yaml` omits that initialization acknowledgment. Set the exact real
owner UID, fixed seven-day lifetime, public staging Firebase config and exact
service hostname in both. PGPASSWORD comes only from a staging-only secret version.
The exact Cloud Run hostname must be confirmed before starting the app; if a
placeholder service is needed, keep it IAM-private and do not run production CMD.

After database/user/secret bootstrap has separately completed and been reviewed:

```sh
# IMAGE must already be a reviewed immutable stageproject digest.
case "$IMAGE" in us-central1-docker.pkg.dev/prospectpilot-stg-261118/prospectpilot-stg/app@sha256:*) ;; *) exit 1;; esac
gcloud run jobs deploy "$INIT_JOB" --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$SA" --command node \
  --args scripts/staging-initialize.mjs --env-vars-file init-env.yaml \
  --set-secrets PGPASSWORD=prospectpilot-stg-db-password:1 \
  --set-cloudsql-instances "$PROJECT:$REGION:$INSTANCE" \
  --tasks 1 --max-retries 0 --task-timeout 600s --memory 512Mi --cpu 1
gcloud run jobs execute "$INIT_JOB" --project "$PROJECT" --region "$REGION" --wait
```

This rejects any existing public tables and only initializes the explicit staging
DB. Do not rerun after partial failure without inspecting the independent stage
DB. No automatic drop/reset exists. Retain execution evidence; revoke unnecessary
DDL privileges via an approved procedure before runtime.

## Runtime preparation, not external access approval

```sh
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$SA" --command node \
  --args scripts/staging-start.mjs --env-vars-file runtime-env.yaml \
  --set-secrets PGPASSWORD=prospectpilot-stg-db-password:1 \
  --add-cloudsql-instances "$PROJECT:$REGION:$INSTANCE" \
  --min-instances 0 --max-instances 1 --concurrency 8 --memory 512Mi --cpu 1 \
  --timeout 60s --no-allow-unauthenticated
```

The explicit command override is mandatory. Confirm real Firebase login, auth
allowlist and route-denial tests before deciding how the browser reaches it.
This template deliberately does NOT grant allUsers invocation, IAP access,
additional IAM or tester access. IAM-private invocation alone will not let a normal
browser load the Firebase login page. That access-layer decision needs separate
review; do not mistake private transport tests for a completed browser test.
Application authorization remains owner UID only even if a reviewed access layer
later permits loading the sign-in page.

Monitor total project cost against the authorized $200 ceiling, and schedule
resource shutdown/cleanup separately. The app expiry does not stop SQL billing.

## IAM database alternative: design only, not implemented

Official Google docs support automatic IAM database auth via Cloud SQL Auth Proxy
with `--auto-iam-authn`, or manual short-lived access-token passwords. A Cloud SQL
socket connection's IAM authorization and PostgreSQL user authentication are two
different checks. Do not simply remove PGPASSWORD from this scaffold: it intentionally
refuses that configuration. An IAM DB path additionally requires the instance flag,
IAM database user, Cloud SQL Instance User/Client permissions, SQL grants and
refreshing credentials for new connections. The service account DB username is not
the current `prospectpilot_stg_*` username, so config tests need a reviewed change.

The Google-owned Node.js connector also explicitly supports automatic IAM
authentication with `AuthTypes.IAM` and `pg`; it is a possible reviewed alternative
to a proxy sidecar, not an implemented dependency here.

An automatic-auth proxy/connector is preferable to a static one-hour token; expired
tokens must not break pool reconnects. IAM DB auth can avoid an application password
but does not, by itself, solve the console's initial default-postgres bootstrap or
create required database/SQL grants. No IAM auth implementation or new dependency
has been added.

Sources:
- https://docs.cloud.google.com/sql/docs/postgres/iam-logins
- https://docs.cloud.google.com/sql/docs/postgres/connect-auth-proxy
- https://docs.cloud.google.com/sql/docs/postgres/create-edit-iam-instances
- https://docs.cloud.google.com/sql/docs/postgres/create-instance

- https://github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector/blob/main/README.md

## Required review corrections before executing runtime deployment
- Runtime Firebase permission minimum: staging-scoped `firebaseauth.users.get` and `firebaseauth.users.createSession`; SQL Client plus Secret Accessor alone is insufficient. Do not grant Firebase Admin.
- The initializer's SQL role must create schema objects. Split and verify a narrower runtime SQL role/grants before browser exposure; existing command placeholders are not evidence of least privilege.
- Keep IAM-private transport until the public-login access decision is separately approved. Real Google sign-in is not proved by synthetic CI.
- Only CSV import is fixed-fiction enforced. Manual edits and notes accept text; do not enter real personal data.
