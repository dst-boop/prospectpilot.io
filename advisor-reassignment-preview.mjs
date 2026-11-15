import {createHash} from 'node:crypto';

// A planning boundary, not an ownership-changing endpoint. It has no database,
// provider, authentication-management, or messaging client. The integrating
// service must supply server-resolved authorization, accounts, and a complete
// coherent snapshot. Do not pass request-body rows or roles to these adapters.
export const REASSIGNMENT_PREVIEW_VERSION = 'advisor-reassignment-preview-1';
const collections = ['contacts', 'targetContacts', 'lists', 'listMembers', 'shares',
  'discoveryLeads', 'contactLinks', 'observations', 'activities', 'jobs'];
const pending = new Set(['pending', 'queued', 'running', 'waiting', 'paused', 'needs_attention']);
const finished = new Set(['completed', 'failed', 'skipped', 'done', 'stopped', 'cancelled']);
const fail = (status, message) => Object.assign(new Error(message), {status});
const identifier = value => typeof value === 'string' && value.length > 0 &&
  value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sorted = rows => rows.map(canonical).sort((a, b) => { const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0; });

/**
 * Return a data-minimized, non-executable transfer preview.
 * authorize must verify this exact source/target against the firm's authoritative
 * membership/ownership policy. Neither the legacy global team value nor an email
 * domain is sufficient proof of firm membership. Fail closed without the adapter.
 * loadSnapshot must include all collections, even empty ones, at one read point.
 */
export async function previewAdvisorReassignment({actor, sourceUid, targetUid}, adapters = {}) {
  if (!identifier(actor?.uid)) throw fail(401, 'Sign in to preview reassignment.');
  if (!identifier(sourceUid) || !identifier(targetUid) || sourceUid === targetUid)
    throw fail(422, 'Choose two different advisor account IDs.');
  if (typeof adapters.authorize !== 'function') throw fail(403, 'Reassignment preview is not authorized.');
  // Authorize before resolving accounts or reading rows to avoid enumeration.
  const grant = await adapters.authorize({actor, sourceUid, targetUid});
  if (grant?.approved !== true || grant.scope !== 'advisor-reassignment-preview' ||
      grant.sourceUid !== sourceUid || grant.targetUid !== targetUid || !identifier(grant.team))
    throw fail(403, 'Reassignment preview is not authorized.');
  if (typeof adapters.resolveAccount !== 'function' || typeof adapters.loadSnapshot !== 'function')
    throw fail(503, 'Reassignment preview is not configured.');
  const [source, target] = await Promise.all([adapters.resolveAccount(sourceUid), adapters.resolveAccount(targetUid)]);
  if (source?.uid !== sourceUid || target?.uid !== targetUid)
    throw fail(422, 'An advisor account could not be verified.');
  if (target.disabled !== false || target.emailVerified !== true)
    throw fail(422, 'The receiving advisor needs an active, verified account.');
  const snapshot = await adapters.loadSnapshot({sourceUid, targetUid, team: grant.team});
  if (snapshot?.complete !== true || collections.some(key => !Array.isArray(snapshot[key])))
    throw fail(409, 'A complete ownership snapshot is required.');
  if (collections.some(key => snapshot[key].length > 10000))
    throw fail(413, 'This inventory needs a paginated reassignment review.');
  for (const key of collections) {
    if (snapshot[key].some(row => !row || typeof row !== 'object' || Array.isArray(row)))
      throw fail(409, 'The ownership snapshot contains an invalid record.');
  }
  const owned = [...snapshot.contacts, ...snapshot.lists, ...snapshot.contactLinks,
    ...snapshot.observations, ...snapshot.activities, ...snapshot.jobs];
  if (owned.some(row => row.user_id !== sourceUid) || snapshot.targetContacts.some(row => row.user_id !== targetUid) ||
      snapshot.discoveryLeads.some(row => row.owner_user_id !== sourceUid || row.team !== grant.team))
    throw fail(409, 'The snapshot includes records outside the authorized ownership scope.');
  for (const key of ['contacts', 'targetContacts', 'lists', 'discoveryLeads', 'jobs']) {
    if (snapshot[key].some(row => !identifier(row.id)) || new Set(snapshot[key].map(row => row.id)).size !== snapshot[key].length)
      throw fail(409, 'The snapshot has missing or duplicate record IDs.');
  }
  const issues = [];
  const add = (code, count, message) => issues.push({code, count, message});
  const contacts = new Set(snapshot.contacts.map(row => row.id));
  const lists = new Set(snapshot.lists.map(row => row.id));
  const leads = new Set(snapshot.discoveryLeads.map(row => row.id));
  if (snapshot.listMembers.some(row => !lists.has(row.list_id)) || snapshot.shares.some(row => !lists.has(row.list_id)))
    throw fail(409, 'The snapshot includes an unrelated list.');
  const foreignMembers = snapshot.listMembers.filter(row => !contacts.has(row.contact_id));
  if (foreignMembers.length) add('mixed_owner_list', foreignMembers.length, 'Resolve list members owned by another advisor before planning a transfer.');
  const externalLinks = snapshot.contactLinks.filter(row => !contacts.has(row.contact_id) || !leads.has(row.lead_id));
  if (externalLinks.length) add('linked_record_outside_transfer', externalLinks.length, 'Review linked contacts and shared leads together; do not detach their history.');
  const externalEvidence = [...snapshot.observations, ...snapshot.activities].filter(row => !leads.has(row.lead_id));
  if (externalEvidence.length) add('shared_history_outside_transfer', externalEvidence.length, 'Some history belongs to shared leads outside this transfer; retain its original scope and author.');
  const targetKeys = new Map();
  let identityKeyCount = 0;
  for (const row of [...snapshot.contacts, ...snapshot.targetContacts]) {
    if (!Array.isArray(row.identity_keys) || row.identity_keys.some(key => typeof key !== 'string' || !key))
      throw fail(409, 'Contact identity keys are incomplete.');
    identityKeyCount += row.identity_keys.length;
    if (row.identity_keys.length > 32 || identityKeyCount > 100000 || row.identity_keys.some(key => key.length > 2048))
      throw fail(413, 'This identity inventory needs a bounded review.');
  }
  for (const row of snapshot.targetContacts) for (const key of row.identity_keys) {
    if (!targetKeys.has(key)) targetKeys.set(key, new Set());
    targetKeys.get(key).add(row.id);
  }
  const collisions = [];
  let collisionPairs = 0;
  for (const row of snapshot.contacts) {
    const matches = new Set();
    for (const key of new Set(row.identity_keys)) for (const id of targetKeys.get(key) || []) {
      if (!matches.has(id)) {
        if (++collisionPairs > 10000) throw fail(413, 'Too many possible duplicates; narrow the inventory before reviewing.');
        matches.add(id);
      }
    }
    if (matches.size) collisions.push({source_contact_id: row.id, target_contact_ids: [...matches].sort()});
  }
  collisions.sort((a, b) => a.source_contact_id.localeCompare(b.source_contact_id));
  if (collisions.length) add('identity_collision', collisions.length, 'Review possible duplicates with the receiving advisor; never merge by name or overwrite evidence automatically.');
  const unkeyed = snapshot.contacts.filter(row => row.identity_keys.length === 0);
  if (unkeyed.length) add('identity_unresolved', unkeyed.length, 'Review contacts with no identity keys before reassignment.');
  const unresolvedTarget = snapshot.targetContacts.filter(row => row.identity_keys.length === 0);
  if (unresolvedTarget.length) add('target_identity_unresolved', unresolvedTarget.length, 'The receiving advisor has contacts without identity keys; duplicates cannot be ruled out.');
  const activeJobs = snapshot.jobs.filter(row => pending.has(row.status));
  if (activeJobs.length) add('unfinished_work', activeJobs.length, 'Pause and settle queued, running, or resumable work before any transfer; do not move approved budgets.');
  const unknownJobs = snapshot.jobs.filter(row => !pending.has(row.status) && !finished.has(row.status));
  if (unknownJobs.length) add('unknown_job_state', unknownJobs.length, 'Resolve unknown job states before any transfer.');
  if (snapshot.shares.length) add('existing_shares', snapshot.shares.length, 'Review every existing list share. Ownership transfer must not silently widen or retain unwanted access.');
  if (source.disabled !== true) add('departed_access_not_revoked', 1, 'Account and session revocation must be verified separately before reassignment.');
  add('data_rights_review', snapshot.contacts.length + snapshot.discoveryLeads.length,
    'Confirm firm ownership, consent, and provider redistribution rights. Bring-your-own ZoomInfo data is not automatically transferable.');
  add('apply_not_implemented', 1, 'This increment is preview-only. A separately authorized, transactional transfer and audited rollback are required.');
  const fingerprint = digest({version: REASSIGNMENT_PREVIEW_VERSION, actorUid: actor.uid,
    sourceUid, targetUid, team: grant.team, source, target,
    snapshot: Object.fromEntries(collections.map(key => [key, sorted(snapshot[key])]))});
  return {
    version: REASSIGNMENT_PREVIEW_VERSION, mode: 'preview_only', can_execute: false,
    source_uid: sourceUid, target_uid: targetUid, team: grant.team, fingerprint,
    counts: Object.fromEntries(collections.map(key => [key, snapshot[key].length])),
    proposed_record_ids: {contacts: [...contacts].sort(), lists: [...lists].sort(), discovery_leads: [...leads].sort()},
    identity_collisions: collisions, blockers: issues,
    preservation_requirements: [
      'Preserve stable record IDs, notes, follow-up dates, source evidence, and conflict history.',
      'Keep do-not-contact restrictions, tombstones, rest periods, and shared touch limits in force.',
      'Retain activity authors and original cost/credit/acquisition ledger attribution.',
      'Preserve linked research and contact history without transferring credentials or provider budgets.',
      'Recheck authoritative membership, access, inventory, and conflicts inside the eventual transaction.',
      'Do not treat this fingerprint as authorization, a signed token, or a commit API.'
    ]
  };
}
