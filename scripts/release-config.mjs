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
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const byName = (items = []) => [...items].sort((a,b) => String(a.name).localeCompare(String(b.name)));
const releaseEnvironment = new Set(['PROSPECTPILOT_RELEASE_ID', 'PROSPECTPILOT_RELEASE_CHECK_ORIGIN']);
export const rollbackContractCommit = '3ba8bdbe55105fc0b9c83e2e3307966aa6499109';
export const ownershipContractCommit = 'c50d17bd39befd8e41f241b80d9d3e5493ad88f1';

// Compare in memory only. Never return or log env values, secret references,
// secret aliases, or hashes that could expose low-entropy secret values.
function runtimeConfiguration(resource) {
  const c = containers(resource?.spec);
  const env = c.env || [];
  if (!Array.isArray(env) || env.some(e => !e || typeof e.name !== 'string') || new Set(env.map(e => e.name)).size !== env.length)
    fail('Runtime environment is malformed; values were not logged.');
  return canonical({env: byName(env.filter(e => !releaseEnvironment.has(e.name))),
    command: c.command || [], args: c.args || [],
    volumes: byName(resource.spec.volumes), volumeMounts: byName(c.volumeMounts),
    secretAliases: resource.metadata?.annotations?.['run.googleapis.com/secrets'] || ''});
}
export function verifyRuntimeMatches(candidate, previous) {
  if (!previous || runtimeConfiguration(candidate) !== runtimeConfiguration(previous))
    fail('Runtime environment, secret references, mounts, or command differ from the serving revision. Review configuration separately; values were not logged.');
  return true;
}

function assertReachableRevisions(service, allowed) {
  if ((service.status.traffic || []).some(t => (Number(t.percent) > 0 || t.tag) && !allowed.includes(t.revisionName)))
    fail('A reachable traffic tag or revision is outside the verified rollback floor. Remove or verify it in a separately reviewed operation.');
}
export function servingRevision(service) {
  // Ready=False may describe a failed newest revision, not the serving one.
  if (!service?.status || service.status.conditions?.some(c => c.type === 'Ready' && c.status === 'Unknown'))
    fail('The service configuration is still reconciling; wait before releasing.');
  if (Number(service.status.observedGeneration) !== Number(service.metadata?.generation))
    fail('The service configuration is still reconciling; wait before releasing.');
  const traffic = (service.status.traffic || []).filter(t => Number(t.percent) > 0);
  if (traffic.length !== 1 || Number(traffic[0].percent) !== 100 || !traffic[0].revisionName)
    fail('Expected one serving revision at 100%; preserve split traffic with a reviewed release instead.');
  return traffic[0].revisionName;
}

export function candidateOrigin(serviceUrl, releaseId) {
  let url;
  try { url = new URL(serviceUrl); } catch { fail('Missing verified Cloud Run service URL.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.run.app') || url.hostname.includes('---') ||
      url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(releaseId)) fail('Invalid Cloud Run candidate origin.');
  return `https://${releaseId}---${url.hostname}`;
}

// Policy is a reviewed repository artifact, not an env override or caller's
// boolean attestation. Its allowlist starts EMPTY until actual registry-image
// provenance and PostgreSQL image-contract evidence have been reviewed.
export function verifyRollbackFloor({service, previous, policy, project, region, runtime}) {
  const name = servingRevision(service);
  assertReachableRevisions(service, [name]);
  if (previous.spec?.serviceAccountName !== runtime || containers(previous.spec).ports?.[0]?.name !== 'http1')
    fail('The serving rollback floor must already use its reviewed runtime identity and HTTP/1.');
  const declared = containers(previous.spec).image;
  const image = previous.status?.imageDigest || declared;
  if (!new RegExp(`^${region}-docker\\.pkg\\.dev/${project}/prospectpilot/app@sha256:[a-f0-9]{64}$`).test(image || '') ||
      (declared?.includes('@sha256:') && declared !== image)) fail('The serving rollback image has no matching immutable registry digest.');
  if (policy?.schemaVersion !== 2 || policy.contractCommit !== rollbackContractCommit ||
      policy.ownershipContractCommit !== ownershipContractCommit || !Array.isArray(policy.floors))
    fail('Invalid repository rollback-floor policy.');
  const floor = policy.floors.find(f => f.project === project && f.region === region && f.service === 'prospectpilot' && f.revision === name && f.image === image);
  if (!floor || !/^[a-f0-9]{40}$/.test(floor.sourceCommit || '') ||
      !/^https:\/\/github\.com\/dst-boop\/prospectpilot\.io\/actions\/runs\/\d+(?:\/|$)/.test(floor.imageTestEvidence || '') ||
      !/^https:\/\/github\.com\/dst-boop\/prospectpilot\.io\/actions\/runs\/\d+(?:\/|$)/.test(floor.ownershipTestEvidence || '') ||
      !/^https:\/\/console\.cloud\.google\.com\/cloud-build\//.test(floor.buildProvenance || ''))
    fail('Networking release blocked: the serving revision lacks a reviewed immutable image floor with captured-alias deletion and UID-ownership evidence. PR100 source or a local image ID alone is insufficient.');
  return {image, sourceCommit: floor.sourceCommit};
}

export function releasePreflight({service, previous, migrate, research, catalog = null, project, region, rollbackPolicy}) {
  const previousRevision = servingRevision(service);
  if (!ready(previous) || previous.metadata?.name !== previousRevision) fail('Serving revision snapshot does not match the live service.');
  const builder = `prospectpilot-builder@${project}.iam.gserviceaccount.com`;
  const runtime = `prospectpilot-runtime@${project}.iam.gserviceaccount.com`;
  const cloudSqlInstances = sql(previous);
  if (!cloudSqlInstances) fail('The serving revision has no Cloud SQL connection.');
  // Image updates inherit the NEWEST template, which need not be the serving
  // revision. Detect its DB/auth/provider drift before any build or migration.
  verifyRuntimeMatches(service.spec?.template, previous);
  const floor = verifyRollbackFloor({service, previous, policy: rollbackPolicy, project, region, runtime});
  candidateOrigin(service.status.url, 'preflight');
  const job = (value, name) => {
    if (value?.metadata?.name !== name) fail(`Missing expected job ${name}; run separately reviewed setup first.`);
    const spec = value?.spec?.template?.spec?.template?.spec;
    const image = containers(spec).image;
    if (typeof image !== 'string' || !image) fail(`Missing prior image for ${name}.`);
    return {identity: account(spec?.serviceAccountName, project, builder), image};
  };
  return {previousRevision, previousImage: floor.image, rollbackSourceCommit: floor.sourceCommit,
    cloudSqlInstances, builder, runtime, serviceUrl: service.status.url,
    migrate: job(migrate, 'prospectpilot-migrate'), research: job(research, 'prospectpilot-research'),
    ...(catalog ? {catalog: job(catalog, 'prospectpilot-plan-catalog')} : {})};
}

export function verifyCandidate(revision, {runtime, image, releaseId, cloudSqlInstances, previous, readinessOrigin}) {
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
  if (!readinessOrigin || container.env?.find(e => e.name === 'PROSPECTPILOT_RELEASE_CHECK_ORIGIN')?.value !== readinessOrigin)
    fail('Candidate readiness origin does not match the verified traffic tag.');
  verifyRuntimeMatches(revision, previous);
  return true;
}

export function verifyUnchangedTraffic(service, previousRevision, candidate, readinessOrigin) {
  if (servingRevision(service) !== previousRevision || service.status.latestCreatedRevisionName !== candidate)
    fail('Another release changed the service; do not promote this candidate.');
  assertReachableRevisions(service, [previousRevision, candidate]);
  const tag = candidate.slice('prospectpilot-'.length);
  if (!readinessOrigin || !(service.status.traffic || []).some(t => t.tag === tag && t.revisionName === candidate && t.url === readinessOrigin))
    fail('The candidate traffic tag does not resolve to the exact validated revision and origin.');
  return true;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, directory, ...args] = process.argv.slice(2);
    const read = name => JSON.parse(readFileSync(resolve(directory, name + '.json'), 'utf8'));
    if (command === 'serving') console.log(servingRevision(read('service')));
    else if (command === 'preflight') {
      const rollbackPolicy = JSON.parse(readFileSync(new URL('./release-rollback-policy.json', import.meta.url), 'utf8'));
      const state = releasePreflight({service: read('service'), previous: read('previous'),
        migrate: read('migrate'), research: read('research'), catalog: args[2] === '1' ? read('catalog') : null,
        project: args[0], region: args[1], rollbackPolicy});
      writeFileSync(resolve(directory, 'state.json'), JSON.stringify(state), {mode: 0o600});
    } else if (command === 'field') {
      if (!['previousRevision', 'previousImage', 'cloudSqlInstances', 'builder', 'runtime', 'serviceUrl', 'migrate.identity', 'migrate.image',
        'research.identity', 'research.image', 'catalog.identity', 'catalog.image'].includes(args[0])) fail('Unknown release-state field.');
      const value = args[0].split('.').reduce((v, key) => v?.[key], read('state'));
      if (typeof value !== 'string' || !value) fail('Missing release-state field.');
      console.log(value);
    } else if (command === 'candidate-origin') console.log(candidateOrigin(read('state').serviceUrl, args[0]));
    else if (command === 'candidate') {
      verifyCandidate(read('candidate'), {...read('state'), previous: read('previous'), image: args[0], releaseId: args[1], readinessOrigin: args[2]});
    } else if (command === 'traffic') {
      verifyUnchangedTraffic(read('current'), read('state').previousRevision, args[0], args[1]);
    } else fail('Unknown release validation command.');
  } catch (error) {
    console.error(error instanceof SyntaxError ? 'Invalid release snapshot JSON.' : error.message);
    process.exitCode = 1;
  }
}
