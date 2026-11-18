# Prepared private runtime deployment, not executed

Verified prerequisites reported by coordinator: #157 source be72525d6db06766fca7d19887c851666a38b081 built successfully; immutable image digest e65664c2d0bd88f6f470b02867e71305f3885c9740b7940c4a5607ace4c60359 passed actual synthetic/native contracts. Initializer execution prospectpilot-stg-initialize-6t97h succeeded; independent exact ledger001..034, UID/project/expiry marker, ownership and zero-data checks passed. Exact #159 ad3b5cdf86ccaaf2ea7b899c96fa57fed569b09f split grants exited0 including actual runtime LOGIN and exact ACL matrix. Those are reported execution evidence, not newly repeated by this document.

Nonsecret runtime-env.json keeps verified UID WVxUh1LmGvWKYnRxjBYM0VbwGZX2, origin https://prospectpilot-stg-app-889507481125.us-central1.run.app, fixed expiry2026-11-25T00:00:00.000Z. PGUSER is prospectpilot_stg_runtime. Initializer flag and PGPASSWORD are absent. No production configuration/provider secrets/identity keys are allowed.

## Read-only access review before any mutation
Fixed project prospectpilot-stg-261118, regionus-central1, runtime identity prospectpilot-stg-runtime@prospectpilot-stg-261118.iam.gserviceaccount.com. Verify this identity has staging Cloud SQL Client and only the custom Firebase verifier permissions firebaseauth.users.get and firebaseauth.users.createSession. No Firebase Admin, projectOwner/Editor, initializer/bootstrap SecretAccessor, impersonation/tokenCreator or production roles. Inspect custom-role includedPermissions; a role name alone is not evidence. Inspect inherited org/folder/project policy and conditional/group access as applicable.

```sh
set -eu
set +x
PROJECT=prospectpilot-stg-261118
REGION=us-central1
SERVICE=prospectpilot-stg-app
RUNTIME_SA=prospectpilot-stg-runtime@prospectpilot-stg-261118.iam.gserviceaccount.com
ORIGIN=https://prospectpilot-stg-app-889507481125.us-central1.run.app
DIGEST=sha256:e65664c2d0bd88f6f470b02867e71305f3885c9740b7940c4a5607ace4c60359
# Set IMAGE to the already verified complete staging Artifact Registry image URI.
# Preserve actual approved repository/image path; never substitute another digest.
: "${IMAGE:?Previously verified complete157 staging image URI required}"
case "$IMAGE" in us-central1-docker.pkg.dev/prospectpilot-stg-261118/*@"$DIGEST") ;; *) exit 1;; esac
gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT"
gcloud projects get-iam-policy "$PROJECT" --project "$PROJECT"
for SECRET in prospectpilot-stg-bootstrap-postgres-password prospectpilot-stg-initializer-password; do
 gcloud policy-intelligence troubleshoot-policy iam \
  "//secretmanager.googleapis.com/projects/889507481125/secrets/$SECRET/versions/1" \
  --principal-email "$RUNTIME_SA" --permission secretmanager.versions.access --project "$PROJECT"
done
```

STOP. Require definitive CANNOT_ACCESS/DENIED with no unresolved errors for both secrets; UNKNOWN/unavailable is not denial. Verify runtime SQL restrictions remain as #159 postchecks. If existing Cloud Run service name is present, inspect its revisions, traffic, IAM and config before changing anything. New fixed staging service only; do not replace unrelated service. Do not auto-enable APIs, impersonate identities, create users, or broaden IAM to make a check pass.

## Narrow authorized binding and private deployment, only after review
Grant SecretAccessor on runtime's OWN password secret only. No project-wide secret role, no initializer/bootstrap secret change, no service allUsers/allAuthenticatedUsers invoker. Caller actAs/runtime deployment ability must already be approved; do not add roles implicitly.

```sh
gcloud secrets add-iam-policy-binding prospectpilot-stg-runtime-password \
 --project "$PROJECT" --member "serviceAccount:$RUNTIME_SA" \
 --role roles/secretmanager.secretAccessor
gcloud secrets get-iam-policy prospectpilot-stg-runtime-password --project "$PROJECT"
gcloud policy-intelligence troubleshoot-policy iam \
 "//secretmanager.googleapis.com/projects/889507481125/secrets/prospectpilot-stg-runtime-password/versions/1" \
 --principal-email "$RUNTIME_SA" --permission secretmanager.versions.access --project "$PROJECT"
```

STOP. Require own-secret CAN_ACCESS/GRANTED without errors and forbidden-secret CANNOT_ACCESS/DENIED still intact. Then deploy:

```sh
gcloud run deploy "$SERVICE" --project "$PROJECT" --region "$REGION" \
 --image "$IMAGE" --service-account "$RUNTIME_SA" --command node \
 --args scripts/staging-start.mjs --env-vars-file staging-operator/runtime-env.json \
 --set-secrets PGPASSWORD=prospectpilot-stg-runtime-password:1 \
 --add-cloudsql-instances prospectpilot-stg-261118:us-central1:prospectpilot-stg-db \
 --min-instances 0 --max-instances 1 --concurrency 8 --memory 512Mi --cpu 1 \
 --timeout 60s --no-allow-unauthenticated
```

This remains IAM-private. It is not a public login link and not proof the user can reach it from an ordinary browser. No public invoker binding is authorized here. The explicit node scripts/staging-start.mjs override is mandatory: default image CMD is production server.mjs and must not run for staging.

## Independent postdeploy metadata checks
Read-only inspect exact ready revision and service IAM. Require desired fixed digest, runtime SA, command+args, Cloud SQL connection, limits/timeout, PGUSERruntime, exact marker-compatible origin/UID/expiry, no initializer flag, only runtime password secretref/version1, no provider keys/extra env vars. Inspect READY condition, actual service endpoints/annotations and private IAM. Do not print secret payloads or authentication tokens. The deterministic origin is deliberate; alternate hashed status.url may differ and must not replace strict Host origin.

```sh
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
 --format='yaml(status.conditions,status.latestReadyRevisionName,status.traffic,status.url,metadata.annotations,spec.template)'
gcloud run services get-iam-policy "$SERVICE" --project "$PROJECT" --region "$REGION"
```

--no-allow-unauthenticated is not alone proof an existing service has no broad invoker grants. Require no effective allUsers or allAuthenticatedUsers roles/run.invoker and no disabled invoker IAM check. If inherited broad access is found, stop and separately review correction; do not auto-remove unknown policies.

## Safe readiness/auth negatives without token output or fake auth
1. An unauthenticated HTTPS request to deterministic origin should be rejected by Cloud Run IAM (403/401). This proves only transport privacy, not Firebase application authorization.
2. Authenticated transport smoke can use only an already authorized user identity through supported tools, with any short-lived identity token confined to process memory and HTTPS Authorization header, never argv/stdout/files. Do not grant tokenCreator, impersonate a service identity or introduce proxy Host rewriting merely to perform it. If supported transport is unavailable, report this check blocked.
3. Once authorized transport actually reaches application, missing app session on /api/prospect/contacts should deny/redirect; a literal invalid __session cookie must be denied; wrong Origin on a mutation must403 before any DB write; disabled provider/share/job path must403. These are real-runtime negative checks, not successful Google-user verification. Use no valid credentials/tokens as test strings.
4. Real Google owner sign-in, session creation and logout need the approved browser access arrangement; IAM-private service cannot be called a completed browser flow. Do not make public or add fake auth to bypass this gate. No second user invitation/account is authorized.
5. A real nonowner/revoked-cookie/wrong-audience signed-token test cannot be claimed from malformed literals. Synthetic tests are the existing evidence; obtaining another valid subject or revoking owner sessions requires separate approved action. No extra auth mutation here.

App expiry denies access but does not stop resource charges. Keep existing cleanup/cost automation. Initialization job/identity cleanup is separate, never delete data or credentials implicitly.

## Recommended initializer credential-access retirement before exposure
After confirmed successful one-shot initialization, grants and required catalog checks, remove ONLY the previously added initializer service-account binding on its own secret. Retain secret versions, DB roles, job definition and execution evidence. Do not remove the operator user's authorized access, database permissions or unrelated bindings. This is a separate explicit operator action, not automatic cleanup inside deployment.

```sh
: "${INIT_SA:?Previously used approved initializer service identity required}"
case "$INIT_SA" in *@prospectpilot-stg-261118.iam.gserviceaccount.com) ;; *) exit 1;; esac
[ "$INIT_SA" != "$RUNTIME_SA" ]
gcloud secrets remove-iam-policy-binding prospectpilot-stg-initializer-password \
 --project "$PROJECT" --member "serviceAccount:$INIT_SA" \
 --role roles/secretmanager.secretAccessor
gcloud policy-intelligence troubleshoot-policy iam \
 "//secretmanager.googleapis.com/projects/889507481125/secrets/prospectpilot-stg-initializer-password/versions/1" \
 --principal-email "$INIT_SA" --permission secretmanager.versions.access --project "$PROJECT"
```

Require definitive CANNOT_ACCESS/DENIED after propagation. Do not claim retirement from a removal response alone if inherited access remains. No initializer schedule/automation is needed; do not execute the retained job again. Removing secret access prevents future retrieval, not retroactively revoking a password that an already-running process held; verify initialization execution is finished. No secret deletion or password rotation here.
