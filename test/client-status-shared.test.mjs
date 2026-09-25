// A status is only terminal if every workflow agrees it is.
//
// The lab records Client and refuses further prospecting on the record. That
// guarantee is worth little if the owner-only calling and discovery tools -- which
// read the same discovery_leads rows through their own status list -- have never
// heard of it. These call into the built bundle those tools actually run, not the
// lab module that writes the status.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callEligibility} from '../generated/worker.mjs';

const callable = {phone: '+12125550123', identity_status: 'matched', imported_dnc: []};

test('the calling workflow will not offer a client for another prospecting call',()=>{
  // The control: this person is callable, so the assertions below are about the
  // status rather than about some other reason the record is not ready.
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

test('every status the application writes is registered, and only the right ones are terminal',()=>{
  // A status missing from the shared set is rejected by the legacy tools and is
  // absent from their pickers, so opening the record there and saving submits the
  // first option and undoes it. Met was in exactly that position before this
  // change: written by the lab since meeting outcomes shipped, registered nowhere.
  const bundle = readFileSync(new URL('../generated/worker.mjs', import.meta.url), 'utf8');
  const registered = bundle.match(/const FOLLOW_UP_STATUSES = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const status of ['New', 'Researching', 'Ready to Contact', 'Contacted', 'Follow-up',
    'Meeting Set', 'Met', 'Client', 'Nurture', 'Not a Fit'])
    assert.ok(registered.includes(`"${status}"`), `${status} is not registered`);

  // The dashboard's follow-ups-due count reads the shared terminal set rather than
  // its own inline list, so a client with a stale saved date is not chased.
  const terminal = bundle.match(/const TERMINAL_STATUSES = new Set\(\[(.*?)\]\)/)[1];
  for (const status of ['Meeting Set', 'Client', 'Not a Fit']) assert.ok(terminal.includes(`"${status}"`), status);
  assert.ok(!terminal.includes('"Met"'), 'a held meeting still owes a follow-up');
  assert.match(bundle, /follow_ups_due:[^,]*!TERMINAL_STATUSES\.has\(lead\.follow_up_status\)/);
});
