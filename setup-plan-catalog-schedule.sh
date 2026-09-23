#!/usr/bin/env bash
set -euo pipefail
PROJECT="${PROJECT:-lead-qualifier-505002}"
REGION="${REGION:-us-central1}"
if ! gcloud services list --enabled --project="$PROJECT" --filter='name:cloudscheduler.googleapis.com' --format='value(name)' --quiet | grep -q cloudscheduler.googleapis.com; then
  printf 'Cloud Scheduler API must be enabled before configuring catalog refresh.\n' >&2
  exit 1
fi
gcloud run jobs describe prospectpilot-plan-catalog --project="$PROJECT" --region="$REGION" >/dev/null
CATALOG_INVOKER="$(gcloud run services describe prospectpilot --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
test -n "$CATALOG_INVOKER"
gcloud run jobs add-iam-policy-binding prospectpilot-plan-catalog --project="$PROJECT" --region="$REGION" --member="serviceAccount:$CATALOG_INVOKER" --role=roles/run.invoker
if gcloud scheduler jobs describe prospectpilot-plan-catalog-refresh --location="$REGION" --project="$PROJECT" --quiet >/dev/null 2>&1; then
  ACTION=update
else
  ACTION=create
fi
gcloud scheduler jobs "$ACTION" http prospectpilot-plan-catalog-refresh --location="$REGION" --project="$PROJECT" --schedule="${PLAN_CATALOG_SCHEDULE:-0 9 1 * *}" --time-zone=Etc/UTC --uri="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/prospectpilot-plan-catalog:run" --http-method=POST --oauth-service-account-email="$CATALOG_INVOKER" --message-body='{}'
