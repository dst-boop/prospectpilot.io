#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${PROJECT:-lead-qualifier-505002}"
REGION="${REGION:-us-central1}"
SERVICE=prospectpilot
JOB=prospectpilot-migrate
BUILDER="prospectpilot-builder@$PROJECT.iam.gserviceaccount.com"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/prospectpilot/app:review-$(date -u +%Y%m%d%H%M%S)-$RANDOM"
RELEASE_ID="${IMAGE##*:}"
# Routine releases reuse existing resources and permissions.
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" >/dev/null
gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" >/dev/null
PREVIOUS_IMAGE="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.containers[0].image)')"
printf 'Rollback image: %s\n' "$PREVIOUS_IMAGE"
# Docker's test stage must pass before an image is published.
gcloud builds submit . --project="$PROJECT" --region="$REGION" --config=cloudbuild.yaml --substitutions="_IMAGE=$IMAGE" --service-account="projects/$PROJECT/serviceAccounts/$BUILDER"
gcloud run jobs update "$JOB" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=180s
gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait
if [[ "${REFRESH_PLAN_CATALOG:-0}" == "1" ]]; then
  PROJECT="$PROJECT" REGION="$REGION" IMAGE="$IMAGE" bash setup-plan-catalog.sh
fi
PROJECT="$PROJECT" REGION="$REGION" IMAGE="$IMAGE" bash setup-research-worker.sh
# Updating only the image preserves the configured identity and access controls.
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$IMAGE" --update-env-vars="PROSPECTPILOT_RELEASE_ID=$RELEASE_ID"
curl --fail --silent --show-error --output /dev/null --max-time 30 "https://$PROJECT.web.app/login"
VERSION_JSON="$(curl --fail --silent --show-error --max-time 30 https://prospectpilot.io/version)"
python3 - "$RELEASE_ID" "$VERSION_JSON" <<'PY'
import json,sys
version=json.loads(sys.argv[2])
if version.get('feature_set')!='research-lab-v1' or version.get('release_id')!=sys.argv[1]:
    raise SystemExit('The custom domain is not serving the new Research Lab release. Deployment is not verified.')
print('Verified the new Research Lab release at https://prospectpilot.io')
PY
printf '\nRelease complete. Previous app image for rollback: %s\n' "$PREVIOUS_IMAGE"
