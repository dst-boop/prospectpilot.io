import {createHash, randomUUID} from 'node:crypto';

// ISOLATED CONTRACT ONLY. No production adapter, migration or HTTP route exists.
// All adapters are application-owned code, never supplied by a request body.
export const REASSIGNMENT_EXECUTION_VERSION = 'advisor-reassignment-execution-1';
export const REASSIGNMENT_PRESERVED_COLLECTIONS = Object.freeze([
  'recipientIdentity', 'relationships', 'shares', 'suppressions', 'tombstones',
  'restPeriods', 'touchLimits', 'jobs', 'schedules', 'imports', 'acquisitions',
  'costs', 'privacy', 'networking', 'serviceOwnership', 'providerRights'
]);
const kinds = new Set(['contact', 'list', 'lead']);
const terminalJobs = new Set(['completed', 'failed', 'skipped', 'done', 'stopped', 'cancelled']);
const roles = new Set(['owner', 'supervisor', 'advisor']);
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160 &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (status, code, message) => Object.assign(new Error(message), {status, code});
const conflict = () => fail(409, 'reassignment_conflict', 'Reassignment requires a new authoritative review.');
const denied = () => fail(403, 'reassignment_denied', 'Reassignment is not authorized.');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const clone = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => digest(left) === digest(right);
const ordered = rows => rows.slice().sort((a, b) => {
  const left=JSON.stringify(canonical(a)), right=JSON.stringify(canonical(b));
  return left < right ? -1 : left > right ? 1 : 0;
});
const scopeOf = request => ({firmId:request.firmId, actorUid:request.actorUid, sourceUid:request.sourceUid, targetUid:request.targetUid});
const normalizeSnapshot = snapshot => ({...snapshot, members:ordered(snapshot.members), records:ordered(snapshot.records), jobs:ordered(snapshot.jobs)});
const snapshotDigest = (snapshot, request) => digest({version:REASSIGNMENT_EXECUTION_VERSION, ...scopeOf(request), snapshot:normalizeSnapshot(snapshot)});

function validateRequest(input) {
  const fields = ['firmId','actorUid','sourceUid','targetUid','idempotencyKey','expectedFingerprint'];
  if (!input || Object.keys(input).some(key => !fields.includes(key)) ||
      fields.slice(0,5).some(key => !identifier(input[key])) || !hash(input.expectedFingerprint) || input.sourceUid === input.targetUid)
    throw fail(422, 'invalid_reassignment', 'Provide the exact reviewed reassignment and an idempotency key.');
  return freeze(Object.fromEntries(fields.map(key => [key,input[key]])));
}

function validateGrant(grant, request) {
  if (grant?.approved !== true || grant.scope !== 'advisor-reassignment-execute' ||
      Object.entries(scopeOf(request)).some(([key,value]) => grant[key] !== value)) throw denied();
}

function validateSnapshot(snapshot, request, phase = 'before') {
  if (!snapshot || snapshot.contract !== REASSIGNMENT_EXECUTION_VERSION || snapshot.complete !== true ||
      snapshot.scope?.firmId !== request.firmId || snapshot.scope?.sourceUid !== request.sourceUid ||
      snapshot.scope?.targetUid !== request.targetUid || !identifier(snapshot.scope?.version)) throw conflict();
  if (snapshot.firm?.id !== request.firmId || snapshot.firm.status !== 'active' || !identifier(snapshot.firm.version)) throw denied();
  if (!Array.isArray(snapshot.members) || snapshot.members.length > 3 || snapshot.members.some(member => !member ||
      !identifier(member.uid) || member.firmId !== request.firmId || !roles.has(member.role) || !identifier(member.version)) ||
      new Set(snapshot.members.map(member => member.uid)).size !== snapshot.members.length) throw denied();
  const members = new Map(snapshot.members.map(member => [member.uid,member]));
  const actor = members.get(request.actorUid), source = members.get(request.sourceUid), target = members.get(request.targetUid);
  if (actor?.status !== 'active' || !['owner','supervisor'].includes(actor.role) || source?.status !== 'departed' || target?.status !== 'active') throw denied();
  if (snapshot.access?.sourceUid !== request.sourceUid || snapshot.access?.targetUid !== request.targetUid ||
      snapshot.access?.sourceFenced !== true || snapshot.access?.sessionsRevoked !== true ||
      snapshot.access?.workersFenced !== true || snapshot.access?.targetActive !== true ||
      snapshot.access?.targetEmailVerified !== true || !identifier(snapshot.access?.version)) throw conflict();
  if (!snapshot.preserved || Object.keys(snapshot.preserved).length !== REASSIGNMENT_PRESERVED_COLLECTIONS.length ||
      REASSIGNMENT_PRESERVED_COLLECTIONS.some(key => {
        const manifest = snapshot.preserved[key];
        return !manifest || manifest.authoritative !== true || !identifier(manifest.version) || !hash(manifest.digest) ||
          !Number.isSafeInteger(manifest.count) || manifest.count < 0;
      })) throw conflict();
  if (!Array.isArray(snapshot.records) || !snapshot.records.length || snapshot.records.length > 1000 || snapshot.records.some(row => !row ||
      !kinds.has(row.kind) || !identifier(row.id) || row.firmId !== request.firmId ||
      row.advisorUid !== (phase === 'before' ? request.sourceUid : request.targetUid) || !identifier(row.version) || !hash(row.contentDigest) ||
      row.rights?.decision !== 'allowed' || row.rights?.firmId !== request.firmId || row.rights?.sourceUid !== request.sourceUid ||
      row.rights?.targetUid !== request.targetUid || !identifier(row.rights?.version) || !hash(row.rights?.referenceDigest)) ||
      new Set(snapshot.records.map(row => `${row.kind}:${row.id}`)).size !== snapshot.records.length) throw conflict();
  if (!Array.isArray(snapshot.jobs) || snapshot.jobs.length > 1000 || snapshot.jobs.some(job => !job || !identifier(job.id) ||
      !identifier(job.version) || !terminalJobs.has(job.status) || job.firmId !== request.firmId || !hash(job.digest)) ||
      new Set(snapshot.jobs.map(job => job.id)).size !== snapshot.jobs.length || snapshot.preserved.jobs.count !== snapshot.jobs.length) throw conflict();
  if (snapshot.review?.identityCollisions !== 0 || snapshot.review?.unresolvedIdentities !== 0 ||
      snapshot.review?.externalReferences !== 0 || snapshot.review?.unreviewedShares !== 0 ||
      snapshot.review?.serviceContinuity !== 'approved' || !identifier(snapshot.review?.version)) throw conflict();
  return snapshot;
}

function copySnapshot(value, request, phase) {
  // Bounded JSON metadata only. Payload edits must participate through contentDigest
  // and protected-collection manifests, not by copying private payloads here.
  let encoded;
  try { encoded = JSON.stringify(value); } catch { throw conflict(); }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > 2_000_000) throw conflict();
  let snapshot;
  try { snapshot = JSON.parse(encoded); } catch { throw conflict(); }
  // Bound recursion before hashing/freezing arbitrary adapter output.
  const queue = [[snapshot,0]];
  while (queue.length) {
    const [node,depth] = queue.pop();
    if (depth > 12) throw conflict();
    if (node && typeof node === 'object') for (const child of Object.values(node)) queue.push([child,depth+1]);
  }
  return freeze(validateSnapshot(snapshot,request,phase));
}

// For a future authoritative preview adapter only. Neither this digest nor
// complete:true grants authorization or makes the existing metadata loader usable.
export function fingerprintReassignmentSnapshot(snapshot, scope) {
  if (!scope || ['firmId','actorUid','sourceUid','targetUid'].some(key => !identifier(scope[key])) || scope.sourceUid === scope.targetUid) throw conflict();
  return snapshotDigest(copySnapshot(snapshot,scope,'before'),scope);
}

function verifyAfter(before, after, request) {
  if (after.scope.version === before.scope.version) throw conflict();
  const changes = [];
  const expected = clone(before);
  expected.scope.version = after.scope.version;
  const current = new Map(after.records.map(row => [`${row.kind}:${row.id}`,row]));
  for (const row of expected.records) {
    const next = current.get(`${row.kind}:${row.id}`);
    if (!next || next.version === row.version) throw conflict();
    changes.push({kind:row.kind,id:row.id,beforeVersion:row.version,afterVersion:next.version});
    row.advisorUid = request.targetUid;
    row.version = next.version;
  }
  // Exactly owner + assignment versions + scope version may change. Protection
  // manifests, payload digests, authors, rights, jobs and membership must not.
  if (!same(normalizeSnapshot(expected),normalizeSnapshot(after))) throw conflict();
  return ordered(changes);
}

const receiptKey = request => ({firmId:request.firmId,actorUid:request.actorUid,idempotencyKey:request.idempotencyKey});
function validateReceipt(receipt, request, requestHash) {
  const fields = ['version','status','firmId','actorUid','idempotencyKey','sourceUid','targetUid','transferId',
    'requestHash','beforeFingerprint','afterFingerprint','preservedFingerprint','recordCount','changes','recordedAt'];
  if (!receipt || Object.keys(receipt).length !== fields.length || Object.keys(receipt).some(key => !fields.includes(key)) || receipt.version !== REASSIGNMENT_EXECUTION_VERSION || receipt.status !== 'applied' ||
      receipt.requestHash !== requestHash || Object.entries({...receiptKey(request),sourceUid:request.sourceUid,targetUid:request.targetUid}).some(([key,value]) => receipt[key] !== value) ||
      !identifier(receipt.transferId) || !hash(receipt.beforeFingerprint) || !hash(receipt.afterFingerprint) ||
      receipt.beforeFingerprint !== request.expectedFingerprint || !hash(receipt.preservedFingerprint) ||
      !Number.isSafeInteger(receipt.recordCount) || receipt.recordCount < 1 || receipt.recordCount > 1000 ||
      !Array.isArray(receipt.changes) || receipt.changes.length !== receipt.recordCount ||
      receipt.changes.some(row => !row || Object.keys(row).length !== 4 || Object.keys(row).some(key => !['kind','id','beforeVersion','afterVersion'].includes(key)) || !kinds.has(row.kind) || !identifier(row.id) || !identifier(row.beforeVersion) ||
        !identifier(row.afterVersion) || row.beforeVersion === row.afterVersion) ||
      new Set(receipt.changes.map(row => `${row.kind}:${row.id}`)).size !== receipt.recordCount ||
      typeof receipt.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.recordedAt) || !Number.isFinite(Date.parse(receipt.recordedAt))) throw conflict();
  return freeze(clone(receipt));
}

/**
 * Reusable transaction orchestrator. Not configured by any live service.
 * The reviewed adapter must lock authorization, predicate/inventory scope,
 * recipient collisions and every protected manifest on THIS client; all writers
 * must honor the same durable fence and monotonic versions. Never pass a pool
 * into an adapter or perform provider/auth mutations during this transaction.
 *
 * Receipt storage needs a unique (firmId, actorUid, idempotencyKey) key and
 * append-only permissions. Any CAS/verification/audit failure rolls back.
 */
export function createReassignmentExecutionService({pool, adapter} = {}) {
  const methods = ['authorizeAndLock','findReceipt','loadAndLockSnapshot','compareAndSwap','insertReceipt'];
  if (typeof pool?.connect !== 'function' || methods.some(key => typeof adapter?.[key] !== 'function'))
    throw fail(503, 'reassignment_unconfigured', 'Reassignment execution is not configured.');
  return async input => {
    const request = validateRequest(input), requestHash = digest({version:REASSIGNMENT_EXECUTION_VERSION,...request});
    let client, began = false, commitAttempted = false, discard = false;
    try {
      client = await pool.connect();
      began = true;
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      const settings = (await client.query("SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS read_only")).rows;
      if (settings.length !== 1 || settings[0].isolation !== 'serializable' || settings[0].read_only !== 'off') throw conflict();
      // Authorize before reading receipts or inventory, including replay requests.
      validateGrant(await adapter.authorizeAndLock(client,request),request);
      const prior = await adapter.findReceipt(client,receiptKey(request));
      let receipt, replayed = false, finalVerification = null;
      if (prior !== null) {
        receipt = validateReceipt(prior,request,requestHash);
        replayed = true;
      } else {
        const before = copySnapshot(await adapter.loadAndLockSnapshot(client,request,{phase:'before'}),request,'before');
        const beforeFingerprint = snapshotDigest(before,request);
        if (beforeFingerprint !== request.expectedFingerprint) throw conflict();
        const expectations = freeze({scopeVersion:before.scope.version,beforeFingerprint,
          records:before.records.map(row => ({kind:row.kind,id:row.id,firmId:row.firmId,advisorUid:row.advisorUid,version:row.version,rightsVersion:row.rights.version})),
          preservedFingerprint:digest(before.preserved)});
        const changed = await adapter.compareAndSwap(client,request,expectations);
        if (changed !== before.records.length) throw conflict();
        const after = copySnapshot(await adapter.loadAndLockSnapshot(client,request,{phase:'after',records:expectations.records}),request,'after');
        const changes = verifyAfter(before,after,request);
        finalVerification = {fingerprint:snapshotDigest(after,request),records:expectations.records};
        receipt = freeze({version:REASSIGNMENT_EXECUTION_VERSION,status:'applied',...receiptKey(request),
          sourceUid:request.sourceUid,targetUid:request.targetUid,transferId:randomUUID(),requestHash,
          beforeFingerprint,afterFingerprint:snapshotDigest(after,request),preservedFingerprint:expectations.preservedFingerprint,
          recordCount:changes.length,changes,recordedAt:new Date().toISOString()});
        if (await adapter.insertReceipt(client,receipt) !== 1) throw conflict();
        const saved = validateReceipt(await adapter.findReceipt(client,receiptKey(request)),request,requestHash);
        if (!same(saved,receipt)) throw conflict();
      }
      // Same client and locked authority, including replay. The adapter cannot
      // substitute this for session verification or durable access fencing.
      validateGrant(await adapter.authorizeAndLock(client,request),request);
      if (finalVerification) {
        // Receipt insertion may invoke triggers. Recheck the pinned inventory
        // after the final write and authorization, not only immediately after CAS.
        const finalSnapshot = copySnapshot(await adapter.loadAndLockSnapshot(client,request,
          {phase:'after',records:finalVerification.records}),request,'after');
        if (snapshotDigest(finalSnapshot,request) !== finalVerification.fingerprint) throw conflict();
      }
      commitAttempted = true;
      await client.query('COMMIT');
      began = false;
      return {receipt,replayed};
    } catch (error) {
      if (commitAttempted) {
        discard = true;
        // A lost COMMIT acknowledgement may already have committed. Do not claim
        // rollback or retry under a new key; reconcile via the same scoped key.
        throw fail(503,'reassignment_outcome_unknown','Reassignment outcome is unknown. Reconcile using the same idempotency key.');
      }
      if (began) { try { await client.query('ROLLBACK'); } catch { discard = true; } }
      if (['40001','40P01','55P03','23505'].includes(error?.code)) throw conflict();
      if (error?.code === 'reassignment_conflict') throw conflict();
      if (error?.code === 'reassignment_denied') throw denied();
      throw fail(503,'reassignment_unavailable','Reassignment execution could not be verified.');
    } finally {
      // Pool cleanup must not replace a confirmed commit or a sanitized failure
      // with raw driver details. The pool is responsible for eviction on error.
      if (client) { try { client.release(discard ? new Error('Discard reassignment connection.') : undefined); } catch {} }
    }
  };
}
