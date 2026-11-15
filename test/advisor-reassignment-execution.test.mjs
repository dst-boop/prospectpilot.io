import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createReassignmentExecutionService, fingerprintReassignmentSnapshot, REASSIGNMENT_PRESERVED_COLLECTIONS} from '../advisor-reassignment-execution.mjs';
import {syntheticSnapshot,syntheticDigest,scope,requestFor,fixtureSchema,seedFixture,syntheticAdapter,pglitePool} from './fixtures/reassignment-execution-fixture.mjs';
let db;
before(async()=>{db=new PGlite();await db.exec(fixtureSchema);});
after(async()=>{await db.close();});
beforeEach(async()=>{await db.exec('TRUNCATE reassignment_fixture_state,reassignment_fixture_receipts');await seedFixture(db.query.bind(db));});
const readState = async () => (await db.query('SELECT snapshot FROM reassignment_fixture_state ORDER BY firm_id')).rows;
const receipts = async () => (await db.query('SELECT receipt FROM reassignment_fixture_receipts')).rows;
const setup = (options={},poolOptions={}) => { const adapter=syntheticAdapter(options),pool=pglitePool(db,poolOptions);return {adapter,pool,execute:createReassignmentExecutionService({pool,adapter})}; };
const changeStored = async mutate => {const snapshot=syntheticSnapshot();mutate(snapshot);await db.query('UPDATE reassignment_fixture_state SET snapshot=$1 WHERE firm_id=$2',[snapshot,'firm-a']);};

async function refusedWithoutChanges(options={}, request=requestFor(), poolOptions={}) {
  const before=await readState(), fixture=setup(options,poolOptions);
  await assert.rejects(fixture.execute(request));
  assert.deepEqual(await readState(),before);assert.deepEqual(await receipts(),[]);
  return fixture;
}

test('atomic synthetic apply changes only assignments and writes one minimized receipt',async()=>{
  const before=await readState(),{execute,adapter,pool}=setup();
  const result=await execute(requestFor());
  assert.equal(result.replayed,false);assert.equal(result.receipt.recordCount,3);
  const after=await readState();
  assert.deepEqual(after[0].snapshot.preserved,before[0].snapshot.preserved);
  assert.deepEqual(after[0].snapshot.jobs,before[0].snapshot.jobs);
  assert.deepEqual(after[1],before[1]);
  for (const row of after[0].snapshot.records) {assert.equal(row.advisorUid,'target');assert.equal(row.version,'record-2');}
  assert.equal((await receipts()).length,1);
  assert.deepEqual(adapter.calls,['authorize','receipt','before','cas','after','audit','receipt','authorize','after']);
  assert.equal(pool.queries[0],'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
  assert.equal(pool.queries.at(-1),'COMMIT');assert.deepEqual(pool.releases,[undefined]);
  const output=JSON.stringify(result);assert.ok(!output.includes('synthetic explicit license'));assert.ok(!output.includes('OTHER FIRM'));
});

test('same key replays the original receipt without snapshot, mutation or duplicate audit',async()=>{
  const {execute,adapter}=setup(),first=await execute(requestFor());adapter.calls.length=0;
  const again=await execute(requestFor());assert.equal(again.replayed,true);assert.deepEqual(again.receipt,first.receipt);
  assert.deepEqual(adapter.calls,['authorize','receipt','authorize']);assert.equal((await receipts()).length,1);
});

test('idempotency key cannot be reused with a different reviewed request',async()=>{
  const {execute}=setup();await execute(requestFor());const state=await readState();
  await assert.rejects(execute({...requestFor(),expectedFingerprint:syntheticDigest('different')}),{status:409});
  assert.deepEqual(await readState(),state);assert.equal((await receipts()).length,1);
});

test('replay requires current authorization and never exposes another firm receipt',async()=>{
  await setup().execute(requestFor());
  for(const request of [{...requestFor(),actorUid:'source'},{...requestFor(),firmId:'firm-b'}]){
    const {execute,adapter}=setup();await assert.rejects(execute(request),{status:403});assert.deepEqual(adapter.calls,['authorize']);
  }
});

test('concurrent same-key calls in the single-connection fixture yield one apply and one replay',async()=>{
  const {execute}=setup();const results=await Promise.all([execute(requestFor()),execute(requestFor())]);
  assert.deepEqual(results.map(result=>result.replayed),[false,true]);assert.equal((await receipts()).length,1);
});

test('a competing stale review with a new key cannot transfer again',async()=>{
  const {execute}=setup();const results=await Promise.allSettled([execute(requestFor()),execute({...requestFor(),idempotencyKey:'another-key'})]);
  assert.deepEqual(results.map(result=>result.status),['fulfilled','rejected']);assert.equal((await receipts()).length,1);
});

test('missing configuration and malformed requests fail before connecting',async()=>{
  for(const config of [{},{pool:{}},{pool:{connect(){}}}])assert.throws(()=>createReassignmentExecutionService(config),{status:503});
  const {execute,pool}=setup();
  for(const request of [null,{}, {...requestFor(),actorUid:''},{...requestFor(),sourceUid:'target'},
    {...requestFor(),expectedFingerprint:'preview-token'},{...requestFor(),role:'owner'}, {...requestFor(),idempotencyKey:'bad\nkey'}])
    await assert.rejects(execute(request),{status:422});
  assert.deepEqual(pool.queries,[]);
});

test('authorization precedes receipt and inventory reads; exact scope and pair cannot be substituted',async()=>{
  for(const grant of [{scope:'advisor-reassignment-preview'},{actorUid:'other'},{firmId:'legacy-team'},{sourceUid:'other'},{targetUid:'other'}]){
    const {adapter}=await refusedWithoutChanges({grant});assert.deepEqual(adapter.calls,['authorize']);
  }
});

const refusedSnapshots = [
  ['incomplete metadata snapshot',snapshot=>{snapshot.complete=false;}],
  ['legacy complete preview contract',snapshot=>{delete snapshot.contract;}],
  ['cross-firm snapshot',snapshot=>{snapshot.scope.firmId='firm-b';}],
  ['missing scope version',snapshot=>{delete snapshot.scope.version;}],
  ['suspended firm',snapshot=>{snapshot.firm.status='suspended';}],
  ['advisor self-authorizing',snapshot=>{snapshot.members[0].role='advisor';}],
  ['suspended actor',snapshot=>{snapshot.members[0].status='suspended';}],
  ['source not departed',snapshot=>{snapshot.members[1].status='active';}],
  ['target not active',snapshot=>{snapshot.members[2].status='suspended';}],
  ['cross-firm member',snapshot=>{snapshot.members[2].firmId='firm-b';}],
  ['unversioned member',snapshot=>{delete snapshot.members[2].version;}],
  ['duplicate membership',snapshot=>{snapshot.members[2]=snapshot.members[1];}],
  ['unfenced source',snapshot=>{snapshot.access.sourceFenced=false;}],
  ['unrevoked sessions',snapshot=>{snapshot.access.sessionsRevoked=false;}],
  ['unfenced jobs',snapshot=>{snapshot.access.workersFenced=false;}],
  ['inactive target account',snapshot=>{snapshot.access.targetActive=false;}],
  ['unverified target account',snapshot=>{snapshot.access.targetEmailVerified=false;}],
  ['wrong fenced account',snapshot=>{snapshot.access.sourceUid='someone-else';}],
  ['missing reviewed records',snapshot=>{snapshot.records=[];}],
  ['cross-owner record',snapshot=>{snapshot.records[0].advisorUid='private-owner';}],
  ['cross-firm record',snapshot=>{snapshot.records[0].firmId='firm-b';}],
  ['unversioned record',snapshot=>{delete snapshot.records[0].version;}],
  ['missing payload digest',snapshot=>{delete snapshot.records[0].contentDigest;}],
  ['duplicate record',snapshot=>{snapshot.records.push(snapshot.records[0]);}],
  ['unknown record kind',snapshot=>{snapshot.records[0].kind='private-directory';}],
  ['unreviewed provider rights',snapshot=>{snapshot.records[0].rights.decision='unknown';}],
  ['right not granted for receiver',snapshot=>{snapshot.records[0].rights.targetUid='other';}],
  ['unversioned rights',snapshot=>{delete snapshot.records[0].rights.version;}],
  ['paused resumable job',snapshot=>{snapshot.jobs[0].status='paused';}],
  ['running job',snapshot=>{snapshot.jobs[0].status='running';}],
  ['unknown job state',snapshot=>{snapshot.jobs[0].status='new-status';}],
  ['cross-firm job',snapshot=>{snapshot.jobs[0].firmId='firm-b';}],
  ['omitted job',snapshot=>{snapshot.jobs=[];}],
  ['identity collision',snapshot=>{snapshot.review.identityCollisions=1;}],
  ['unresolved recipient identity',snapshot=>{snapshot.review.unresolvedIdentities=1;}],
  ['cross-scope relation',snapshot=>{snapshot.review.externalReferences=1;}],
  ['unreviewed share',snapshot=>{snapshot.review.unreviewedShares=1;}],
  ['unverified serviced-account continuity',snapshot=>{snapshot.review.serviceContinuity='unknown';}],
  ['unversioned review',snapshot=>{delete snapshot.review.version;}]
];
for(const [name,mutate] of refusedSnapshots)test('refuses '+name+' before any write',async()=>{
  const {adapter}=await refusedWithoutChanges({changeBefore:mutate});assert.ok(!adapter.calls.includes('cas'));assert.ok(!adapter.calls.includes('audit'));
});
for(const key of REASSIGNMENT_PRESERVED_COLLECTIONS)test('refuses missing authoritative '+key+' coverage',async()=>{
  const {adapter}=await refusedWithoutChanges({changeBefore:snapshot=>{delete snapshot.preserved[key];}});assert.ok(!adapter.calls.includes('cas'));
});

test('payload-only, rights, membership and protection changes invalidate the review',async()=>{
  for(const mutate of [snapshot=>{snapshot.records[0].contentDigest=syntheticDigest('changed note');},
    snapshot=>{snapshot.records[0].rights.version='rights-2';},snapshot=>{snapshot.members[0].version='member-2';},
    snapshot=>{snapshot.preserved.suppressions.digest=syntheticDigest('new do not contact');}]) {
    const {adapter}=await refusedWithoutChanges({changeBefore:mutate});assert.ok(!adapter.calls.includes('cas'));
  }
});

test('fingerprint is stable under root ordering, actor-specific and never accepts incomplete snapshots',()=>{
  const snapshot=syntheticSnapshot(),first=fingerprintReassignmentSnapshot(snapshot,scope);
  snapshot.records.reverse();snapshot.members.reverse();assert.equal(fingerprintReassignmentSnapshot(snapshot,scope),first);
  assert.throws(()=>fingerprintReassignmentSnapshot({...snapshot,complete:false},scope),{status:409});
  assert.throws(()=>fingerprintReassignmentSnapshot(snapshot,{...scope,actorUid:'source'}),{status:403});
});

test('bounds oversized inventories, metadata and recursive envelopes',async()=>{
  for(const mutate of [snapshot=>{snapshot.records=Array.from({length:1001},(_,i)=>({...snapshot.records[0],id:'record-'+i}));},
    snapshot=>{snapshot.extra='x'.repeat(2_000_000);},snapshot=>{let node=snapshot;for(let i=0;i<14;i++){node.extra={};node=node.extra;}}])
    await refusedWithoutChanges({changeBefore:mutate});
});

for(const key of REASSIGNMENT_PRESERVED_COLLECTIONS)test('rolls back when '+key+' changes during apply',async()=>{
  const {pool}=await refusedWithoutChanges({mutateAfter:snapshot=>{snapshot.preserved[key].digest=syntheticDigest('unexpected mutation');}});
  assert.equal(pool.queries.at(-1),'ROLLBACK');
});
for(const [name,mutate] of [
  ['historical payload',snapshot=>{snapshot.records[0].contentDigest=syntheticDigest('overwritten notes');}],
  ['job owner or cost attribution',snapshot=>{snapshot.jobs[0].digest=syntheticDigest('changed cost');}],
  ['rights',snapshot=>{snapshot.records[0].rights.version='rights-2';}],
  ['member authority',snapshot=>{snapshot.members[0].version='member-2';}],
  ['record omitted',snapshot=>{snapshot.records.pop();}],
  ['scope version unchanged',snapshot=>{snapshot.scope.version='scope-1';}],
  ['record version unchanged',snapshot=>{snapshot.records[0].version='record-1';}],
  ['partially reassigned row',snapshot=>{snapshot.records[0].advisorUid='source';}]
])test('rolls back '+name+' mutation',async()=>{await refusedWithoutChanges({mutateAfter:mutate});});

test('CAS count mismatch and audit failure roll back all assignment writes',async()=>{
  for(const options of [{casCount:0},{casCount:2},{casCount:4},{auditFailure:true},{alterReceipt:receipt=>({...receipt,recordCount:4})}])
    await refusedWithoutChanges(options);
});

test('failure after audit insertion rolls back both the audit and assignments',async()=>{
  await refusedWithoutChanges({afterAudit:async()=>{throw Error('audit follow-up failure');}});
});

test('authorization loss during apply rolls back audit and assignments',async()=>{
  await refusedWithoutChanges({afterAudit:async client=>{await client.query(`UPDATE reassignment_fixture_state SET snapshot=jsonb_set(snapshot,'{members,0,status}','"suspended"') WHERE firm_id='firm-a'`);}});
});

test('database CAS predicate rejects drift even after the preflight snapshot',async()=>{
  await refusedWithoutChanges({beforeCas:async client=>{await client.query(`UPDATE reassignment_fixture_state SET snapshot=jsonb_set(snapshot,'{scope,version}','"scope-99"') WHERE firm_id='firm-a'`);}});
});

test('transaction downgrade refuses execution before authorization or receipt access',async()=>{
  const {adapter}=await refusedWithoutChanges({},requestFor(),{downgrade:true});assert.deepEqual(adapter.calls,[]);
});

test('lost commit acknowledgement reports uncertainty, discards client, then reconciles same key',async()=>{
  const {execute,pool}=setup({},{commitLost:true});
  await assert.rejects(execute(requestFor()),{status:503,code:'reassignment_outcome_unknown'});
  assert.equal((await receipts()).length,1);assert.ok(pool.releases[0] instanceof Error);assert.ok(!pool.queries.includes('ROLLBACK'));
  const recovered=await setup().execute(requestFor());assert.equal(recovered.replayed,true);assert.equal((await receipts()).length,1);
});

test('rollback failure discards the connection and never leaks adapter errors',async()=>{
  const {execute,pool}=setup({auditFailure:true},{rollbackFailure:true});
  await assert.rejects(execute(requestFor()),error=>error.status===503&&!error.message.includes('private SQL'));
  assert.ok(pool.releases[0] instanceof Error);
  // The synthetic DB shares one physical connection; explicitly clean it after
  // proving eviction was requested. A real pool must destroy this client.
  await db.query('ROLLBACK');assert.deepEqual(await receipts(),[]);
});

test('production snapshot, routes and migration registry remain disconnected from execution',()=>{
  const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const file of ['server.mjs','handler.mjs','team-lead-hub.mjs','migrate.mjs','firm-scoped-snapshot.mjs'])
    assert.ok(!read(file).includes('advisor-reassignment-execution'),file);
  assert.match(read('firm-scoped-snapshot.mjs'),/complete:\s*false/);
  assert.match(read('firm-scoped-snapshot.mjs'),/can_execute:\s*false/);
  assert.ok(!read('Dockerfile').split('AS runtime')[1].includes('advisor-reassignment-execution'));
});

test('replay refuses surplus receipt fields rather than exposing private data',async()=>{
  await setup().execute(requestFor());
  await db.query(`UPDATE reassignment_fixture_receipts SET receipt=receipt || '{"privatePayload":"must not escape"}'::jsonb`);
  await assert.rejects(setup().execute(requestFor()),{status:409});
});

test('fingerprints are deterministic for canonically equivalent Unicode IDs in any row order',()=>{
  const snapshot=syntheticSnapshot();snapshot.records[0].id='\u00e9';snapshot.records[1].kind='contact';snapshot.records[1].id='e\u0301';
  const first=fingerprintReassignmentSnapshot(snapshot,scope);snapshot.records.reverse();
  assert.equal(fingerprintReassignmentSnapshot(snapshot,scope),first);
});

test('execution module remains available to build tests but absent from runtime packaging',()=>{
  const ignore=readFileSync(new URL('../.dockerignore',import.meta.url),'utf8');
  assert.match(ignore,/^!advisor-reassignment-execution\.mjs\s*$/m);
});

test('replay is refused after receiving membership is revoked',async()=>{
  await setup().execute(requestFor());
  await db.query(`UPDATE reassignment_fixture_state SET snapshot=jsonb_set(snapshot,'{members,2,status}','"suspended"') WHERE firm_id='firm-a'`);
  const {execute,adapter}=setup();await assert.rejects(execute(requestFor()),{status:403});
  assert.deepEqual(adapter.calls,['authorize']);assert.equal((await receipts()).length,1);
});

test('an audit trigger changing suppression after CAS verification rolls everything back',async()=>{
  await refusedWithoutChanges({afterAudit:async client=>{await client.query(`UPDATE reassignment_fixture_state SET snapshot=jsonb_set(snapshot,'{preserved,suppressions,digest}',to_jsonb($1::text)) WHERE firm_id='firm-a'`,[syntheticDigest('audit trigger changed protection')]);}});
});

test('final authorization cannot conceal a protection mutation after audit insertion',async()=>{
  const fixture=setup(),original=fixture.adapter.authorizeAndLock;let checks=0;
  fixture.adapter.authorizeAndLock=async(client,request)=>{
    const grant=await original(client,request);
    if(++checks===2)await client.query(`UPDATE reassignment_fixture_state SET snapshot=jsonb_set(snapshot,'{preserved,jobs,digest}',to_jsonb($1::text)) WHERE firm_id='firm-a'`,[syntheticDigest('unexpected final mutation')]);
    return grant;
  };
  const before=await readState();await assert.rejects(fixture.execute(requestFor()),{status:409});
  assert.deepEqual(await readState(),before);assert.deepEqual(await receipts(),[]);
});

test('adapter errors with trusted-looking codes cannot leak private messages or properties',async()=>{
  for(const code of ['reassignment_denied','reassignment_conflict']){
    const fixture=setup();fixture.adapter.authorizeAndLock=async()=>{throw Object.assign(Error('PRIVATE ERROR DETAIL'),{code,privatePayload:'SECRET'});};
    await assert.rejects(fixture.execute(requestFor()),error=>error.code===code&&!error.message.includes('PRIVATE')&&!Object.hasOwn(error,'privatePayload'));
    assert.deepEqual(await receipts(),[]);
  }
});
