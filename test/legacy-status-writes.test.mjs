// Who may set a status, as opposed to which statuses exist.
//
// Registering Met and Client in the shared list let the legacy /discovery tools
// display and preserve them -- and, until this guard, assign them directly. That
// would mark a conversion with no conversation behind it and no activity for the
// funnel to count, or move a client back into prospecting without the reopen the
// workspace requires. These drive the real worker against a database rather than
// reading the bundle, because the question is what the endpoints do.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../database.mjs';
import worker from '../generated/worker.mjs';

const headers = {'oai-authenticated-user-id': 'verified-owner',
  'oai-authenticated-user-email': 'owner@example.com'};
const json = {...headers, 'content-type': 'application/json'};
const API = 'https://prospectpilot.io/api/v3/discovery';

async function fixture() {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL('../generated/schema.sql', import.meta.url), 'utf8'));
  const pool = {query: (...a) => pg.query(...a), connect: async () => ({query: (...a) => pg.query(...a), release() {}})};
  const db = createDatabase(pool);
  const csv = 'First Name,Last Name,Email Address,Route,Age Basis,DNC Status\n' +
    'Jamie,Rivera,jamie@example.com,HOLD_UNKNOWN_AGE,UNKNOWN,UNSCRUBBED';
  const imported = await worker.fetch(new Request(`${API}/imports/csv?provider=qualifier`,
    {method: 'POST', headers, body: csv}), {DB: db});
  assert.equal(imported.status, 201, await imported.clone().text());
  const id = (await pg.query('SELECT id FROM discovery_leads LIMIT 1')).rows[0].id;
  const patch = body => worker.fetch(new Request(`${API}/leads/${id}`,
    {method: 'PATCH', headers: json, body: JSON.stringify(body)}), {DB: db});
  const payload = async () => (await pg.query('SELECT payload FROM discovery_leads WHERE id=$1', [id])).rows[0].payload;
  // Whitespace-tolerant: a jsonb round-trip re-serializes with a space after the
  // colon, while the worker's own writes go through JSON.stringify and have none.
  const status = async () => (await payload()).match(/"follow_up_status":\s*"([^"]*)"/)?.[1] ?? null;
  // Stands in for the lab recording the outcome, which is the only writer of these.
  const setStatus = value => pg.query(
    `UPDATE discovery_leads SET payload=jsonb_set(payload::jsonb,'{follow_up_status}',$2::jsonb)::text WHERE id=$1`,
    [id, JSON.stringify(value)]);
  const detail = async response => JSON.stringify(await response.json());
  return {pg, db, id, patch, payload, status, setStatus, detail};
}

test('the status field cannot assign an outcome the workflow owns',async()=>{
  const {pg, patch, status, detail} = await fixture();
  try {
    // An ordinary status still works, so the guard is not simply refusing writes.
    assert.equal((await patch({follow_up_status: 'Contacted'})).status, 200);
    assert.equal(await status(), 'Contacted');

    for (const claimed of ['Client', 'Met']) {
      const response = await patch({follow_up_status: claimed});
      assert.equal(response.status, 422, claimed);
      assert.match(await detail(response), /advisor workspace/, claimed);
      assert.equal(await status(), 'Contacted', `${claimed} must not have been written`);
    }
  } finally { await pg.close(); }
});

test('a client keeps its status through an unrelated edit, and cannot be moved out of it here',async()=>{
  const {pg, patch, payload, status, setStatus, detail} = await fixture();
  try {
    await setStatus('Client');
    // What the drawer actually sends: the status field is always included, so an
    // edit to the notes resends "Client" unchanged. That must pass.
    const saved = await patch({follow_up_status: 'Client', notes: 'Signed the paperwork.', follow_up_date: null});
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal(await status(), 'Client');
    assert.match(await payload(), /Signed the paperwork/);

    // Editing a field without mentioning the status is fine too.
    assert.equal((await patch({notes: 'Another note.'})).status, 200);
    assert.equal(await status(), 'Client');

    // Moving them out of it is not, because that is what reopening is for.
    for (const next of ['Contacted', 'Not a Fit', 'New']) {
      const refused = await patch({follow_up_status: next});
      assert.equal(refused.status, 422, next);
      assert.match(await detail(refused), /Reopen it for research/, next);
      assert.equal(await status(), 'Client', next);
    }
  } finally { await pg.close(); }
});

test('the bulk endpoint cannot assign or clear a workflow status either',async()=>{
  const {pg, db, id, status, setStatus} = await fixture();
  try {
    const bulk = body => worker.fetch(new Request(`${API}/leads/bulk`,
      {method: 'PATCH', headers: json, body: JSON.stringify(body)}), {DB: db});
    // Bulk applies one status to many records, so assigning a conversion through
    // it would be the same bypass at scale.
    await bulk({lead_ids: [id], action: 'update', follow_up_status: 'Client'});
    assert.notEqual(await status(), 'Client', 'bulk must not mint a client');
    await bulk({lead_ids: [id], action: 'update', follow_up_status: 'Nurture'});
    assert.equal(await status(), 'Nurture', 'an ordinary bulk status still applies');

    await setStatus('Client');
    await bulk({lead_ids: [id], action: 'update', follow_up_status: 'Contacted'});
    assert.equal(await status(), 'Client', 'bulk must not clear one either');
  } finally { await pg.close(); }
});

test('a client is dropped from the provider candidate export but kept for the CRM',async()=>{
  const {pg, db, id, setStatus} = await fixture();
  try {
    const exportTo = target => worker.fetch(new Request(`${API}/export/${target}`,
      {method: 'POST', headers: json, body: JSON.stringify({lead_ids: [id]})}), {DB: db});
    // While they are a prospect, the candidate export includes them.
    const before = await exportTo('zoominfo');
    assert.equal(before.status, 200, await before.clone().text());
    assert.match(await before.text(), /Jamie/);

    await setStatus('Client');
    // Every selected lead is a client, so there is nothing to enrich and the
    // refusal says why rather than handing back an empty file.
    const after = await exportTo('zoominfo');
    assert.equal(after.status, 422);
    assert.match(JSON.stringify(await after.json()), /already a client/);

    // The CRM handoff is exactly where a client belongs, and is unaffected.
    const crm = await exportTo('salesforce');
    assert.equal(crm.status, 200, await crm.clone().text());
    assert.match(await crm.text(), /Jamie/);
  } finally { await pg.close(); }
});

test('the writing pickers do not offer a workflow status, while the filter still does',()=>{
  // Markup, so asserted as markup: there is no DOM harness for this page. The page
  // is embedded in the bundle as a JSON string, so its quotes arrive escaped.
  const bundle = readFileSync(new URL('../generated/worker.mjs', import.meta.url), 'utf8');
  assert.match(bundle, /<option disabled>Met<\/option><option disabled>Client<\/option>/);
  assert.match(bundle, /\['Met','Client'\]\.includes\(x\)\?' disabled':''/);
  const filter = bundle.match(/id=\\?"statusFilter\\?"[\s\S]*?<\/select>/)[0];
  assert.ok(filter.includes('<option>Client</option>'), filter);
  assert.ok(!filter.includes('<option disabled>Client</option>'));
  assert.match(bundle, /Met and Client are set by saving an outcome in the advisor workspace/);
});
