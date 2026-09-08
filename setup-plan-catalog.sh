#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${PROJECT:-lead-qualifier-505002}"
REGION="${REGION:-us-central1}"
umask 077
CATALOG_WORK_DIR="$(mktemp -d)"
trap 'rm -rf -- "$CATALOG_WORK_DIR"' EXIT
gcloud run jobs describe prospectpilot-migrate --project="$PROJECT" --region="$REGION" --format=json > "$CATALOG_WORK_DIR/template.json"
python3 - "$PROJECT" "$REGION" "$CATALOG_WORK_DIR" <<'PY'
import json,os,subprocess,sys
root=sys.argv[3]
with open(os.path.join(root,'template.json')) as f: job=json.load(f)
job['metadata']={'name':'prospectpilot-plan-catalog'}
job.pop('status',None)
template=job['spec']['template']
cloud_sql=template.get('metadata',{}).get('annotations',{}).get('run.googleapis.com/cloudsql-instances')
if not cloud_sql:
    raise SystemExit('Migration job has no Cloud SQL connection; catalog configuration was not changed.')
template['metadata']={'annotations':{'run.googleapis.com/cloudsql-instances':cloud_sql}}
template['spec']['taskCount']=1
template['spec']['parallelism']=1
task=template['spec']['template']['spec']
task['maxRetries']=0
task['timeoutSeconds']='3600'
container=task['containers'][0]
if os.environ.get('IMAGE'): container['image']=os.environ['IMAGE']
container['command']=['node']
container['args']=['scripts/refresh-plan-catalog.mjs']
container['resources']={'limits':{'cpu':'2','memory':'4Gi'}}
path=os.path.join(root,'catalog-job.json')
with open(path,'w') as f: json.dump(job,f)
subprocess.run(['gcloud','run','jobs','replace',path,'--project='+sys.argv[1],'--region='+sys.argv[2]],check=True)
PY
gcloud run jobs execute prospectpilot-plan-catalog --project="$PROJECT" --region="$REGION" --wait
