import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {servingRevision, releasePreflight, verifyCandidate, verifyUnchangedTraffic, verifyRuntimeMatches, candidateOrigin, rollbackContractCommit, ownershipContractCommit} from '../scripts/release-config.mjs';

const project = 'test-project';
const identity = name => `${name}@${project}.iam.gserviceaccount.com`;
const runtime = identity('prospectpilot-runtime');
const cloudSqlInstances = `${project}:us-central1:database`;
const image = `us-central1-docker.pkg.dev/${project}/prospectpilot/app@sha256:${'a'.repeat(64)}`;
const releaseId = 'review-test';
const serviceUrl = 'https://prospectpilot-fixture.a.run.app';
const readinessOrigin = candidateOrigin(serviceUrl, releaseId);
const rollbackPolicy = () => ({schemaVersion: 2, contractCommit: rollbackContractCommit, ownershipContractCommit, floors: [{
  project, region: 'us-central1', service: 'prospectpilot', revision: 'prospectpilot-serving', image,
  // Hypothetical fixture only; no real source/image is approved by this test.
  sourceCommit: ownershipContractCommit,
  imageTestEvidence: 'https://github.com/dst-boop/prospectpilot.io/actions/runs/1',
  ownershipTestEvidence: 'https://github.com/dst-boop/prospectpilot.io/actions/runs/2',
  buildProvenance: 'https://console.cloud.google.com/cloud-build/builds/fixture?project=test-project',
}]});
const ready = {conditions: [{type: 'Ready', status: 'True'}]};
const container = () => ({image, ports: [{name: 'http1', containerPort: 8080}],
  startupProbe: {httpGet: {path: '/health', port: 8080}, failureThreshold: 24, timeoutSeconds: 5, periodSeconds: 5},
  livenessProbe: {httpGet: {path: '/health', port: 8080}, failureThreshold: 3, timeoutSeconds: 5, periodSeconds: 30},
  env: [{name: 'PROSPECTPILOT_RELEASE_ID', value: releaseId},
    {name: 'PROSPECTPILOT_RELEASE_CHECK_ORIGIN', value: readinessOrigin},
    {name: 'PGHOST', value: '/cloudsql/synthetic-db'}, {name: 'PGDATABASE', value: 'synthetic-db'},
    {name: 'PGPASSWORD', valueFrom: {secretKeyRef: {name: 'synthetic-db-password', key: '1'}}},
    {name: 'APP_ORIGINS', value: 'https://example.invalid'}]});
const revision = (name = 'prospectpilot-' + releaseId) => ({metadata: {name, annotations: {'run.googleapis.com/cloudsql-instances': cloudSqlInstances}},
  spec: {serviceAccountName: runtime, containers: [container()]}, status: structuredClone(ready)});
const service = () => ({metadata: {generation: '10'}, spec: {template: {...revision(), spec: {...revision().spec, serviceAccountName: identity('prospectpilot-builder')}}},
  status: {...structuredClone(ready), observedGeneration: 10, url: serviceUrl, latestCreatedRevisionName: 'prospectpilot-failed',
    traffic: [{revisionName: 'prospectpilot-serving', percent: 100}]}});
const job = name => ({metadata: {name}, spec: {template: {spec: {template: {spec: {serviceAccountName: identity('job-runtime'), containers: [{image}]}}}}}});
const snapshot = () => ({project, region: 'us-central1', rollbackPolicy: rollbackPolicy(), service: service(), previous: revision('prospectpilot-serving'), migrate: job('prospectpilot-migrate'), research: job('prospectpilot-research')});
const expected = {runtime, image, releaseId, cloudSqlInstances, readinessOrigin, previous: revision('prospectpilot-serving')};

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
  const data = service(); data.status.latestCreatedRevisionName = 'prospectpilot-review-test'; data.status.traffic.push({tag: releaseId, revisionName: 'prospectpilot-review-test', url: readinessOrigin});
  assert.equal(verifyUnchangedTraffic(data, 'prospectpilot-serving', 'prospectpilot-review-test', readinessOrigin), true);
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
  // Copy the release into an isolated checkout so only synthetic tests supply
  // a reviewed policy fixture; production has no policy-path/env override.
  const checkout = join(directory, 'checkout');
  mkdirSync(join(checkout, 'scripts'), {recursive: true});
  for (const file of ['release.sh', 'scripts/release-config.mjs']) copyFileSync(join(root, file), join(checkout, file));
  const policy = rollbackPolicy();
  if (scenario === 'no-floor') policy.floors = [];
  if (scenario === 'no-ownership-evidence') delete policy.floors[0].ownershipTestEvidence;
  writeFileSync(join(checkout, 'scripts/release-rollback-policy.json'), JSON.stringify(policy));
  const fixture = {service: service(), previous: revision('prospectpilot-serving'), migrate: job('prospectpilot-migrate'),
    research: job('prospectpilot-research'), catalog: job('prospectpilot-plan-catalog'), candidate: revision(), image};
  if (scenario === 'template-drift') fixture.service.spec.template.spec.containers[0].env.find(e => e.name === 'PGDATABASE').value = 'WRONG-PRIVATE-DATABASE';
  if (scenario === 'unapproved-tag') fixture.service.status.traffic.push({tag: 'unsafe-old', revisionName: 'prospectpilot-unsafe', percent: 0});
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
if (is('readiness')) {
 if(args.includes('--preflight')) { if(scenario==='session-missing')process.exit(1); }
 else {
  const readyFile=join(dir,'readiness-count.txt');
  const count=existsSync(readyFile)?Number(readFileSync(readyFile,'utf8'))+1:1; writeFileSync(readyFile,String(count));
  if(scenario==='readiness-fails'||(scenario==='readiness-late-fails'&&count>1))process.exit(1);
 }
}
else if (is('verify')) { if(scenario==='public-fails')process.exit(1); }
else if(is('run','services','describe')) {
 if(state){
  state.serviceReads=(state.serviceReads||0)+1; writeFileSync(statePath,JSON.stringify(state));
  f.service.status.latestCreatedRevisionName=state.name;
  f.service.status.traffic.push({tag:state.id,revisionName:state.name,url:state.origin});
  if(scenario==='concurrent'||(scenario==='concurrent-late'&&state.serviceReads>1)||(scenario==='concurrent-final'&&state.serviceReads>2))f.service.status.traffic[0].revisionName='another-release';
 }
 out(f.service);
} else if(is('run','revisions','describe')) {
 if(args[3]==='prospectpilot-serving')out(f.previous);
 else {
  f.candidate.metadata.name=state.name;
  f.candidate.spec.containers[0].env[0].value=state.id;
  f.candidate.spec.containers[0].env.find(e=>e.name==='PROSPECTPILOT_RELEASE_CHECK_ORIGIN').value=state.origin;
  if(scenario==='candidate-drift')f.candidate.spec.containers[0].env.find(e=>e.name==='PGDATABASE').value='WRONG-PRIVATE-DATABASE';
  if(scenario==='secret-drift')f.candidate.spec.containers[0].env.find(e=>e.name==='PGPASSWORD').valueFrom.secretKeyRef.key='wrong-secret-version';
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
 const vars=args.find(x=>x.startsWith('--update-env-vars=')).slice('--update-env-vars='.length).split(',');
 const origin=vars.find(x=>x.startsWith('PROSPECTPILOT_RELEASE_CHECK_ORIGIN=')).slice('PROSPECTPILOT_RELEASE_CHECK_ORIGIN='.length);
 writeFileSync(statePath,JSON.stringify({id,name:'prospectpilot-'+id,origin}));
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
  elif [[ "$1" == scripts/verify-candidate-readiness.mjs ]]; then command node "$MOCK_FILE" readiness "$@";
  else command node "$@"; fi
}
export -f gcloud node
bash release.sh
`;
  try {
    const result = spawnSync(bash, ['-c', script], {cwd: checkout, encoding: 'utf8', timeout: 60000,
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
  assert.match(run.stdout, /Verified networking rollback revision: prospectpilot-serving/);
  const checks = run.calls.map((args,i) => ({args,i})).filter(({args}) => args[0] === 'readiness' && !args.includes('--preflight'));
  assert.equal(checks.length, 2);
  assert.ok(checks.every(({i}) => i > stageIndex && i < promoteIndex));
});

test('all build, migration, startup, configuration and concurrent-release failures stop before promotion', () => {
  for (const scenario of ['missing-worker', 'builder-job', 'build-fails', 'bad-digest', 'migration-fails', 'startup-fails', 'wrong-identity', 'http2', 'concurrent', 'concurrent-late', 'concurrent-final', 'worker-fails', 'no-floor', 'no-ownership-evidence', 'template-drift', 'candidate-drift', 'secret-drift', 'unapproved-tag', 'session-missing', 'readiness-fails', 'readiness-late-fails']) {
    const run = runRelease(scenario);
    assert.notEqual(run.status, 0, scenario);
    assert.doesNotMatch(run.stdout + run.stderr, /WRONG-PRIVATE|wrong-secret-version|synthetic-db-password/);
    assert.equal(run.calls.some(commandIs('run', 'services', 'update-traffic')), false, scenario);
    if (['missing-worker', 'builder-job', 'no-floor', 'no-ownership-evidence', 'template-drift', 'unapproved-tag', 'session-missing'].includes(scenario)) assert.equal(run.calls.some(commandIs('builds', 'submit')), false, scenario);
    if (['startup-fails', 'wrong-identity', 'http2', 'concurrent', 'candidate-drift', 'secret-drift', 'readiness-fails'].includes(scenario)) assert.equal(run.calls.some(commandIs('run', 'jobs', 'update', 'prospectpilot-research')), false, scenario);
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

test('networking requires a reviewed exact serving-revision and registry-image rollback floor', () => {
  for (const mutate of [
    data => data.rollbackPolicy.floors = [],
    data => data.rollbackPolicy.floors[0].revision = 'prospectpilot-not-serving',
    data => data.rollbackPolicy.floors[0].image = 'sha256:' + 'a'.repeat(64),
    data => data.rollbackPolicy.floors[0].sourceCommit = 'b543fa4',
    data => data.rollbackPolicy.contractCommit = '0'.repeat(40),
    data => data.rollbackPolicy.schemaVersion = 1,
    data => delete data.rollbackPolicy.ownershipContractCommit,
    data => data.rollbackPolicy.ownershipContractCommit = '402e079d7d31297bd56412d4c236bec18d98d130',
    data => delete data.rollbackPolicy.floors[0].ownershipTestEvidence,
    data => data.rollbackPolicy.floors[0].ownershipTestEvidence = 'https://example.invalid/not-image-evidence',
    data => delete data.rollbackPolicy.floors[0].imageTestEvidence,
    data => delete data.rollbackPolicy.floors[0].buildProvenance,
    data => data.service.status.traffic.push({tag: 'unsafe', revisionName: 'prospectpilot-older', percent: 0}),
    data => data.previous.spec.serviceAccountName = identity('prospectpilot-builder'),
    data => data.previous.status.imageDigest = image.replace('a'.repeat(64), 'b'.repeat(64)),
  ]) { const data = snapshot(); mutate(data); assert.throws(() => releasePreflight(data)); }
  const policy = JSON.parse(readFileSync(new URL('../scripts/release-rollback-policy.json', import.meta.url), 'utf8'));
  assert.equal(policy.schemaVersion, 2);
  assert.equal(policy.contractCommit, rollbackContractCommit);
  assert.equal(policy.ownershipContractCommit, ownershipContractCommit);
  assert.deepEqual(policy.floors, [], 'No live or synthetic rollback image is approved in the repository.');
  assert.throws(() => releasePreflight({...snapshot(), rollbackPolicy: policy}), /Networking release blocked/,
    'The checked-in policy must never approve a synthetic test floor. Real reviewed floors can be added without weakening the validator.');
});

test('critical runtime values, secret references and alias maps are compared without disclosure', () => {
  for (const mutate of [
    r => r.spec.containers[0].env.find(e => e.name === 'PGHOST').value = 'SENSITIVE-WRONG-HOST',
    r => r.spec.containers[0].env.find(e => e.name === 'PGDATABASE').value = 'SENSITIVE-WRONG-DB',
    r => r.spec.containers[0].env.find(e => e.name === 'PGPASSWORD').valueFrom.secretKeyRef.key = 'SECRET-WRONG-VERSION',
    r => r.spec.containers[0].env.push({name: 'NEW_SECRET', value: 'SENSITIVE-PLAINTEXT'}),
    r => r.metadata.annotations['run.googleapis.com/secrets'] = 'alias:projects/private/secrets/changed',
    r => r.spec.volumes = [{name: 'secret', secret: {secretName: 'private-secret'}}],
    r => r.spec.containers[0].command = ['another-server'],
    r => r.spec.containers[0].env.push({...r.spec.containers[0].env[0]}),
  ]) {
    const changed = revision(); mutate(changed);
    assert.throws(() => verifyRuntimeMatches(changed, expected.previous), error => {
      assert.doesNotMatch(error.message, /SENSITIVE|SECRET-WRONG|PLAINTEXT|private-secret|another-server/);
      return true;
    });
    assert.throws(() => verifyCandidate(changed, expected));
  }
  const reordered = revision(); reordered.spec.containers[0].env.reverse();
  assert.equal(verifyRuntimeMatches(reordered, expected.previous), true);
});

test('candidate URLs and tags cannot redirect the signed-in readiness check', () => {
  assert.equal(candidateOrigin(serviceUrl, releaseId), readinessOrigin);
  for (const url of ['http://prospectpilot.run.app', 'https://run.app.attacker.invalid', 'https://user:password@service.run.app', serviceUrl + '/path', serviceUrl + '?query=1'])
    assert.throws(() => candidateOrigin(url, releaseId));
  const current = service(); current.status.latestCreatedRevisionName = 'prospectpilot-' + releaseId;
  current.status.traffic.push({tag: releaseId, revisionName: 'prospectpilot-' + releaseId, url: 'https://wrong.run.app'});
  assert.throws(() => verifyUnchangedTraffic(current, 'prospectpilot-serving', 'prospectpilot-' + releaseId, readinessOrigin), /tag/);
});
