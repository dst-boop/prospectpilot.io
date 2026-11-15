import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {servingRevision, releasePreflight, verifyCandidate, verifyUnchangedTraffic} from '../scripts/release-config.mjs';

const project = 'test-project';
const identity = name => `${name}@${project}.iam.gserviceaccount.com`;
const runtime = identity('prospectpilot-runtime');
const cloudSqlInstances = `${project}:us-central1:database`;
const image = `us-central1-docker.pkg.dev/${project}/prospectpilot/app@sha256:${'a'.repeat(64)}`;
const releaseId = 'review-test';
const ready = {conditions: [{type: 'Ready', status: 'True'}]};
const container = () => ({image, ports: [{name: 'http1', containerPort: 8080}],
  startupProbe: {httpGet: {path: '/health', port: 8080}, failureThreshold: 24, timeoutSeconds: 5, periodSeconds: 5},
  livenessProbe: {httpGet: {path: '/health', port: 8080}, failureThreshold: 3, timeoutSeconds: 5, periodSeconds: 30},
  env: [{name: 'PROSPECTPILOT_RELEASE_ID', value: releaseId}]});
const revision = (name = 'prospectpilot-' + releaseId) => ({metadata: {name, annotations: {'run.googleapis.com/cloudsql-instances': cloudSqlInstances}},
  spec: {serviceAccountName: runtime, containers: [container()]}, status: structuredClone(ready)});
const service = () => ({metadata: {generation: '10'}, spec: {template: {spec: {serviceAccountName: identity('prospectpilot-builder')}}},
  status: {...structuredClone(ready), observedGeneration: 10, latestCreatedRevisionName: 'prospectpilot-failed',
    traffic: [{revisionName: 'prospectpilot-serving', percent: 100}]}});
const job = name => ({metadata: {name}, spec: {template: {spec: {template: {spec: {serviceAccountName: identity('job-runtime'), containers: [{image}]}}}}}});
const snapshot = () => ({project, service: service(), previous: revision('prospectpilot-serving'), migrate: job('prospectpilot-migrate'), research: job('prospectpilot-research')});
const expected = {runtime, image, releaseId, cloudSqlInstances};

test('preflight uses the serving revision rather than a failed latest template', () => {
  const data = snapshot();
  data.service.status.conditions[0].status = 'False';
  const state = releasePreflight(data);
  assert.equal(state.previousRevision, 'prospectpilot-serving');
  assert.equal(state.runtime, runtime);
  assert.equal(state.migrate.identity, identity('job-runtime'));
  assert.notEqual(state.builder, state.runtime);
  assert.equal(state.previousImage, image);
  assert.equal(state.cloudSqlInstances, cloudSqlInstances);
});

test('preflight refuses split, absent, pending, or unready rollback targets', () => {
  for (const mutate of [
    data => data.service.status.traffic = [],
    data => data.service.status.traffic = [{revisionName: 'a', percent: 90}, {revisionName: 'b', percent: 10}],
    data => data.service.status.observedGeneration = 9,
    data => data.service.status.conditions[0].status = 'Unknown',
    data => data.previous.status.conditions[0].status = 'False',
    data => data.previous.metadata.name = 'not-the-serving-revision',
    data => delete data.previous.metadata.annotations,
    data => data.previous.spec.containers.push(container()),
    data => delete data.migrate.spec.template.spec.template.spec.containers[0].image,
  ]) { const data = snapshot(); mutate(data); assert.throws(() => releasePreflight(data)); }
});

test('builder, default, missing, and cross-project job identities fail before a build', () => {
  for (const value of [identity('prospectpilot-builder'), '123@cloudbuild.gserviceaccount.com', '', null, 'runtime@other-project.iam.gserviceaccount.com']) {
    const data = snapshot(); data.migrate.spec.template.spec.template.spec.serviceAccountName = value;
    assert.throws(() => releasePreflight(data), /service account/);
  }
  const data = snapshot(); data.research.metadata.name = 'other-job';
  assert.throws(() => releasePreflight(data), /Missing expected job/);
});

test('optional catalog identity is validated and no secret env values enter release state', () => {
  const data = snapshot(); data.catalog = job('prospectpilot-plan-catalog');
  data.migrate.spec.template.spec.template.spec.containers[0].env = [{name: 'PRIVATE', value: 'synthetic-secret-do-not-log'}];
  const state = releasePreflight(data);
  assert.equal(state.catalog.identity, identity('job-runtime'));
  assert.doesNotMatch(JSON.stringify(state), /synthetic-secret|PRIVATE/);
  data.catalog.spec.template.spec.template.spec.serviceAccountName = identity('prospectpilot-builder');
  assert.throws(() => releasePreflight(data));
});

test('candidate guard requires the expected runtime identity, HTTP/1, probes, digest, and release marker', () => {
  assert.equal(verifyCandidate(revision(), expected), true);
  for (const mutate of [
    data => data.status.conditions[0].status = 'False',
    data => data.metadata.name = 'another-release',
    data => data.spec.serviceAccountName = identity('prospectpilot-builder'),
    data => data.spec.containers[0].ports[0].name = 'h2c',
    data => data.spec.containers[0].ports[0].containerPort = 9090,
    data => data.spec.containers[0].image = 'app:mutable',
    data => delete data.spec.containers[0].startupProbe,
    data => data.spec.containers[0].livenessProbe.httpGet.path = '/missing',
    data => data.spec.containers[0].env[0].value = 'stale-release',
    data => data.metadata.annotations['run.googleapis.com/cloudsql-instances'] = 'another-db',
  ]) { const data = revision(); mutate(data); assert.throws(() => verifyCandidate(data, expected)); }
});

test('concurrent traffic or latest revision changes prevent promotion', () => {
  const data = service(); data.status.latestCreatedRevisionName = 'candidate';
  assert.equal(verifyUnchangedTraffic(data, 'prospectpilot-serving', 'candidate'), true);
  data.status.latestCreatedRevisionName = 'someone-elses-release';
  assert.throws(() => verifyUnchangedTraffic(data, 'prospectpilot-serving', 'candidate'), /Another release/);
  data.status.latestCreatedRevisionName = 'candidate'; data.status.traffic[0].revisionName = 'other';
  assert.throws(() => verifyUnchangedTraffic(data, 'prospectpilot-serving', 'candidate'), /Another release/);
});

const root = fileURLToPath(new URL('../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
// Exercise the actual release shell with exported local stubs. No gcloud or
// network command can escape: every gcloud call is recorded and allowlisted.
function runRelease(scenario = 'ok', refresh = '0') {
  const directory = mkdtempSync(join(tmpdir(), 'prospectpilot-release-test-'));
  const mock = join(directory, 'mock.mjs');
  const fixture = {service: service(), previous: revision('prospectpilot-serving'), migrate: job('prospectpilot-migrate'),
    research: job('prospectpilot-research'), catalog: job('prospectpilot-plan-catalog'), candidate: revision(), image};
  writeFileSync(join(directory, 'fixture.json'), JSON.stringify(fixture));
  writeFileSync(mock, `
import {readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const dir=process.env.MOCK_DIR, args=process.argv.slice(2), scenario=process.env.SCENARIO;
const path=join(dir,'calls.jsonl'); appendFileSync(path,JSON.stringify(args)+'\\n');
const f=JSON.parse(readFileSync(join(dir,'fixture.json'),'utf8'));
const statePath=join(dir,'candidate.json');
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):null;
const out=value=>console.log(typeof value==='string'?value:JSON.stringify(value));
const is=(...prefix)=>prefix.every((value,i)=>args[i]===value);
if (is('verify')) { if(scenario==='public-fails')process.exit(1); }
else if(is('run','services','describe')) {
 if(state){
  state.serviceReads=(state.serviceReads||0)+1; writeFileSync(statePath,JSON.stringify(state));
  f.service.status.latestCreatedRevisionName=state.name;
  if(scenario==='concurrent'||(scenario==='concurrent-late'&&state.serviceReads>1))f.service.status.traffic[0].revisionName='another-release';
 }
 out(f.service);
} else if(is('run','revisions','describe')) {
 if(args[3]==='prospectpilot-serving')out(f.previous);
 else {
  f.candidate.metadata.name=state.name;
  f.candidate.spec.containers[0].env[0].value=state.id;
  if(scenario==='wrong-identity')f.candidate.spec.serviceAccountName='prospectpilot-builder@test-project.iam.gserviceaccount.com';
  if(scenario==='http2')f.candidate.spec.containers[0].ports[0].name='h2c';
  out(f.candidate);
 }
} else if(is('run','jobs','describe')) {
 const key={'prospectpilot-migrate':'migrate','prospectpilot-research':'research','prospectpilot-plan-catalog':'catalog'}[args[3]];
 if(scenario==='missing-worker'&&key==='research')process.exit(1);
 if(scenario==='builder-job'&&key==='migrate')f[key].spec.template.spec.template.spec.serviceAccountName='prospectpilot-builder@test-project.iam.gserviceaccount.com';
 out(f[key]);
} else if(is('builds','submit')) { if(scenario==='build-fails')process.exit(1); }
else if(is('artifacts','docker','images','describe'))out(scenario==='bad-digest'?'app:mutable':f.image);
else if(is('run','services','update')) {
 if(scenario==='startup-fails')process.exit(1);
 const id=args.find(x=>x.startsWith('--revision-suffix=')).split('=')[1];
 writeFileSync(statePath,JSON.stringify({id,name:'prospectpilot-'+id}));
} else if(is('run','jobs','execute')) {
 if((scenario==='migration-fails'&&args[3]==='prospectpilot-migrate')||(scenario==='catalog-execute-fails'&&args[3]==='prospectpilot-plan-catalog'))process.exit(1);
} else if(is('run','jobs','update')) {
 if((scenario==='worker-fails'&&args[3]==='prospectpilot-research')||(scenario==='catalog-update-fails'&&args[3]==='prospectpilot-plan-catalog'))process.exit(1);
} else if(is('run','services','update-traffic')) { if(scenario==='promotion-fails')process.exit(1); }
else { console.error('Unexpected mocked command'); process.exit(99); }
`);
  const script = `
function gcloud() { command node "$MOCK_FILE" "$@"; }
function node() {
  if [[ "$1" == scripts/verify-release.mjs ]]; then command node "$MOCK_FILE" verify "$@";
  else command node "$@"; fi
}
export -f gcloud node
bash release.sh
`;
  try {
    const result = spawnSync(bash, ['-c', script], {cwd: root, encoding: 'utf8', timeout: 60000,
      env: {...process.env, PROJECT: project, REGION: 'us-central1', REFRESH_PLAN_CATALOG: refresh,
        MOCK_DIR: directory, MOCK_FILE: mock.replaceAll('\\', '/'), SCENARIO: scenario}});
    if (result.error) throw result.error;
    const log = join(directory, 'calls.jsonl');
    return {...result, calls: existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []};
  } finally { rmSync(directory, {recursive: true, force: true}); }
}
const commandIs = (...prefix) => args => prefix.every((value, i) => args[i] === value);

test('release stages an immutable HTTP/1 runtime candidate and gates promotion, without IAM or provisioning', () => {
  const run = runRelease(); assert.equal(run.status, 0, run.stderr);
  const build = run.calls.find(commandIs('builds', 'submit'));
  assert.ok(build.includes('--service-account=projects/test-project/serviceAccounts/prospectpilot-builder@test-project.iam.gserviceaccount.com'));
  const stageIndex = run.calls.findIndex(commandIs('run', 'services', 'update'));
  const stage = run.calls[stageIndex];
  for (const flag of ['--no-traffic', '--no-use-http2', '--deploy-health-check', '--port=8080', '--service-account=' + runtime, '--image=' + image]) assert.ok(stage.includes(flag), flag);
  const promoteIndex = run.calls.findIndex(commandIs('run', 'services', 'update-traffic'));
  assert.ok(promoteIndex > stageIndex);
  assert.ok(run.calls.slice(stageIndex, promoteIndex).some(commandIs('run', 'revisions', 'describe')));
  const id = stage.find(x => x.startsWith('--revision-suffix=')).split('=')[1];
  assert.ok(run.calls[promoteIndex].includes('--to-revisions=prospectpilot-' + id + '=100'));
  assert.ok(run.calls.at(-1).includes('--health-required'));
  assert.ok(run.calls.at(-1).includes(id));
  assert.doesNotMatch(JSON.stringify(run.calls), /add-iam|set-iam|scheduler|replace|services","enable|--to-latest|--allow-unauthenticated/);
  for (const call of run.calls.filter(commandIs('run', 'jobs', 'update'))) assert.ok(call.includes('--service-account=' + identity('job-runtime')));
  const worker = run.calls.find(commandIs('run', 'jobs', 'update', 'prospectpilot-research'));
  assert.deepEqual(worker.slice(4).map(arg => arg.split('=')[0]).sort(), ['--image', '--project', '--region', '--service-account'],
    'worker release must not replace env/secrets/budgets/commands or other existing settings');
  assert.match(run.stdout, /Rollback revision: prospectpilot-serving/);
});

test('all build, migration, startup, configuration and concurrent-release failures stop before promotion', () => {
  for (const scenario of ['missing-worker', 'builder-job', 'build-fails', 'bad-digest', 'migration-fails', 'startup-fails', 'wrong-identity', 'http2', 'concurrent', 'concurrent-late', 'worker-fails']) {
    const run = runRelease(scenario);
    assert.notEqual(run.status, 0, scenario);
    assert.equal(run.calls.some(commandIs('run', 'services', 'update-traffic')), false, scenario);
    if (['missing-worker', 'builder-job'].includes(scenario)) assert.equal(run.calls.some(commandIs('builds', 'submit')), false, scenario);
    if (['startup-fails', 'wrong-identity', 'http2', 'concurrent'].includes(scenario)) assert.equal(run.calls.some(commandIs('run', 'jobs', 'update', 'prospectpilot-research')), false, scenario);
  }
});

test('public verification failure is not reported as a completed release', () => {
  const run = runRelease('public-fails'); assert.notEqual(run.status, 0);
  assert.equal(run.calls.some(commandIs('run', 'services', 'update-traffic')), true);
  assert.doesNotMatch(run.stdout, /Public release verified/);
  assert.match(run.stdout, /Traffic rollback:/);
});

test('optional catalog refresh reuses an existing job and identity without changing schedules', () => {
  const run = runRelease('ok', '1'); assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.some(commandIs('run', 'jobs', 'describe', 'prospectpilot-plan-catalog')));
  assert.ok(run.calls.some(commandIs('run', 'jobs', 'execute', 'prospectpilot-plan-catalog')));
  assert.doesNotMatch(JSON.stringify(run.calls), /scheduler|iam-policy|replace/);
});

test('cloud and Docker build contexts keep the release regression input files', () => {
  for (const filename of ['.gcloudignore', '.dockerignore']) {
    const text = readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
    assert.match(text, /^!release\.sh$/m);
    assert.match(text, /^!\.gcloudignore$/m);
  }
});


test('catalog and traffic update failures cannot claim a successful public release', () => {
  for (const scenario of ['catalog-update-fails', 'catalog-execute-fails', 'promotion-fails']) {
    const run = runRelease(scenario, '1');
    assert.notEqual(run.status, 0, scenario);
    assert.equal(run.calls.some(commandIs('verify')), false, scenario);
    assert.equal(run.calls.some(commandIs('run', 'services', 'update-traffic')), scenario === 'promotion-fails', scenario);
    assert.doesNotMatch(run.stdout, /Public release verified/);
  }
});
