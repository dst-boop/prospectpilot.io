// Synthetic disposable test storage only. This is deliberately NOT an adapter
// for legacy ProspectPilot tables and cannot prove their ownership or scope.
import {createHash} from 'node:crypto';
import {REASSIGNMENT_EXECUTION_VERSION, REASSIGNMENT_PRESERVED_COLLECTIONS,
  fingerprintReassignmentSnapshot} from '../../advisor-reassignment-execution.mjs';
export const syntheticDigest = value => createHash('sha256').update(value).digest('hex');
export const scope = {firmId:'firm-a',actorUid:'supervisor',sourceUid:'source',targetUid:'target'};
export function syntheticSnapshot() {
  return {
    contract:REASSIGNMENT_EXECUTION_VERSION,complete:true,scope:{...scope,version:'scope-1'},
    firm:{id:'firm-a',status:'active',version:'firm-1'},
    members:[{uid:'supervisor',role:'supervisor',status:'active'}, {uid:'source',role:'advisor',status:'departed'},
      {uid:'target',role:'advisor',status:'active'}].map(row => ({...row,firmId:'firm-a',version:'member-1'})),
    access:{sourceUid:'source',targetUid:'target',sourceFenced:true,sessionsRevoked:true,workersFenced:true,
      targetActive:true,targetEmailVerified:true,version:'access-1'},
    preserved:Object.fromEntries(REASSIGNMENT_PRESERVED_COLLECTIONS.map(key => [key,{authoritative:true,version:'manifest-1',digest:syntheticDigest(key),count:1}])),
    records:['contact','list','lead'].map(kind => ({kind,id:kind+'-one',firmId:'firm-a',advisorUid:'source',version:'record-1',
      contentDigest:syntheticDigest('notes and historical author '+kind),
      rights:{decision:'allowed',firmId:'firm-a',sourceUid:'source',targetUid:'target',version:'rights-1',referenceDigest:syntheticDigest('synthetic explicit license')}})),
    jobs:[{id:'job-one',firmId:'firm-a',version:'job-1',status:'completed',digest:syntheticDigest('original job owner and cost')}],
    review:{identityCollisions:0,unresolvedIdentities:0,externalReferences:0,unreviewedShares:0,serviceContinuity:'approved',version:'review-1'}
  };
}
export const requestFor = (snapshot = syntheticSnapshot(), overrides = {}) => ({...scope,
  idempotencyKey:'synthetic-transfer-one',expectedFingerprint:fingerprintReassignmentSnapshot(snapshot,scope),...overrides});
export const fixtureSchema = `CREATE TABLE reassignment_fixture_state (firm_id TEXT PRIMARY KEY, snapshot JSONB NOT NULL);
  CREATE TABLE reassignment_fixture_receipts (firm_id TEXT NOT NULL, actor_uid TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    receipt JSONB NOT NULL, PRIMARY KEY(firm_id,actor_uid,idempotency_key));`;
export async function seedFixture(query, snapshot = syntheticSnapshot()) {
  await query('INSERT INTO reassignment_fixture_state(firm_id,snapshot) VALUES ($1,$2)', ['firm-a',snapshot]);
  await query('INSERT INTO reassignment_fixture_state(firm_id,snapshot) VALUES ($1,$2)', ['firm-b',{private:'OTHER FIRM UNCHANGED'}]);
}
export function syntheticAdapter(options = {}) {
  const calls = [];
  const read = async (client,request) => (await client.query('SELECT snapshot FROM reassignment_fixture_state WHERE firm_id=$1 FOR UPDATE',[request.firmId])).rows[0]?.snapshot;
  return {calls,
    authorizeAndLock:async (client,request) => {
      calls.push('authorize');
      const snapshot = await read(client,request);
      if (options.deny || !snapshot || snapshot.firm?.status !== 'active' || snapshot.scope.sourceUid !== request.sourceUid || snapshot.scope.targetUid !== request.targetUid ||
          !snapshot.members.some(row => row.uid === request.actorUid && row.firmId === request.firmId && row.status === 'active' && ['owner','supervisor'].includes(row.role)) ||
          !snapshot.members.some(row => row.uid === request.sourceUid && row.firmId === request.firmId && row.status === 'departed') ||
          !snapshot.members.some(row => row.uid === request.targetUid && row.firmId === request.firmId && row.status === 'active')) return {approved:false};
      return {approved:true,scope:'advisor-reassignment-execute',...scope,...options.grant};
    },
    findReceipt:async (client,key) => {
      calls.push('receipt');
      return (await client.query('SELECT receipt FROM reassignment_fixture_receipts WHERE firm_id=$1 AND actor_uid=$2 AND idempotency_key=$3',
        [key.firmId,key.actorUid,key.idempotencyKey])).rows[0]?.receipt ?? null;
    },
    loadAndLockSnapshot:async (client,request,{phase}) => {
      calls.push(phase);
      const snapshot = await read(client,request);
      if (phase === 'before' && options.changeBefore) options.changeBefore(snapshot);
      return snapshot;
    },
    compareAndSwap:async (client,request,expected) => {
      calls.push('cas');
      if (options.beforeCas) await options.beforeCas(client,request,expected);
      const snapshot = await read(client,request);
      if (snapshot.scope.version !== expected.scopeVersion || fingerprintReassignmentSnapshot(snapshot,request) !== expected.beforeFingerprint) return 0;
      snapshot.scope.version = 'scope-2';
      for (const row of snapshot.records) { row.advisorUid = request.targetUid; row.version = 'record-2'; }
      if (options.mutateAfter) options.mutateAfter(snapshot);
      const result = await client.query(`UPDATE reassignment_fixture_state SET snapshot=$1 WHERE firm_id=$2 AND snapshot #>> '{scope,version}'=$3`,
        [snapshot,request.firmId,expected.scopeVersion]);
      return options.casCount ?? (result.rowCount ?? result.affectedRows) * snapshot.records.length;
    },
    insertReceipt:async (client,receipt) => {
      calls.push('audit');
      if (options.auditFailure) throw Error('private SQL details must not escape');
      const result = await client.query('INSERT INTO reassignment_fixture_receipts(firm_id,actor_uid,idempotency_key,receipt) VALUES ($1,$2,$3,$4)',
        [receipt.firmId,receipt.actorUid,receipt.idempotencyKey,options.alterReceipt ? options.alterReceipt(receipt) : receipt]);
      if (options.afterAudit) await options.afterAudit(client,receipt);
      return result.rowCount ?? result.affectedRows;
    }
  };
}

// PGlite has one connection. This test-only queue prevents interleaved BEGINs;
// it is not claimed to exercise multi-session PostgreSQL concurrency.
export function pglitePool(db, options = {}) {
  let tail = Promise.resolve();
  const queries = [], releases = [];
  return {queries,releases,connect:async () => {
    const ready = tail;
    let unlock;
    tail = new Promise(resolve => { unlock=resolve; });
    await ready;
    return {query:async(sql,args) => {
      queries.push(sql);
      if (options.rollbackFailure && sql === 'ROLLBACK') throw Error('rollback failed');
      const result = await db.query(sql,args);
      if (options.downgrade && sql.startsWith('SELECT current_setting')) return {rows:[{isolation:'read committed',read_only:'off'}]};
      if (options.commitLost && sql === 'COMMIT') throw Error('commit response lost');
      return result;
    },release:error => { releases.push(error); unlock(); }};
  }};
}
