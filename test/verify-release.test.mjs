// What the post-deploy verifier notices.
//
// A checker that cannot fail passes everything, so most of this suite is broken
// services: the release that did not roll out, the API that answers without a
// session, the sign-in page a CDN is allowed to cache. Each runs against a real
// loopback HTTP server rather than a stubbed fetch, because the redirect and
// header handling being asserted lives in the transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {verifyRelease, EXPECTED, healthOptionalFor} from '../scripts/verify-release.mjs';

const RELEASE = 'review-20260925010203-4242';
const version = extra => JSON.stringify({application: 'ProspectPilot', ...EXPECTED, release_id: RELEASE, ...extra});

// A service that behaves. Individual routes are overridden per case.
function service(overrides = {}) {
  const routes = {
    'GET /healthz': res => res.writeHead(200).end('ok'),
    'GET /version': res => res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}).end(version()),
    'GET /login': res => res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}).end('<form>'),
    'GET /': res => res.writeHead(303, {location: '/login', 'cache-control': 'no-store'}).end(),
    'GET /prospect': res => res.writeHead(303, {location: '/login', 'cache-control': 'no-store'}).end(),
    'POST /logout': (res, req) => req.headers.origin && req.headers.origin !== 'ORIGIN'
      ? res.writeHead(403, {'content-type': 'application/json'}).end(JSON.stringify({detail: 'Please submit changes from this website.'}))
      : res.writeHead(303, {location: '/login'}).end(),
    ...overrides,
  };
  const unauthenticated = res => res.writeHead(401, {'content-type': 'application/json', 'cache-control': 'no-store'})
    .end(JSON.stringify({detail: 'Sign in to ProspectPilot.'}));
  const server = createServer((req, res) => {
    const key = `${req.method} ${req.url}`;
    const handler = routes[key] ?? (req.url.startsWith('/api/') ? overrides.api ?? unauthenticated : null);
    if (handler) return handler(res, req);
    res.writeHead(404).end();
  });
  return server;
}

async function run(server, options = {}) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await verifyRelease({base, release: RELEASE, ...options}); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
// Strictly failed. A check reported as not exposed on the host is a third state
// and must not be collected here, or the distinction is not being tested at all.
const failed = report => report.checks.filter(c => c.ok === false).map(c => c.id);

test('a correctly deployed service passes every check',async()=>{
  const report = await run(service());
  assert.deepEqual(failed(report), []);
  assert.equal(report.ok, true);
  // Every check reports what it saw, so a passing run is still evidence.
  assert.ok(report.checks.every(c => typeof c.detail === 'string' && c.detail.length));
  assert.ok(report.checks.length >= 10, `expected a substantial suite, got ${report.checks.length}`);
});

test('the release that did not roll out fails on its identifier alone',async()=>{
  const report = await run(service({'GET /version': res =>
    res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'})
      .end(version({release_id: 'review-20260924051858-30206'}))}));
  // The feature versions are right — they were right before the deploy too.
  // Only the identifier moves, which is exactly why it is checked separately.
  assert.deepEqual(failed(report), ['release_id']);
});

test('a build serving the wrong rules fails on the fields, not the identifier',async()=>{
  const report = await run(service({'GET /version': res =>
    res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'})
      .end(version({advisor_workspace_version: null, quality_version: 'retirement-evidence-1'}))}));
  assert.deepEqual(failed(report), ['version']);
  const detail = report.checks.find(c => c.id === 'version').detail;
  assert.match(detail, /advisor_workspace_version: expected advisor-workflow-1/);
  assert.match(detail, /quality_version: expected retirement-evidence-2/);
});

test('an API answering without a session fails, however ordinary the response looks',async()=>{
  const report = await run(service({api: res =>
    res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({items: [], counts: {}}))}));
  assert.deepEqual(failed(report), ['unauthenticated /api/lab/worklist', 'unauthenticated /api/lab/scoreboard',
    'unauthenticated /api/prospect/contacts', 'unauthenticated /api/prospect/me']);
});

test('a page rendered instead of sending an unauthenticated visitor to sign in fails',async()=>{
  const report = await run(service({'GET /': res =>
    res.writeHead(200, {'content-type': 'text/html'}).end('<h1>Your prospecting day.</h1>')}));
  assert.deepEqual(failed(report), ['redirect /']);
});

test('a cacheable version endpoint or sign-in page fails',async()=>{
  const stale = await run(service({'GET /version': res =>
    res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'public, max-age=300'}).end(version())}));
  assert.deepEqual(failed(stale), ['version_cache']);
  const login = await run(service({'GET /login': res =>
    res.writeHead(200, {'content-type': 'text/html', 'cache-control': 'public, max-age=600'}).end('<form>')}));
  assert.deepEqual(failed(login), ['login_page']);
});

test('a service that accepts a cross-origin write fails',async()=>{
  const report = await run(service({'POST /logout': res => res.writeHead(303, {location: '/login'}).end()}));
  assert.deepEqual(failed(report), ['cross_origin']);
});

test('an unreachable service fails every check instead of reporting nothing',async()=>{
  // Closed before the run, so nothing is listening. This is the case that makes
  // a thrown request a failure rather than a check that quietly did not happen.
  const server = service();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  await new Promise(resolve => server.close(resolve));
  const report = await verifyRelease({base, release: RELEASE, timeoutMs: 2000});
  assert.equal(report.ok, false);
  assert.equal(failed(report).length, report.checks.length, 'nothing may pass against a service that is not there');
  assert.match(report.checks.find(c => c.id === 'health').detail, /request failed/);
});

test('a missing release identifier is not silently skipped, and a bad base URL is refused',async()=>{
  // Called without one, the identifier check is absent rather than passing on
  // nothing -- the caller is told so on the command line.
  const report = await run(service(), {release: null});
  assert.equal(report.checks.some(c => c.id === 'release_id'), false);
  assert.equal(report.ok, true);
  await assert.rejects(verifyRelease({base: 'prospectpilot.io'}), /base URL/);
  await assert.rejects(verifyRelease({}), /base URL/);
});

test('a 404 on the health path only counts as unexposed where the host is known not to route it',async()=>{
  // What the live custom domain actually does: Firebase Hosting serves its own
  // 404 for a path it was not configured to rewrite to the service.
  const missing = {'GET /healthz': res =>
    res.writeHead(404, {'content-type': 'text/html'}).end('<!DOCTYPE html><html lang=en>')};

  // A loopback host is not a known front door, so the same 404 is a failure --
  // otherwise a broken health route on the service itself, or on any staging
  // environment, would report as n/a and the run would still pass.
  const strict = await run(service(missing));
  assert.deepEqual(failed(strict), ['health']);
  assert.equal(strict.ok, false);
  assert.match(strict.checks.find(c => c.id === 'health').detail, /should route it to the service/);

  // Excused explicitly, or by the host being one of the front doors that is
  // known not to rewrite the path.
  const excused = await run(service(missing), {allowUnroutedHealth: true});
  assert.deepEqual(failed(excused), []);
  assert.equal(excused.ok, true, 'a routing gap on the front door is not a sick release');
  assert.equal(excused.checks.find(c => c.id === 'health').ok, null);
  assert.match(excused.checks.find(c => c.id === 'health').detail, /not rewritten to the service/);

  // And the host list itself: the custom domain and Firebase Hosting are excused,
  // the Cloud Run service URL and anything unrecognized are not.
  for (const host of ['prospectpilot.io', 'www.prospectpilot.io', 'lead-qualifier-505002.web.app', 'x.firebaseapp.com'])
    assert.equal(healthOptionalFor(host), true, host);
  for (const host of ['prospectpilot-abc123-uc.a.run.app', 'staging.prospectpilot.io', '127.0.0.1', 'prospectpilot.io.example.com'])
    assert.equal(healthOptionalFor(host), false, host);

  // A required check cannot be waved through by the host being a front door.
  const required = await run(service(missing), {allowUnroutedHealth: false});
  assert.deepEqual(failed(required), ['health']);
});

test('a health path that is routed but unwell still fails',async()=>{
  for (const [label, route] of [
    ['a failing service', res => res.writeHead(500).end('boom')],
    ['a path answered by something else', res => res.writeHead(200, {'content-type': 'text/html'}).end('<h1>hello</h1>')],
  ]) {
    const report = await run(service({'GET /healthz': route}));
    assert.deepEqual(failed(report), ['health'], label);
    assert.equal(report.ok, false, label);
  }
});

test('the health host can be separated from the host whose public surface is verified',async()=>{
  // The trap this exists to avoid. The service URL answers /healthz, because the
  // application handles it before the origin check -- but every other route is
  // behind that check, and the allowed origins are the custom domain and the
  // Firebase Hosting ones, so the service URL answers 403 for all of them.
  // Verifying the whole thing from the service URL alone is not possible.
  const forbidden = res => res.writeHead(403, {'content-type': 'application/json'})
    .end(JSON.stringify({detail: 'Use the ProspectPilot website address.'}));
  const serviceOnly = await run(service({'GET /version': forbidden, 'GET /login': forbidden,
    'GET /': forbidden, 'GET /prospect': forbidden, api: forbidden}));
  const healthCheck = serviceOnly.checks.find(c => c.id === 'health');
  assert.equal(healthCheck.ok, true, 'the service URL does answer the health path');
  assert.equal(serviceOnly.ok, false, 'and cannot verify anything else, which must not read as verified');
  assert.ok(failed(serviceOnly).length >= 6, failed(serviceOnly).join(', '));

  // Split across the two: the public surface from the front door, the health path
  // from the service. Both hosts are named in the report so a passing run says
  // where each answer came from.
  const health = service();
  await new Promise(resolve => health.listen(0, '127.0.0.1', resolve));
  const healthBase = `http://127.0.0.1:${health.address().port}`;
  try {
    const front = service({'GET /healthz': res =>
      res.writeHead(404, {'content-type': 'text/html'}).end('<!DOCTYPE html>')});
    const report = await run(front, {healthBase, allowUnroutedHealth: false});
    assert.deepEqual(failed(report), [], 'the front door serves the surface, the service serves health');
    assert.equal(report.ok, true);
    assert.match(report.checks.find(c => c.id === 'health').detail, new RegExp(`at ${healthBase}`));
  } finally { await new Promise(resolve => health.close(resolve)); }

  // A health base that is not a URL is refused rather than quietly ignored.
  await assert.rejects(verifyRelease({base: 'https://prospectpilot.io', healthBase: 'localhost:8080'}), /health check/);
});

test('a version body that is valid JSON but not an object fails rather than matching nothing',async()=>{
  // Each of these parses, and each would leave the field comparison with nothing
  // to disagree with -- so the check would pass on a response containing none of
  // the fields it exists to check. With no release identifier supplied, that was
  // enough for the whole run to exit successfully.
  for (const body of ['null', 'false', '0', '""', '[]']) {
    const report = await run(service({'GET /version': res =>
      res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}).end(body)}),
      {release: null});
    assert.ok(failed(report).includes('version'), `${body} must fail the version check`);
    assert.equal(report.ok, false, `${body} must not read as verified`);
  }
  // A JSON object missing the fields still reports which ones, as before.
  const empty = await run(service({'GET /version': res =>
    res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}).end('{}')}));
  assert.match(empty.checks.find(c => c.id === 'version').detail, /feature_set: expected research-lab-v1/);
});
