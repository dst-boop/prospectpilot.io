#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${PROJECT:-lead-qualifier-505002}"
REGION="${REGION:-us-central1}"
# Fail clearly instead of hiding an interactive API-enable prompt in a redirected lookup.
if ! gcloud services list --enabled --project="$PROJECT" --filter='name:cloudscheduler.googleapis.com' --format='value(name)' --quiet | grep -q cloudscheduler.googleapis.com; then
  printf 'Cloud Scheduler API must be enabled for project %s before configuring recovery.\n' "$PROJECT" >&2
  exit 1
fi
# Temporary job configuration can contain environment values; restrict and remove it.
umask 077
WORK_DIR="$(mktemp -d)"
trap 'rm -rf -- "$WORK_DIR"' EXIT
# Clone only database connectivity and service identity from the existing migration job.
gcloud run jobs describe prospectpilot-migrate --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/template.json"
if ! gcloud run jobs describe prospectpilot-research --project="$PROJECT" --region="$REGION" --format=json > "$WORK_DIR/existing-worker.json" 2>/dev/null; then
  rm -f "$WORK_DIR/existing-worker.json"
fi
python - "$PROJECT" "$REGION" "$WORK_DIR" <<'PY'
import json,subprocess,sys,os
p=json.load(open(os.path.join(sys.argv[3],'template.json')))
p['metadata']={'name':'prospectpilot-research'}
p.pop('status',None)
t=p['spec']['template']
annotations=t.get('metadata',{}).get('annotations',{})
cloud_sql=annotations.get('run.googleapis.com/cloudsql-instances')
t['metadata']={'annotations':{'run.googleapis.com/cloudsql-instances':cloud_sql}} if cloud_sql else {}
t['spec']['taskCount']=1
t['spec']['parallelism']=1
task=t['spec']['template']
task.get('metadata',{}).pop('name',None)
task['spec']['maxRetries']=1
task['spec']['timeoutSeconds']='900'
c=task['spec']['containers'][0]
existing_path=os.path.join(sys.argv[3],'existing-worker.json')
if os.path.isfile(existing_path):
 with open(existing_path) as stream: existing=json.load(stream)
 prior=existing['spec']['template']['spec']['template']['spec']['containers'][0].get('env',[])
 preserved=[entry for entry in prior if entry.get('name') in {'BRAVE_SEARCH_API_KEY','BRAVE_QUERY_COST_MICROS','GOOGLE_CLOUD_REGION','PDL_API_KEY','HUNTER_API_KEY','PDL_SEARCH_RECORD_COST_MICROS','PDL_ENRICH_COST_MICROS','HUNTER_VERIFY_COST_MICROS','PROSPECT_DAILY_BUDGET_MICROS'}]
 names={entry['name'] for entry in preserved}
 c['env']=[entry for entry in c.get('env',[]) if entry.get('name') not in names]+preserved
if os.environ.get('IMAGE'): c['image']=os.environ['IMAGE']
c['command']=['node']
c['args']=['research-worker.mjs']
output=os.path.join(sys.argv[3],'job.json')
with open(output,'w') as stream: json.dump(p,stream)
subprocess.run(['gcloud','run','jobs','replace',output,'--project='+sys.argv[1],'--region='+sys.argv[2]],check=True)
PY
# Grant only execution of this job to the app service identity.
APP_ID="$(gcloud run services describe prospectpilot --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
test -n "$APP_ID"
gcloud run jobs add-iam-policy-binding prospectpilot-research --project="$PROJECT" --region="$REGION" --member="serviceAccount:$APP_ID" --role=roles/run.invoker
# Recovery scheduler reuses the same least-privilege execution identity.
if gcloud scheduler jobs describe prospectpilot-research-recovery --location="$REGION" --project="$PROJECT" --quiet >/dev/null 2>&1; then
 ACTION=update
else
 ACTION=create
fi
gcloud scheduler jobs "$ACTION" http prospectpilot-research-recovery --location="$REGION" --project="$PROJECT" --schedule='*/5 * * * *' --uri="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/prospectpilot-research:run" --http-method=POST --oauth-service-account-email="$APP_ID" --message-body='{}'
