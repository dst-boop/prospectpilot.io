import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const source=readFileSync(new URL('../scripts/verify-rollback-worker-image.mjs',import.meta.url),'utf8');
test('worker image harness refuses unsafe inputs before any resource creation',()=>{
 for(const [args,env] of [[['--synthetic-image'],{NODE_ENV:'production'}],[[],{}],[['--synthetic-image'],{}],[['--synthetic-image'],{PGOPTIONS:'unsafe'}],[['--synthetic-image'],{STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@remote.example/prospectpilot_test'}],[['--synthetic-image'],{STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@127.0.0.1:0/prospectpilot_test'}]]){
  const result=spawnSync(process.execPath,['scripts/verify-rollback-worker-image.mjs',...args],{cwd:root,env:{PATH:process.env.PATH,...env},encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);assert.match(result.stderr,/required|forbidden|permitted|refuses production|Invalid disposable PostgreSQL port/);
 }
});
test('worker harness launches real entrypoint with strict preload and no inherited credentials',()=>{
 assert.match(source,/'rollback-worker\.mjs'/);assert.match(source,/rollback-bootstrap-network-guard\.mjs/);
 assert.match(source,/env:\{/);assert.doesNotMatch(source,/env:\s*\{\s*\.\.\.process\.env/);
 assert.match(source,/setTimeout\(\(\)=>child.kill\('SIGKILL'\),45000\)/);
 assert.match(source,/query='SELECT pg_advisory_xact_lock\(505011\)'/);
 assert.match(source,/wait_event_type='Lock' AND wait_event='advisory'/);
 assert.match(source,/backend_start=\$2 AND usename=\$3 AND datname=\$4/);
 assert.match(source,/if\(connected&&barrier\)/);
 assert.match(source,/reports.length,1/);assert.match(source,/row.status,'failed'/);assert.match(source,/row.next_source,1/);
 assert.match(source,/interval '1 day'/);assert.match(source,/Only explicitly seeded legacy job changes/);
 assert.match(source,/fullCompatibility:false/);assert.match(source,/WORKER_BOOTSTRAP_RESULT:/);
});
