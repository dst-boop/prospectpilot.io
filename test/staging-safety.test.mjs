import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const clean={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE'])if(process.env[key])clean[key]=process.env[key];
const run=(args,env={})=>spawnSync(process.execPath,['scripts/staging-smoke.mjs',...args],{env:{...clean,...env},encoding:'utf8',timeout:10000});
test('synthetic runner fails closed on production mode and missing/remote PostgreSQL settings',()=>{
  for(const [args,env,message] of [
    [[],{NODE_ENV:'production'},/refuses production/],
    [['--postgres'],{},/requires the disposable loopback/],
    [['--postgres'],{STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@remote.example/prospectpilot_test'},/loopback-only/],
    [['--postgres'],{STAGING_DATABASE_URL:'postgres://postgres:synthetic-ci-only@127.0.0.1/prospectpilot_test',PGHOST:'remote.example'},/PG\*/],
    [['--unknown'],{},/Usage:/]
  ]){const result=run(args,env);assert.notEqual(result.status,0);assert.match(result.stderr,message);}
});
test('synthetic authentication remains test-only and CI explicitly requires real PostgreSQL',()=>{
  assert.doesNotMatch(read('server.mjs'),/staging-app|synthetic-id-|SYNTHETIC_STAGING/);
  const harness=read('test/helpers/staging-app.mjs');
  const imports=[...harness.matchAll(/from ['"]([^'"]+)['"]/g)].map(match=>match[1]);
  for(const source of imports)assert.ok(!source.startsWith('firebase-admin')&&!['server.mjs','prospect-providers.mjs','billing.mjs'].includes(source.split('/').at(-1)),source);
  assert.match(read('.github/workflows/tests.yml'),/run: pnpm staging:postgres/);
  assert.match(read('scripts/staging-smoke.mjs'),/validateStagingDatabaseUrl\(process\.env\)/);
  assert.match(read('scripts/staging-smoke.mjs'),/const env=\{NODE_ENV:'test'/);
});
