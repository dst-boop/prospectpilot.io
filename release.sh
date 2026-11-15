#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${PROJECT:-lead-qualifier-505002}"
REGION="${REGION:-us-central1}"
SERVICE=prospectpilot
JOB=prospectpilot-migrate
RESEARCH_JOB=prospectpilot-research
BUILDER="prospectpilot-builder@$PROJECT.iam.gserviceaccount.com"
RUNTIME="prospectpilot-runtime@$PROJECT.iam.gserviceaccount.com"
RELEASE_ID="review-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
CANDIDATE="$SERVICE-$RELEASE_ID"
IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT/prospectpilot/app:$RELEASE_ID"
PUBLIC_BASE="${PUBLIC_BASE:-https://prospectpilot.io}"
REFRESH_PLAN_CATALOG="${REFRESH_PLAN_CATALOG:-0}"
[[ "$REFRESH_PLAN_CATALOG" == 0 || "$REFRESH_PLAN_CATALOG" == 1 ]] || { echo 'REFRESH_PLAN_CATALOG must be 0 or 1.' >&2; exit 1; }
# Full gcloud snapshots can contain env values. Keep them private and ephemeral.
umask 077
WORK_DIR="$(mktemp -d)"
trap 'rm -rf -- "$WORK_DIR"' EXIT
field() { node scripts/release-config.mjs field "$WORK_DIR" "$1"; }

# Routine releases require existing resources and NEVER grant IAM, enable APIs,
# replace entire jobs, or change schedules. Bootstrap is separately reviewed.
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/service.json"
PREVIOUS_REVISION="$(node scripts/release-config.mjs serving "$WORK_DIR")"
gcloud run revisions describe "$PREVIOUS_REVISION" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/previous.json"
gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/migrate.json"
gcloud run jobs describe "$RESEARCH_JOB" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/research.json"
if [[ "$REFRESH_PLAN_CATALOG" == 1 ]]; then
  gcloud run jobs describe prospectpilot-plan-catalog --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/catalog.json"
fi
node scripts/release-config.mjs preflight "$WORK_DIR" "$PROJECT" "$REFRESH_PLAN_CATALOG"
CLOUD_SQL_INSTANCES="$(field cloudSqlInstances)"
printf 'Rollback revision: %s\nPrevious app image: %s\nPrevious migration image: %s\nPrevious research image: %s\n' \
  "$PREVIOUS_REVISION" "$(field previousImage)" "$(field migrate.image)" "$(field research.image)"
printf 'On failure, inspect the release before retrying. Traffic rollback: gcloud run services update-traffic %s --project=%s --region=%s --to-revisions=%s=100\n' "$SERVICE" "$PROJECT" "$REGION" "$PREVIOUS_REVISION"

# Only the image builder uses BUILDER. Docker tests gate image publication.
gcloud builds submit . --project="$PROJECT" --region="$REGION" --config=cloudbuild.yaml --substitutions="_IMAGE=$IMAGE_TAG" --service-account="projects/$PROJECT/serviceAccounts/$BUILDER"
IMAGE="$(gcloud artifacts docker images describe "$IMAGE_TAG" --project="$PROJECT" --format='value(image_summary.fully_qualified_digest)')"
[[ "$IMAGE" == "$REGION-docker.pkg.dev/$PROJECT/prospectpilot/app@sha256:"* && "${IMAGE##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || { echo 'Build did not resolve to the expected immutable image digest.' >&2; exit 1; }

# Migrations must be backward compatible with the still-serving app. Their
# reviewed job identity is preserved explicitly and may differ from the app.
gcloud run jobs update "$JOB" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$(field migrate.identity)" --set-cloudsql-instances="$CLOUD_SQL_INSTANCES" --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=180s
gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait
# Never inherit a failed revision's builder identity or h2c port. Node's HTTP
# server is HTTP/1. The candidate gets no ordinary traffic until checked below.
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" \
  --service-account="$RUNTIME" --no-use-http2 --port=8080 --set-cloudsql-instances="$CLOUD_SQL_INSTANCES" \
  --startup-probe='httpGet.path=/health,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=5,failureThreshold=24' \
  --liveness-probe='httpGet.path=/health,httpGet.port=8080,initialDelaySeconds=0,timeoutSeconds=5,periodSeconds=30,failureThreshold=3' \
  --deploy-health-check --no-traffic --revision-suffix="$RELEASE_ID" --update-env-vars="PROSPECTPILOT_RELEASE_ID=$RELEASE_ID"
gcloud run revisions describe "$CANDIDATE" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/candidate.json"
node scripts/release-config.mjs candidate "$WORK_DIR" "$IMAGE" "$RELEASE_ID"
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/current.json"
node scripts/release-config.mjs traffic "$WORK_DIR" "$CANDIDATE"

# Image-only worker updates retain its provider secrets, budgets, DB config and
# existing schedules. Do not call the provisioning scripts from routine release.
gcloud run jobs update "$RESEARCH_JOB" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$(field research.identity)"
if [[ "$REFRESH_PLAN_CATALOG" == 1 ]]; then
  printf 'Previous catalog image: %s\n' "$(field catalog.image)"
  gcloud run jobs update prospectpilot-plan-catalog --project="$PROJECT" --region="$REGION" --image="$IMAGE" --service-account="$(field catalog.identity)"
  gcloud run jobs execute prospectpilot-plan-catalog --project="$PROJECT" --region="$REGION" --wait
fi
# Recheck after potentially long job work. Promote this revision, never LATEST.
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/current.json"
node scripts/release-config.mjs traffic "$WORK_DIR" "$CANDIDATE"
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-revisions="$CANDIDATE=100"
node scripts/verify-release.mjs "$PUBLIC_BASE" "$RELEASE_ID" --health-required
printf '\nPublic release verified. Signed-in workflow checks are still required. Rollback revision: %s\n' "$PREVIOUS_REVISION"
