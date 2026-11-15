import {previewAdvisorReassignment} from './advisor-reassignment-preview.mjs';

const publicFailure = Symbol('public hub failure');
const fail = (status, message) => Object.assign(new Error(message), {status, [publicFailure]:true});
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
export const isTeamLeadHubPath = path => path === '/team-hub' || path.startsWith('/team-hub/') || path === '/team-hub-client.js' || path === '/team-hub.css' || path === '/api/team-hub' || path.startsWith('/api/team-hub/');
const headers = {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json = (body, status = 200) => Response.json(body, {status, headers});

// Adapters are application code, never request fields. There is intentionally no
// default supervisor policy, roster, database loader, or apply endpoint.
export function createTeamLeadHub({authorizeSupervisor, listAdvisors, plannerAdapters, page = '', script = '', style = '', synthetic = false, distributionPlanner} = {}) {
  async function access(actor) {
    if (!identifier(actor?.uid)) throw fail(401, 'Sign in to review the team.');
    if (typeof authorizeSupervisor !== 'function') throw fail(503, 'Team preview is not configured. No records have been read.');
    const grant = await authorizeSupervisor({actor});
    if (grant?.approved !== true || grant.actorUid !== actor.uid || grant.scope !== 'team-lead-hub-preview' || !identifier(grant.team))
      throw fail(403, 'Supervisor access is required for this team.');
    return grant;
  }
  async function roster(actor, team) {
    if (typeof listAdvisors !== 'function') throw fail(503, 'The team directory is not configured.');
    const rows = await listAdvisors({actor, team});
    if (!Array.isArray(rows) || rows.length > 200 || rows.some(row => !identifier(row?.uid) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 160 || typeof row.disabled !== 'boolean' || typeof row.emailVerified !== 'boolean') || new Set(rows.map(row => row.uid)).size !== rows.length)
      throw fail(503, 'The team directory could not be verified.');
    return rows.map(row => ({uid:row.uid, label:row.label, disabled:row.disabled, email_verified:row.emailVerified}));
  }
  return {async route(request, actor) {
    try {
      const {pathname, origin} = new URL(request.url);
      const grant = await access(actor); // Before roster, account, snapshot or asset reads.
      if (request.method === 'GET' && ['/team-hub', '/team-hub-client.js', '/team-hub.css'].includes(pathname)) {
        const asset = pathname.endsWith('.js') ? [script, 'text/javascript'] : pathname.endsWith('.css') ? [style, 'text/css'] : [page, 'text/html'];
        if (!asset[0]) throw fail(503, 'Team preview is not configured.');
        return new Response(asset[0], {headers:{...headers, 'Content-Type':asset[1] + '; charset=utf-8'}});
      }
      if (pathname === '/api/team-hub/context' && request.method === 'GET')
        return json({mode:'preview_only', can_execute:false, synthetic, team:grant.team, advisors:await roster(actor, grant.team)});
      if (pathname === '/api/team-hub/distribution-preview') {
        if (request.method !== 'POST') return new Response(null, {status:405, headers:{...headers, Allow:'POST'}});
        if (request.headers.get('origin') !== origin) throw fail(403, 'Generate the preview from this website.');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw fail(415, 'Send a JSON preview request.');
        if (typeof distributionPlanner !== 'function') throw fail(503, 'Distribution preview is not configured.');
        const text = await request.text();
        if (text.length > 20_000) throw fail(413, 'The preview request is too large.');
        let body; try { body = JSON.parse(text); } catch { throw fail(400, 'The preview request is not valid JSON.'); }
        const result = await distributionPlanner(body, actor, grant.team);
        if (result?.firmId !== grant.team || result?.can_execute !== false || result?.mode !== 'preview_only')
          throw fail(403, 'Distribution preview is outside the authorized team.');
        return json(result);
      }
      if (pathname !== '/api/team-hub/preview') throw fail(404, 'This preview workspace has no transfer action.');
      if (request.method !== 'POST') return new Response(null, {status:405, headers:{...headers, Allow:'POST'}});
      // POST is read-only but keeps advisor IDs out of URLs/history and requires CSRF protection.
      if (request.headers.get('origin') !== origin) throw fail(403, 'Generate the preview from this website.');
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw fail(415, 'Send a JSON preview request.');
      const text = await request.text();
      if (text.length > 2048) throw fail(413, 'The preview request is too large.');
      let body; try { body = JSON.parse(text); } catch { throw fail(400, 'The preview request is not valid JSON.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['source_uid', 'target_uid'].includes(key)) || !identifier(body.source_uid) || !identifier(body.target_uid) || body.source_uid === body.target_uid)
        throw fail(422, 'Choose two different advisors from this team.');
      const advisors = await roster(actor, grant.team);
      if (![body.source_uid, body.target_uid].every(uid => advisors.some(row => row.uid === uid))) throw fail(403, 'Choose advisors from the authorized team.');
      // Bind the exact-pair planner grant to the same authoritative team as the UI.
      const authorize = plannerAdapters?.authorize;
      const adapters = {...plannerAdapters, authorize:async args => {
        const pair = typeof authorize === 'function' ? await authorize(args) : null;
        return pair?.team === grant.team ? pair : null;
      }};
      return json(await previewAdvisorReassignment({actor, sourceUid:body.source_uid, targetUid:body.target_uid}, adapters));
    } catch (error) {
      // Expected planner errors are deliberately data-minimized; internal failures
      // must never echo database/provider errors, identifiers or credential values.
      const safe = {401:'Sign in to review the team.',403:'Reassignment preview is not authorized.',409:'The ownership snapshot is incomplete or outside the authorized scope. Refresh and retry.',413:'This inventory needs a smaller, bounded review.',422:'The advisor accounts or selection could not be verified. The recipient must be active and email-verified.',503:'Team preview is not configured or is temporarily unavailable.'};
      const status = error[publicFailure] ? error.status : (Object.hasOwn(safe, error.status) ? Number(error.status) : 500);
      return json({detail:error[publicFailure] ? error.message : safe[status] || 'Team preview could not be loaded. Please retry.'}, status);
    }
  }};
}
