import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const fail = message => { throw Error(message); };
const ready = resource => resource?.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True');
const sql = resource => resource?.metadata?.annotations?.['run.googleapis.com/cloudsql-instances'] || '';
const containers = spec => {
  if (!Array.isArray(spec?.containers) || spec.containers.length !== 1) fail('Expected exactly one container; review this release manually.');
  return spec.containers[0];
};
const account = (identity, project, builder) => {
  if (typeof identity !== 'string' || !identity.endsWith(`@${project}.iam.gserviceaccount.com`) ||
      !/^[a-z][a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(identity) || identity === builder)
    fail('A dedicated, non-builder runtime service account is required. Review identity configuration before releasing.');
  return identity;
};

export function servingRevision(service) {
  // A failed newest revision can make service Ready=False while the previous
  // revision still serves 100%. Allow repair of that drift, but not a rollout
  // still in progress; preflight separately proves the serving revision Ready.
  if (!service?.status || service.status.conditions?.some(c => c.type === 'Ready' && c.status === 'Unknown'))
    fail('The service configuration is still reconciling; wait before releasing.');
  if (Number(service.status.observedGeneration) !== Number(service.metadata.generation))
    fail('The service configuration is still reconciling; wait before releasing.');
  // The latest template can be a failed, unserved revision. Roll back to the
  // actual serving revision, never to the latest template/image by assumption.
  const traffic = (service.status.traffic || []).filter(t => Number(t.percent) > 0);
  if (traffic.length !== 1 || Number(traffic[0].percent) !== 100 || !traffic[0].revisionName)
    fail('Expected one serving revision at 100%; preserve split traffic with a reviewed release instead.');
  return traffic[0].revisionName;
}

export function releasePreflight({service, previous, migrate, research, catalog = null, project}) {
  const previousRevision = servingRevision(service);
  if (!ready(previous) || previous.metadata?.name !== previousRevision) fail('Serving revision snapshot does not match the live service.');
  const builder = `prospectpilot-builder@${project}.iam.gserviceaccount.com`;
  const runtime = `prospectpilot-runtime@${project}.iam.gserviceaccount.com`;
  const cloudSqlInstances = sql(previous);
  if (!cloudSqlInstances) fail('The serving revision has no Cloud SQL connection.');
  const previousImage = containers(previous.spec).image;
  if (!previousImage) fail('The serving revision has no rollback image.');
  const job = (value, name) => {
    if (value?.metadata?.name !== name) fail(`Missing expected job ${name}; run separately reviewed setup first.`);
    const spec = value?.spec?.template?.spec?.template?.spec;
    const image = containers(spec).image;
    if (typeof image !== 'string' || !image) fail(`Missing rollback image for ${name}.`);
    return {identity: account(spec?.serviceAccountName, project, builder), image};
  };
  return {previousRevision, previousImage, cloudSqlInstances, builder, runtime,
    migrate: job(migrate, 'prospectpilot-migrate'), research: job(research, 'prospectpilot-research'),
    ...(catalog ? {catalog: job(catalog, 'prospectpilot-plan-catalog')} : {})};
}

export function verifyCandidate(revision, {runtime, image, releaseId, cloudSqlInstances}) {
  if (!ready(revision)) fail('Candidate revision is not Ready; traffic must not move.');
  if (revision.metadata?.name !== `prospectpilot-${releaseId}`) fail('Candidate revision name does not match this release.');
  if (revision.spec?.serviceAccountName !== runtime) fail('Candidate runtime identity does not match; traffic must not move.');
  const container = containers(revision.spec);
  if (container.image !== image || !/@sha256:[a-f0-9]{64}$/.test(image)) fail('Candidate must use the exact immutable image digest.');
  if (container.ports?.length !== 1 || container.ports[0].name !== 'http1' || Number(container.ports[0].containerPort) !== 8080)
    fail('Candidate must serve HTTP/1 on port 8080, not h2c.');
  if (sql(revision) !== cloudSqlInstances) fail('Candidate Cloud SQL connection changed unexpectedly.');
  for (const key of ['startupProbe', 'livenessProbe']) {
    const probe = container[key];
    if (probe?.httpGet?.path !== '/health' || Number(probe.httpGet.port) !== 8080 ||
        !(probe.failureThreshold > 0) || !(probe.periodSeconds > 0) || !(probe.timeoutSeconds > 0))
      fail(`Candidate ${key} must check HTTP /health on port 8080.`);
  }
  if (container.env?.find(e => e.name === 'PROSPECTPILOT_RELEASE_ID')?.value !== releaseId)
    fail('Candidate release marker does not match.');
  return true;
}

export function verifyUnchangedTraffic(service, previousRevision, candidate) {
  if (servingRevision(service) !== previousRevision || service.status.latestCreatedRevisionName !== candidate)
    fail('Another release changed the service; do not promote this candidate.');
  return true;
}

// CLI inputs contain full service/job snapshots. Never print them or exceptions
// containing their values: env entries can contain secrets. Only named safe
// fields from the redacted state are exposed to the release shell.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, directory, ...args] = process.argv.slice(2);
    const read = name => JSON.parse(readFileSync(resolve(directory, name + '.json'), 'utf8'));
    if (command === 'serving') console.log(servingRevision(read('service')));
    else if (command === 'preflight') {
      const state = releasePreflight({service: read('service'), previous: read('previous'),
        migrate: read('migrate'), research: read('research'), catalog: args[1] === '1' ? read('catalog') : null, project: args[0]});
      writeFileSync(resolve(directory, 'state.json'), JSON.stringify(state), {mode: 0o600});
    } else if (command === 'field') {
      if (!['previousRevision', 'previousImage', 'cloudSqlInstances', 'builder', 'runtime', 'migrate.identity', 'migrate.image',
        'research.identity', 'research.image', 'catalog.identity', 'catalog.image'].includes(args[0])) fail('Unknown release-state field.');
      const value = args[0].split('.').reduce((v, key) => v?.[key], read('state'));
      if (typeof value !== 'string' || !value) fail('Missing release-state field.');
      console.log(value);
    } else if (command === 'candidate') {
      verifyCandidate(read('candidate'), {...read('state'), image: args[0], releaseId: args[1]});
    } else if (command === 'traffic') {
      verifyUnchangedTraffic(read('current'), read('state').previousRevision, args[0]);
    } else fail('Unknown release validation command.');
  } catch (error) {
    // Syntax errors may embed snippets of invalid input, so suppress those.
    console.error(error instanceof SyntaxError ? 'Invalid release snapshot JSON.' : error.message);
    process.exitCode = 1;
  }
}
