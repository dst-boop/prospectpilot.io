# Prepared next steps, not executed

Prerequisites: exact #158 recovery successful and independent catalog postcheck; exact #157 source be72525d6db06766fca7d19887c851666a38b081 compiled into a reviewed immutable staging image digest with successful tests. Source proof/overlay is not evidence that this new image is already built. UID WVxUh1LmGvWKYnRxjBYM0VbwGZX2 was verified separately. Expiry is Nov25 00:00 UTC. No public service deployment here.

## Before initialization
Use already approved dedicated INITIALIZER service identity, distinct from runtime. It needs only staging Cloud SQL Client and Secret Accessor on prospectpilot-stg-initializer-password, not bootstrap/runtime secrets. Runtime must NOT inherit project-wide Secret Accessor. Do not create IAM bindings or broaden roles implicitly when these prerequisites fail. The operator submitting the job needs only the existing approved ability to act as this initializer identity. Initialization performs schema DDL as prospectpilot_stg_init and owns its created objects, not database/public schema.

Review initialize-env.json: non-secret configuration only, exact verified UID/origin/expiry, PGUSER initializer; PGPASSWORD intentionally absent. Secret Manager supplies only the initializer password at execution. Do not print its value or use an environment file containing credentials.

Prepared commands below create/execute one private Cloud Run Job, not a publicly invokable service. Review exact IMAGE digest, service identity and job state before execution. New job name avoids mutating an unrelated existing job. If the named job already exists, inspect its state before changing or executing it; never repeat a successful/partial initialization.

```sh
set -eu
set +x
PROJECT=prospectpilot-stg-261118
REGION=us-central1
JOB=prospectpilot-stg-initialize
: "${IMAGE:?Reviewed immutable157 staging image digest required}"
: "${INIT_SA:?Approved initializer service identity required}"
case "$IMAGE" in us-central1-docker.pkg.dev/prospectpilot-stg-261118/prospectpilot-stg/app@sha256:*) ;; *) exit 1;; esac
case "$INIT_SA" in *@prospectpilot-stg-261118.iam.gserviceaccount.com) ;; *) exit 1;; esac
[ "$INIT_SA" != prospectpilot-stg-runtime@prospectpilot-stg-261118.iam.gserviceaccount.com ]
RUNTIME_SA=prospectpilot-stg-runtime@prospectpilot-stg-261118.iam.gserviceaccount.com
# Effective inherited-access checks are read-only. Require definitive DENIED, not
# UNKNOWN, for runtime access to bootstrap/initializer secrets before continuing.
for SECRET in prospectpilot-stg-bootstrap-postgres-password prospectpilot-stg-initializer-password; do
 gcloud policy-intelligence troubleshoot-policy iam \
  "//secretmanager.googleapis.com/projects/889507481125/secrets/$SECRET/versions/1" \
  --principal-email "$RUNTIME_SA" --permission secretmanager.versions.access --project "$PROJECT"
done
# If unavailable/indeterminate, inspect full resource/project/folder/org policies;
# an empty secret-only policy is NOT proof of no inherited access. Do not auto-enable
# services or broaden reviewer permissions to make troubleshooting work.
```

STOP HERE. Independently review effective IAM results for both secrets. If either result is UNKNOWN, unavailable or GRANTED, do not execute the next block. A secret-only policy is insufficient. Only after definitive DENIED results:

```sh
export STAGING_IAM_REVIEWED=runtime-denied-init-and-bootstrap
[ "$STAGING_IAM_REVIEWED" = runtime-denied-init-and-bootstrap ]
# Authorized narrow binding: initializer identity to initializer secret ONLY.
gcloud secrets add-iam-policy-binding prospectpilot-stg-initializer-password \
 --project "$PROJECT" --member "serviceAccount:$INIT_SA" \
 --role roles/secretmanager.secretAccessor
# Verify the resulting secret binding; no runtime/bootstrap secret accessor granted.
gcloud secrets get-iam-policy prospectpilot-stg-initializer-password --project "$PROJECT"
# Review secret REFERENCE/version metadata and initializer service identity grants first.
# From repository root, using reviewed initialize-env.json:
gcloud run jobs deploy "$JOB" --project "$PROJECT" --region "$REGION" \
 --image "$IMAGE" --service-account "$INIT_SA" --command node \
 --args scripts/staging-initialize.mjs \
 --env-vars-file staging-operator/initialize-env.json \
 --set-secrets PGPASSWORD=prospectpilot-stg-initializer-password:1 \
 --set-cloudsql-instances prospectpilot-stg-261118:us-central1:prospectpilot-stg-db \
 --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 600s --memory 512Mi --cpu 1
gcloud run jobs execute "$JOB" --project "$PROJECT" --region "$REGION" --wait
```

Stop on any failure. Initializer deliberately refuses any existing public tables. Do not rerun a partial initialization, drop schema or change marker to force it through. Confirm successful execution and independent SQL: migration034, exact marker UID/project/expiry, no contact/lead data, table/function ownership initializer, DB/schema ownership bootstrap, runtime no ownership or memberships.

## Split grants only after successful initialization
`apply-split-grants.py` verifies fixed instance/owner marker/migration/empty workspace, source hashes and existing secretv1 credentials. It runs stagingDatabaseGrants as bootstrap in one transaction, then stagingTableGrants as initializer in a separate transaction. It does NOT execute the combined generator under a single identity. It verifies runtime login, exact positive/negative table ACL matrix, no grant options, no DB CREATE/TEMP/schema CREATE, no object ownership/memberships. It grants no role memberships and writes no app rows. Partial failure can leave first ACL transaction applied; inspect before approved retry.

Prepared invocation (not executed):
```sh
export STAGING_INITIALIZATION_VERIFIED=be72525d6db06766fca7d19887c851666a38b081
export STAGING_SPLIT_OWNER_PROOF=pg16-split-owner-v1
export STAGING_CONFIRMED_PROXY_TARGET=prospectpilot-stg-261118:us-central1:prospectpilot-stg-db
python3 staging-operator/apply-split-grants.py
```

These values attest real completed checks, not a way to bypass them. Existing approved local proxy must actually target that instance on127.0.0.1:55438. No raw credentials in argv/files/output; psql passwords are held only in child environment/memory. Infrastructure logs and process access remain operator responsibilities. Public exposure/runtime deployment is separate and not performed by this procedure.

Official effective-IAM reference: https://docs.cloud.google.com/sdk/gcloud/reference/policy-intelligence/troubleshoot-policy/iam . Never treat missing/unknown results as denial.
