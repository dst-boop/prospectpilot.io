import {createHash} from 'node:crypto';

// Preview only: no database writer, provider client, transfer grant or live adapter.
// The loader must resolve firm membership, explicit record assignments and
// per-recipient provider rights from authoritative storage at one read point.
const id = v => typeof v === 'string' && v.length > 0 && v.length <= 160 && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const integer = v => Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000;
const fail = (status, message) => Object.assign(new Error(message), {status});
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const requireValid = condition => { if (!condition) throw fail(409, 'Distribution inventory requires a new authoritative review.'); };
const holdCodes = new Set(['dnc','consent','identity','privacy','provider','service_continuity','contact_review']);
export const DISTRIBUTION_PLAN_VERSION = 'firm-distribution-preview-1';

export function createTeamDistributionPlanner({firmId, authorize, loadSnapshot} = {}) {
  if (!id(firmId) || typeof authorize !== 'function' || typeof loadSnapshot !== 'function') throw fail(503, 'Distribution preview is not configured.');
  return async (input, actor, authorizedFirmId = firmId) => {
    if (authorizedFirmId !== firmId) throw fail(403, 'Distribution preview is outside the authorized team.');
    if (!id(actor?.uid)) throw fail(401, 'Sign in to preview distribution.');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 2 ||
        !id(input.source_uid) || !Array.isArray(input.recipient_uids) || input.recipient_uids.length < 1 || input.recipient_uids.length > 100 ||
        input.recipient_uids.some(uid => !id(uid) || uid === input.source_uid) || new Set(input.recipient_uids).size !== input.recipient_uids.length)
      throw fail(422, 'Choose a departed advisor and distinct recipients.');
    const scope = Object.freeze({firmId, actorUid:actor.uid, sourceUid:input.source_uid, recipientUids:Object.freeze([...input.recipient_uids].sort(order))});
    const check = async () => {
      const grant = await authorize(scope);
      if (grant?.approved !== true || grant.scope !== DISTRIBUTION_PLAN_VERSION || grant.firmId !== firmId || grant.actorUid !== scope.actorUid ||
          grant.sourceUid !== scope.sourceUid || !Array.isArray(grant.recipientUids) || JSON.stringify(grant.recipientUids) !== JSON.stringify(scope.recipientUids))
        throw fail(403, 'Distribution preview is not authorized.');
    };
    await check(); // Before any inventory read; roles/domains in request are never trusted.
    const raw = await loadSnapshot(scope);
    let encoded; try { encoded = JSON.stringify(raw); } catch { requireValid(false); }
    requireValid(typeof encoded === 'string' && Buffer.byteLength(encoded) <= 1_000_000);
    let s = JSON.parse(encoded);
    requireValid(s?.complete === true && s.firmId === firmId && id(s.version) && iso(s.asOf) &&
      s.source?.uid === scope.sourceUid && s.source.firmId === firmId && s.source.status === 'departed');
    requireValid(Array.isArray(s.recipients) && s.recipients.length === scope.recipientUids.length && new Set(s.recipients.map(r => r?.uid)).size === s.recipients.length);
    for (const r of s.recipients) requireValid(r && scope.recipientUids.includes(r.uid) && r.firmId === firmId && r.status === 'active' &&
      r.emailVerified === true && r.disabled === false && id(r.version) && integer(r.activeAssignments) && integer(r.capacity));
    requireValid(Array.isArray(s.leads) && s.leads.length <= 1000 && new Set(s.leads.map(l => l?.id)).size === s.leads.length);
    for (const l of s.leads) {
      requireValid(l && id(l.id) && id(l.version) && l.firmId === firmId && l.advisorUid === scope.sourceUid &&
        (l.followUpAt === null || iso(l.followUpAt)) && Array.isArray(l.holds) && l.holds.length <= holdCodes.size &&
        l.holds.every(h => holdCodes.has(h)) && new Set(l.holds).size === l.holds.length &&
        Array.isArray(l.recipientRights) && l.recipientRights.length === scope.recipientUids.length &&
        new Set(l.recipientRights.map(r => r?.uid)).size === l.recipientRights.length);
      for (const r of l.recipientRights) requireValid(r && scope.recipientUids.includes(r.uid) && ['allowed','denied','review'].includes(r.decision) && id(r.version));
    }
    // Keep only bounded, validated metadata. No customer payloads or extra adapter
    // fields participate in output/fingerprinting or recursive canonicalization.
    s = {complete:true, firmId, version:s.version, asOf:s.asOf,
      source:{uid:s.source.uid,firmId,status:s.source.status},
      recipients:s.recipients.map(r => ({uid:r.uid,firmId,status:r.status,emailVerified:r.emailVerified,disabled:r.disabled,version:r.version,activeAssignments:r.activeAssignments,capacity:r.capacity})),
      leads:s.leads.map(l => ({id:l.id,version:l.version,firmId,advisorUid:l.advisorUid,followUpAt:l.followUpAt,holds:l.holds,
        recipientRights:l.recipientRights.map(r => ({uid:r.uid,decision:r.decision,version:r.version}))}))};
    // Snapshot arrays may arrive unordered. Stable results do not depend on SQL order.
    s.recipients.sort((a,b) => order(a.uid,b.uid));
    s.leads.sort((a,b) => a.followUpAt === b.followUpAt ? order(a.id,b.id) : a.followUpAt === null ? 1 : b.followUpAt === null ? -1 : order(a.followUpAt,b.followUpAt));
    const loads = new Map(s.recipients.map(r => [r.uid, r.activeAssignments]));
    const assigned = new Map(), held = [];
    const allowedFor = lead => s.recipients.filter(r => lead.recipientRights.some(right => right.uid === r.uid && right.decision === 'allowed'));
    const move = (lead, recipient) => {
      const prior = assigned.get(lead.id);
      if (prior) loads.set(prior, loads.get(prior) - 1);
      assigned.set(lead.id, recipient.uid); loads.set(recipient.uid, loads.get(recipient.uid) + 1);
    };
    function place(lead, visited = new Set()) {
      const candidates = allowedFor(lead).filter(r => r.capacity > 0 && !visited.has(r.uid));
      candidates.sort((a,b) => loads.get(a.uid) * b.capacity - loads.get(b.uid) * a.capacity || order(a.uid,b.uid));
      const free = candidates.find(r => loads.get(r.uid) < r.capacity);
      if (free) { move(lead,free); return true; }
      // Augmenting path: relocate an already planned lead without dropping it.
      // This prevents flexible early leads stranding later restricted leads.
      // Existing assignments outside this preview are NEVER moved.
      for (const recipient of candidates) {
        visited.add(recipient.uid);
        for (const previous of [...s.leads].reverse().filter(l => assigned.get(l.id) === recipient.uid)) {
          if (place(previous,visited)) { move(lead,recipient); return true; }
        }
      }
      return false;
    }
    for (const lead of s.leads) {
      if (!place(lead)) held.push({leadId:lead.id,reason:allowedFor(lead).length ? 'capacity' : 'recipient_rights_review'});
    }
    const assignments = s.leads.filter(lead => assigned.has(lead.id)).map(lead => ({
      leadId:lead.id,recipientUid:assigned.get(lead.id),leadVersion:lead.version,
      followUpAt:lead.followUpAt,overdue:lead.followUpAt !== null && lead.followUpAt < s.asOf,
      preservedHolds:[...lead.holds].sort(order),outreachAuthorized:false}));
    await check(); // Revocation during loading/planning prevents returning inventory.
    return {version:DISTRIBUTION_PLAN_VERSION, mode:'preview_only', can_execute:false, firmId, sourceUid:scope.sourceUid,
      asOf:s.asOf, snapshotVersion:s.version, fingerprint:hash({scope,snapshot:{...s,leads:s.leads.map(l => ({...l,holds:[...l.holds].sort(order),recipientRights:[...l.recipientRights].sort((a,b)=>order(a.uid,b.uid))}))}}),
      assignments, held, recipients:s.recipients.map(r => ({uid:r.uid,initial:r.activeAssignments,proposed:loads.get(r.uid),capacity:r.capacity})),
      counts:{total:s.leads.length,planned:assignments.length,held:held.length},
      executionRequirements:['authoritative_transfer_review','source_access_and_worker_fence','fresh_snapshot_and_rights','atomic_audited_transfer']};
  };
}
