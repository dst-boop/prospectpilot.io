// A status is only terminal if every workflow agrees it is.
//
// The lab records "Client" and refuses further prospecting on the record. That
// guarantee is worth nothing if the owner-only calling and discovery tools --
// which read the same `discovery_leads` rows through their own status list --
// have never heard of it. These assert against the built bundle those tools
// actually run, not against the lab module that writes the status.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callEligibility} from '../generated/worker.mjs';

const callable = {phone: '+12125550123', identity_status: 'matched', imported_dnc: []};
const bundle = readFileSync(new URL('../generated/worker.mjs', import.meta.url), 'utf8');
const discoveryPickers = () => bundle.match(/'New','Researching'[^\]]*\]/g) || [];

test('the calling workflow will not offer a client for another prospecting call',()=>{
  // The control: this person is callable.
  assert.equal(callEligibility(callable).ready, true);
  const client = callEligibility({...callable, follow_up_status: 'Client'});
  assert.equal(client.ready, false);
  assert.ok(client.reasons.includes('Removed from new calls'), client.reasons.join('; '));
  // A held meeting is not terminal -- it is followed up -- so it stays callable.
  assert.equal(callEligibility({...callable, follow_up_status: 'Met'}).ready, true);
  // And the statuses that were already terminal still are.
  for (const status of ['Not a Fit', 'Meeting Set', 'Nurture'])
    assert.equal(callEligibility({...callable, follow_up_status: status}).ready, false, status);
});

test('every status the application writes is registered in the shared list',()=>{
  // A status missing here is rejected by the legacy tools, and is absent from
  // their pickers -- so opening the record there and saving silently submits the
  // first option and undoes it. "Met" was in that position before this change.
  const registered = bundle.match(/const FOLLOW_UP_STATUSES = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const status of ['New', 'Researching', 'Ready to Contact', 'Contacted', 'Follow-up',
    'Meeting Set', 'Met', 'Client', 'Nurture', 'Not a Fit'])
    assert.ok(registered.includes(`"${status}"`), `${status} is not registered`);
});

test('the discovery pickers offer every registered status, so saving cannot reset one',()=>{
  const pickers = discoveryPickers();
  assert.ok(pickers.length, 'no status picker found in the bundle');
  for (const picker of pickers)
    for (const status of ['Meeting Set', 'Met', 'Client', 'Nurture', 'Not a Fit'])
      assert.ok(picker.includes(`'${status}'`), `${status} missing from a picker: ${picker}`);
});

test('a client is not chased for a prospecting follow-up',()=>{
  // The dashboard's follow-ups-due count reads the shared terminal set rather
  // than its own inline list, so a client with a stale saved date is not due.
  const terminal = bundle.match(/const TERMINAL_STATUSES = new Set\(\[(.*?)\]\)/)[1];
  for (const status of ['Meeting Set', 'Client', 'Not a Fit']) assert.ok(terminal.includes(`"${status}"`), status);
  // Met is deliberately absent: a held meeting still owes a follow-up.
  assert.ok(!terminal.includes('"Met"'), 'a held meeting is not terminal');
  assert.match(bundle, /follow_ups_due:[^,]*!TERMINAL_STATUSES\.has\(lead\.follow_up_status\)/);
});

test('the provider candidate export drops clients but the CRM export keeps them',()=>{
  // Provider enrichment is for prospects; a CRM handoff is exactly where a client
  // belongs, so only one of the two exports filters.
  assert.match(bundle, /const candidates = leadsForExport\.filter\(lead => lead\.follow_up_status !== "Client"\)/);
  assert.match(bundle, /Every selected lead is already a client/);
  // The Salesforce export above it is untouched: no status filter on its rows.
  const salesforce = bundle.match(/export\/salesforce[\s\S]*?salesforceCSV\(leadsForExport\)/);
  assert.ok(salesforce, 'salesforce export not found');
  assert.ok(!salesforce[0].includes('follow_up_status !== "Client"'), 'a client belongs in a CRM export');
});
