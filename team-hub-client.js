'use strict';
const $ = id => document.getElementById(id);
const counts = {contacts:'Source contacts', lists:'Source lists', discoveryLeads:'Discovery leads', targetContacts:'Recipient contacts', listMembers:'List memberships', shares:'Existing shares', contactLinks:'Contact links', observations:'Observations', activities:'Activities', jobs:'Jobs'};
const titles = {mixed_owner_list:'Mixed-owner list', linked_record_outside_transfer:'Linked record outside scope', shared_history_outside_transfer:'Shared history outside scope', identity_collision:'Possible duplicate', identity_unresolved:'Unresolved source identity', target_identity_unresolved:'Unresolved recipient identity', unfinished_work:'Unfinished work', unknown_job_state:'Unknown job state', existing_shares:'Existing access grants', departed_access_not_revoked:'Access removal not verified', data_rights_review:'Ownership and provider rights', apply_not_implemented:'Transfer is not available'};
let advisors = [], generation = 0, controller = null, pending = false, ready = false;
const node = (tag, text, className) => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
function notice(text = '', error = '') { $('status').textContent = text; $('error').textContent = error; $('error').hidden = !error; }
function buttons() {
  const source = $('sourceAdvisor').value, target = advisors.find(row => row.uid === $('targetAdvisor').value);
  $('previewButton').disabled = !ready || pending || !source || !target || source === target.uid || target.disabled || !target.email_verified;
  $('sourceAdvisor').disabled = $('targetAdvisor').disabled = !ready;
  $('cancelPreview').hidden = !pending;
  $('previewForm').setAttribute('aria-busy', String(pending));
}
function clearPreview() {
  generation++; controller?.abort(); controller = null; pending = false; $('refreshAdvisors').disabled = false;
  $('results').hidden = true; $('empty').hidden = false;
  for (const id of ['counts', 'blockers', 'recordIds', 'collisions', 'preservation']) $(id).replaceChildren();
  $('pair').textContent = $('fingerprint').textContent = '';
  for (const detail of $('results').querySelectorAll('details')) detail.open = false;
  buttons();
}
function clearDirectory() {
  ready = false; advisors = [];
  for (const id of ['sourceAdvisor', 'targetAdvisor']) { $(id).replaceChildren(node('option', 'Choose an advisor')); $(id).firstChild.value = ''; $(id).value = ''; }
  $('team').textContent = 'Supervisor access is required.'; buttons();
}
async function api(path, options = {}) {
  const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options});
  let body; try { body = await response.json(); } catch { throw Error('The preview service returned an unreadable response. Please retry.'); }
  if (!response.ok) throw Object.assign(Error(body.detail || 'The preview could not be loaded.'), {status:response.status});
  return body;
}
function failure(error) {
  if (error.status === 401 || error.status === 403) clearDirectory();
  $('signIn').hidden = error.status !== 401;
  notice('', error.message || 'The connection was interrupted. Please retry.');
}
async function loadAdvisors() {
  clearPreview(); clearDirectory(); const ticket = generation;
  const request = new AbortController(); controller = request;
  $('signIn').hidden = true; $('refreshAdvisors').disabled = true;
  notice('Checking supervisor access and the team directory…');
  try {
    const data = await api('/api/team-hub/context', {signal:request.signal});
    if (ticket !== generation) return;
    if (data.mode !== 'preview_only' || data.can_execute !== false || !Array.isArray(data.advisors)) throw Error('The preview service is not ready. Please retry.');
    advisors = data.advisors; ready = true; $('team').textContent = 'Team: ' + data.team;
    $('synthetic').hidden = data.synthetic !== true;
    for (const id of ['sourceAdvisor', 'targetAdvisor']) for (const row of advisors) {
      const unavailable = row.disabled || !row.email_verified;
      const option = node('option', row.label + (unavailable ? ' · ' + (row.disabled ? 'disabled account' : 'email not verified') : '') + ' (' + row.uid + ')');
      option.value = row.uid; option.disabled = id === 'targetAdvisor' && unavailable; $(id).append(option);
    }
    notice(advisors.length < 2 ? 'At least two advisors are needed for a preview.' : 'Choose the departing and receiving advisors.');
  } catch (error) { if (ticket === generation && error.name !== 'AbortError') failure(error); }
  finally { if (ticket === generation) { controller = null; $('refreshAdvisors').disabled = false; buttons(); } }
}
function render(data) {
  if (data.mode !== 'preview_only' || data.can_execute !== false || !data.counts || !data.proposed_record_ids || !Array.isArray(data.blockers) || !Array.isArray(data.identity_collisions) || !Array.isArray(data.preservation_requirements)) throw Error('An unsafe or incomplete preview response was rejected.');
  const label = uid => (advisors.find(row => row.uid === uid)?.label || uid) + ' (' + uid + ')';
  $('pair').textContent = label(data.source_uid) + ' → ' + label(data.target_uid);
  for (const [key, title] of Object.entries(counts)) {
    const metric = node('div', '', 'metric'); metric.append(node('strong', String(data.counts[key])), node('span', title)); $('counts').append(metric);
  }
  for (const issue of data.blockers) { const item = node('li', ''); item.append(node('strong', (titles[issue.code] || 'Review required') + ' · ' + issue.count), node('p', issue.message)); $('blockers').append(item); }
  for (const [key, title] of [['contacts','Contacts'], ['lists','Lists'], ['discovery_leads','Discovery leads']]) {
    $('recordIds').append(node('h3', title), node('p', data.proposed_record_ids[key].join(', ') || 'None'));
  }
  $('collisions').append(node('p', data.identity_collisions.length ? data.identity_collisions.map(row => row.source_contact_id + ' → ' + row.target_contact_ids.join(', ')).join('\n') : 'No exact identity-key matches were found. This is not proof that every record is unique.'));
  for (const requirement of data.preservation_requirements) $('preservation').append(node('li', requirement));
  $('fingerprint').textContent = data.fingerprint;
  $('empty').hidden = true; $('results').hidden = false; $('resultTitle').focus();
}
async function generatePreview(event) {
  event?.preventDefault(); if ($('previewButton').disabled || pending) return;
  const source = $('sourceAdvisor').value, target = $('targetAdvisor').value;
  clearPreview(); const ticket = generation; const request = new AbortController(); controller = request; pending = true; buttons();
  notice('Reading the inventory. No records are being changed.'); $('signIn').hidden = true;
  try {
    const data = await api('/api/team-hub/preview', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({source_uid:source, target_uid:target}), signal:request.signal});
    if (ticket !== generation) return;
    if (data.source_uid !== source || data.target_uid !== target) throw Error('The preview did not match your selection. Please try again.');
    render(data); notice('Preview ready. No records or access have changed.');
  } catch (error) { if (ticket === generation && error.name !== 'AbortError') { clearPreview(); failure(error); } }
  finally { if (ticket === generation) { pending = false; controller = null; buttons(); } }
}
for (const id of ['sourceAdvisor', 'targetAdvisor']) $(id).addEventListener('change', () => { clearPreview(); notice('Selection changed. Generate a new preview.'); });
$('previewForm').addEventListener('submit', generatePreview);
$('refreshAdvisors').addEventListener('click', loadAdvisors);
for (const id of ['closePreview', 'cancelPreview']) $(id).addEventListener('click', () => { clearPreview(); notice('Preview closed. Nothing was changed.'); $('previewButton').focus(); });
window.addEventListener('pagehide', () => { clearPreview(); clearDirectory(); });
window.addEventListener('pageshow', event => { if (event.persisted) void loadAdvisors(); });
window.addEventListener('popstate', () => { clearPreview(); notice('Generate a fresh preview to review this selection.'); });
void loadAdvisors();
