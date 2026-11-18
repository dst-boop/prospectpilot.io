import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {workerFloor,workerCriticalFiles,parseWorkerBootstrapResult} from '../scripts/worker-bootstrap-rehearsal.mjs';
test('worker artifact is pinned corrected139 with critical actual-runtime content evidence',()=>{
 assert.deepEqual(workerFloor,{commit:'6e85c69d3f1883bb4d82f7a3624aaf03567a15c6',tree:'7ceb709a81039ef2ca1aea9717de0a35116388f2'});
 for(const file of ['rollback-worker.mjs','rollback-bootstrap.mjs','rollback-schema.mjs','scripts/rollback-schema034.json','generated/schema.sql','research-worker.mjs','legacy-identity-guard.mjs','historical-identities.mjs','prospect-data-quality.mjs'])assert.ok(workerCriticalFiles.includes(file));
 assert.equal(workerCriticalFiles.includes('generated/worker.mjs'),false);
});
test('worker result refuses missing, duplicate, unbounded or overclaimed proof',()=>{
 const result={verified:true,fullCompatibility:false,networkDeniedOperations:0,outbound_attempts:0,idle_graceful_exit:0,guard_loss_exit:1,...Object.fromEntries(['incompatible035_refused','actual_rollback_worker_bootstrap','idle_loop_reached','legacy_queue_loop_reached','legacy_identity_guard_terminal_refusal','exclusive_migration_lock_blocked','worker_sessions_closed','unrelated_rows_preserved','reservations_preserved'].map(k=>[k,true]))};const output=r=>'WORKER_BOOTSTRAP_RESULT:'+JSON.stringify(r);
 assert.deepEqual(parseWorkerBootstrapResult(output(result)),result);
 for(const altered of [{verified:false},{fullCompatibility:true},{networkDeniedOperations:1}])assert.throws(()=>parseWorkerBootstrapResult(output({...result,...altered})));
 assert.throws(()=>parseWorkerBootstrapResult(output(result)+'\n'+output(result)));assert.throws(()=>parseWorkerBootstrapResult(''));assert.throws(()=>parseWorkerBootstrapResult(output({...result,pad:'x'.repeat(16384)})));
});
test('worker runner overlays only test harness and bounds hardened actual-image execution',async()=>{
 const source=await readFile(new URL('../scripts/worker-bootstrap-rehearsal.mjs',import.meta.url),'utf8');
 assert.match(source,/COPY verify-rollback-worker-image\.mjs \/app\/scripts/);
 assert.match(source,/validateTwoImageEnvironment\(env\)/);assert.match(source,/unix:\/\/\/var\/run\/docker.sock/);
 assert.equal((source.match(/await verifyTag\(\);/g)||[]).length,2);
 assert.match(source,/'build','--pull=false'/);assert.match(source,/'--read-only'/);assert.match(source,/'--cap-drop=ALL'/);assert.match(source,/'no-new-privileges'/);
 assert.match(source,/'240s','node','scripts\/verify-rollback-worker-image.mjs','--synthetic-image'/);
 assert.doesNotMatch(source,/COPY (?:research-worker|rollback-worker|handler)\.mjs/);
});
