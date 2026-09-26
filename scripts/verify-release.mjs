/**
 * Post-deploy verification of a released service, from outside it.
 *
 * `release.sh` checks the version endpoint once, in the middle of a deploy, and
 * cannot be run again afterwards without deploying something. The rest of the
 * verification has been a list of things to remember to click, and twice now a
 * release has been recorded as unverified because the person holding the list
 * ran out of session before finishing it. This is the part of that list a
 * machine can do, so it can be re-run at any time against any environment.
 *
 * Unauthenticated and read-only by design. It can be pointed at production
 * safely: every request is a GET except one deliberately cross-origin POST that
 * the origin check must refuse before reaching any handler, so nothing here can
 * write, and no session cookie is ever sent. What it therefore cannot see is the
 * signed-in workspace; the worklist, cadence display, meeting outcomes and dial
 * counter still need a person with an account. What it does cover is everything
 * that should hold before anybody bothers signing in: the build that is serving,
 * the rules that build is running, and the fact that none of it is reachable
 * without a session.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const EXPECTED = {feature_set: 'research-lab-v1', quality_version: 'retirement-evidence-2',
  advisor_workspace_version: 'advisor-workflow-1', contact_workspace_version: 'professional-contacts-1'};

/**
 * Hosts whose front door is known not to rewrite `/healthz` to the service, so a
 * 404 there says something about the hosting rather than about the application.
 * Everywhere else -- the Cloud Run service URL, a staging environment, a local
 * server -- that path should be answered, and a 404 is a failure. Getting this
 * wrong in the permissive direction is worse than the inconvenience of listing
 * hosts: a broken health route on the service itself would report as `n/a` and
 * the run would still pass.
 */
const UNROUTED_HEALTH = [/^prospectpilot\.io$/, /^www\.prospectpilot\.io$/, /\.web\.app$/, /\.firebaseapp\.com$/];
const healthOptionalFor = hostname => UNROUTED_HEALTH.some(pattern => pattern.test(hostname));

export {EXPECTED, healthOptionalFor};

/**
 * One finished check. `ok` true passed and false failed; `null` means the route
 * is not exposed on the host being checked, which is a third thing and is
 * printed as such. Only false fails a run. `detail` always says what was seen,
 * so a pass is evidence rather than an assertion.
 */
const result = (id, ok, detail) => ({id, ok, detail});

export async function verifyRelease({base, release = null, expect = EXPECTED, allowUnroutedHealth = null,
  healthBase = null, fetch = globalThis.fetch, timeoutMs = 30000} = {}) {
  if (!base || !/^https?:\/\//.test(base)) throw Error('Pass the base URL of the service to verify.');
  if (healthBase !== null && !/^https?:\/\//.test(healthBase)) throw Error('Pass a base URL for the health check, or omit it.');
  const {origin} = new URL(base);
  // The two hosts cannot be one host, and this is why. `/healthz` is answered
  // before the origin check, so the service URL can serve it -- but every other
  // route is behind that check, and APP_ORIGINS lists only the custom domain and
  // the Firebase Hosting ones, so the service URL answers 403 for all of them.
  // The front door is the reverse: it serves the public surface and never
  // rewrites `/healthz`. Verifying both therefore takes both addresses, and
  // pointing this at one host alone cannot be made to cover the other.
  const healthOrigin = healthBase === null ? origin : new URL(healthBase).origin;
  // Decided from whichever host the health check actually goes to.
  const healthOptional = allowUnroutedHealth ?? healthOptionalFor(new URL(healthOrigin).hostname);
  const checks = [];
  // Never follow a redirect: a 303 to the sign-in page is the thing being
  // asserted, and following it would report the login page's 200 instead.
  const call = async (path, {method = 'GET', headers = {}, host = origin} = {}) => {
    const response = await fetch(host + path, {method, headers, redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs)});
    const text = await response.text();
    return {status: response.status, headers: response.headers, text};
  };
  const attempt = async (id, run) => {
    try { checks.push(await run()); }
    // A check that cannot complete is a failure, not an absence. Reporting it as
    // "not run" is how an unreachable service passes verification.
    catch (error) { checks.push(result(id, false, `request failed: ${error.message}`)); }
  };

  // The application answers /healthz before it checks anything else, but the
  // custom domain is fronted by Firebase Hosting and only rewrites the paths it
  // is configured for -- /healthz is not one of them, so through prospectpilot.io
  // it is the host's own 404 rather than the service's 'ok'. On those hosts only,
  // a 404 is reported as not exposed rather than failed: it is a routing fact
  // about the front door, not a sick service. Anywhere the path should be
  // answered -- the Cloud Run service URL above all -- a 404 fails, because a
  // broken health route reported as `n/a` is a health check that cannot fail.
  // Uptime monitoring therefore has to point at the service URL, not the domain.
  await attempt('health', async () => {
    const {status, text} = await call('/healthz', {host: healthOrigin});
    const where = healthOrigin === origin ? '' : ` at ${healthOrigin}`;
    if (status === 404) return healthOptional
      ? result('health', null, `GET /healthz${where} -> 404; not rewritten to the service on this host, so unchecked here`)
      : result('health', false, `GET /healthz${where} -> 404; this host should route it to the service`);
    return result('health', status === 200 && text.trim() === 'ok',
      `GET /healthz${where} -> ${status} ${JSON.stringify(text.slice(0, 40))}`);
  });

  // Reported as three checks rather than one, because a correct release
  // identifier with the wrong feature versions and the reverse are different
  // failures with different fixes. Each is emitted even when the endpoint is
  // broken, so a missing field reads as failed rather than as absent.
  {
    let response = null, version = null, failure = null;
    try { response = await call('/version'); } catch (error) { failure = `request failed: ${error.message}`; }
    if (response && response.status !== 200) failure = `GET /version -> ${response.status}`;
    else if (response) {
      let parsed;
      try { parsed = JSON.parse(response.text); }
      catch { failure = 'GET /version returned a body that is not JSON'; }
      // `null`, `false` and `0` are all valid JSON, and all of them would make the
      // field comparison below find nothing to disagree with -- so the check
      // would pass on a response containing none of the fields it is checking.
      if (failure === null && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)))
        failure = `GET /version returned JSON that is not an object: ${JSON.stringify(parsed)}`;
      else if (failure === null) version = parsed;
    }
    const wrong = version
      ? Object.entries(expect).filter(([key, value]) => version[key] !== value)
        .map(([key, value]) => `${key}: expected ${value}, serving ${JSON.stringify(version[key])}`)
      : [];
    checks.push(result('version', failure === null && wrong.length === 0,
      failure ?? (wrong.length ? wrong.join('; ')
        : `serving ${Object.keys(expect).length} expected version fields`)));
    const cacheControl = response?.headers.get('cache-control') ?? null;
    checks.push(result('version_cache', /no-store/.test(cacheControl || ''),
      `/version Cache-Control: ${cacheControl}`));
    if (release !== null) checks.push(result('release_id', version?.release_id === release,
      `serving release ${JSON.stringify(version?.release_id ?? null)}, expected ${JSON.stringify(release)}`));
  }

  await attempt('login_page', async () => {
    const {status, headers} = await call('/login');
    const html = /text\/html/.test(headers.get('content-type') || '');
    const uncached = /no-store/.test(headers.get('cache-control') || '');
    return result('login_page', status === 200 && html && uncached,
      `GET /login -> ${status} ${headers.get('content-type')} / ${headers.get('cache-control')}`);
  });

  await attempt('public_home', async () => {
    const {status, headers, text} = await call('/');
    return result('public_home', status === 200 && /text\/html/.test(headers.get('content-type') || '') &&
      /no-store/.test(headers.get('cache-control') || '') && text.includes('Your contacts.') && text.includes('href="/login"'),
      `GET / -> ${status}; public homepage and sign-in link expected`);
  });

  // Private pages must send an unauthenticated visitor to sign in.
  for (const path of ['/lab', '/prospect']) {
    await attempt('redirect ' + path, async () => {
      const {status, headers} = await call(path);
      return result('redirect ' + path, status === 303 && headers.get('location') === '/login',
        `GET ${path} -> ${status} Location: ${headers.get('location')}`);
    });
  }

  // The regression that matters most: an API answering without a session.
  for (const path of ['/api/lab/me', '/api/lab/worklist', '/api/lab/scoreboard', '/api/prospect/contacts', '/api/prospect/me']) {
    await attempt('unauthenticated ' + path, async () => {
      const {status, headers, text} = await call(path);
      let detail = null;
      try { detail = JSON.parse(text).detail; } catch {}
      const json = /application\/json/.test(headers.get('content-type') || '');
      return result('unauthenticated ' + path, status === 401 && json && typeof detail === 'string',
        `GET ${path} -> ${status} ${headers.get('content-type')} ${JSON.stringify(detail)}`);
    });
  }

  // Refused by the origin check before any handler runs, so this writes nothing
  // even against production. POST /logout is used rather than a real mutation
  // because its only effect is clearing a cookie that is not being sent.
  await attempt('cross_origin', async () => {
    const {status} = await call('/logout', {method: 'POST', headers: {origin: 'https://verify.invalid'}});
    return result('cross_origin', status === 403, `cross-origin POST /logout -> ${status}`);
  });

  return {ok: checks.every(c => c.ok !== false), base: origin, release, checks};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2);
  // --health-required holds any host to the health check; --health-optional
  // excuses one that is known not to route it. Without either, the host decides.
  const flag = name => argv.includes('--' + name);
  const allowUnroutedHealth = flag('health-required') ? false : flag('health-optional') ? true : null;
  // The front door cannot answer /healthz and the service URL cannot answer the
  // rest, so covering both takes both addresses.
  const healthBase = argv.find(a => a.startsWith('--health-base='))?.slice('--health-base='.length) ?? null;
  const [base = 'https://prospectpilot.io', release = null] = argv.filter(a => !a.startsWith('--'));
  const report = await verifyRelease({base, release, allowUnroutedHealth, healthBase});
  for (const c of report.checks) console.log(`${c.ok === null ? 'n/a ' : c.ok ? 'ok  ' : 'FAIL'} ${c.id} — ${c.detail}`);
  const failed = report.checks.filter(c => c.ok === false).length;
  const skipped = report.checks.filter(c => c.ok === null).length;
  console.log(`\n${report.checks.length - failed - skipped} passed, ${failed} failed` +
    (skipped ? `, ${skipped} not exposed on this host` : '') + ` against ${report.base}` +
    (release ? ` for release ${release}` : ' (no release identifier supplied)'));
  if (!report.ok) {
    console.log('This release is NOT verified. The signed-in workspace was not checked either way.');
    process.exitCode = 1;
  } else console.log('The public surface matches. Sign in to check the worklist, cadence, meeting outcomes and dial counter.');
}
