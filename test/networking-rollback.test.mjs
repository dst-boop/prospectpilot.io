import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {forgetPerson} from '../forget.mjs';
import {identityLookupKeys} from '../prospect-workspace.mjs';
import {forgetPerson as legacyForget} from './fixtures/forget-b543fa4.mjs';
import {validateRollbackTestURL, withRollbackDatabase, verifyNetworkingRollback} from './helpers/networking-rollback.mjs';

test('historical rollback fixture is exactly b543fa4 deletion code except its relative import', () => {
  const original = readFileSync(new URL('./fixtures/forget-b543fa4.mjs', import.meta.url), 'utf8')
    .replaceAll('\r\n', '\n').replace("from '../../lead-quality.mjs'", "from './lead-quality.mjs'");
  assert.equal(createHash('sha256').update(original).digest('hex'), 'dc0dc256782ad0d08be68f218732b758fadc92b7b10bb4db3877b09949abd290');
});

test('rollback gate refuses missing, production, remote, and redirecting database URLs', () => {
  for (const value of [undefined, '', 'postgres://localhost/prospectpilot', 'postgres://db.example.test/prospectpilot_test',
    'postgres://localhost/prospectpilot_test?host=production', 'postgres://localhost/prospectpilot_test#ignored',
    'https://localhost/prospectpilot_test']) assert.throws(() => validateRollbackTestURL(value));
  assert.equal(validateRollbackTestURL('postgres://localhost/prospectpilot_test'), 'postgres://localhost/prospectpilot_test');
});

test('standalone PostgreSQL release gate fails rather than silently skipping without a test URL', () => {
  const env = {...process.env}; delete env.POSTGRES_TEST_URL;
  // A tempting application URL must never be used as a fallback.
  env.DATABASE_URL = 'postgres://production.invalid/prospectpilot';
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-networking-rollback.mjs', import.meta.url))],
    {env, encoding: 'utf8', timeout: 10000});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /POSTGRES_TEST_URL is required/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND|production\.invalid/);
});

test('external rollback gate requires that image\'s identity-key callback module too', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/verify-networking-rollback.mjs', import.meta.url)),
    '--forget-module', fileURLToPath(new URL('../forget.mjs', import.meta.url))],
  {env: {...process.env, POSTGRES_TEST_URL: 'postgres://127.0.0.1:1/prospectpilot_test'}, encoding: 'utf8', timeout: 10000});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:.*--contact-keys-module/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND/);
});

for (const engine of ['pglite', 'postgres']) {
  const options = {skip: engine === 'postgres' && !process.env.POSTGRES_TEST_URL, timeout: 60000};
  test(`${engine}: 031 upgrade, repeated 032, capture-aware rollback deletion and three reimport surfaces stay private`, options,
    () => withRollbackDatabase(engine, async pool => {
      let callbackCalls = 0;
      await verifyNetworkingRollback(pool, forgetPerson, {contactKeys: person => { callbackCalls++; return identityLookupKeys(person); }});
      assert.ok(callbackCalls >= 4, 'both deletion transactions use the supplied rollback identity callback');
    }));
  test(`${engine}: b543fa4 historical negative control loses capture aliases after rollback deletion`, options,
    () => withRollbackDatabase(engine, pool => verifyNetworkingRollback(pool, legacyForget, {legacyNegativeControl: true})));
}
