import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {forgetPerson, forgottenKeys} from '../forget.mjs';
import {createProspectWorkspace, identityLookupKeys} from '../prospect-workspace.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {normalizeContact} from '../prospect-data-quality.mjs';
import {candidateKeys} from '../lead-quality.mjs';
import {validateCompatibilityTestURL, withCompatibilityDatabase, transaction} from './helpers/rollback-compatibility.mjs';

const owner = {uid: 'compat-owner', email: 'owner@example.test'};
const other = {uid: 'compat-other', email: 'other@example.test'};
const csv = 'First Name,Last Name,Company,Email\nJordan,Example,Original Synthetic Company,jordan@example.test';
const person = {first_name: 'Jordan', last_name: 'Example', company: 'Private Synthetic Company',
  email: 'JORDAN@example.test', linkedin_url: 'https://www.linkedin.com/in/Jordan-Private/?trk=fixture',
  country: 'United States', state: 'Massachusetts'};
const schema032 = readFileSync(new URL('./fixtures/032-networking-capture.sql', import.meta.url), 'utf8');
const count = async (pool, table) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const erase = (pool, id, beforeCommit = async () => {}) => transaction(pool, async client => {
  const result = await forgetPerson(client, owner, {contactId: id}, {contactKeys: identityLookupKeys});
  await beforeCommit(client);
  return result;
});
async function seed(pool) {
  const app = createProspectWorkspace({pool});
  await app.importCSV(owner, {csv});
  const id = (await app.search(owner)).contacts[0].id;
  return {app, id};
}
async function add032(pool) {
  await pool.query(schema032);
  await pool.query("INSERT INTO prospectpilot_migrations(id) VALUES('032')");
}
async function capture(pool, user, id, alias = person) {
  await pool.query('INSERT INTO prospect_networking_captures(id,user_id,contact_id,request_key,fingerprint,payload,result) VALUES($1,$2,$3,$1,$1,$4::jsonb,$5::jsonb)',
    ['capture-'+user.uid, user.uid, id, JSON.stringify({person: alias, note: 'PRIVATE SYNTHETIC NOTE', referrer: {name: 'Private Referrer'}}), '{}']);
}

test('disposable compatibility URL rejects missing, remote and redirected destinations', () => {
  for (const value of [undefined, '', 'postgres://localhost/prospectpilot', 'postgres://remote.example.test/prospectpilot_test',
    'postgres://localhost/prospectpilot_test?host=remote', 'postgres://localhost/prospectpilot_test#fragment'])
    assert.throws(() => validateCompatibilityTestURL(value));
  assert.equal(validateCompatibilityTestURL('postgres://localhost/prospectpilot_test'), 'postgres://localhost/prospectpilot_test');
});

test('compatibility candidate exposes no networking writer and does not schedule migration 032', () => {
  const app = createProspectWorkspace({pool: {}});
  assert.equal(app.captureNetworking, undefined);
  assert.equal(app.networkingHistory, undefined);
  assert.doesNotMatch(readFileSync(new URL('../migrate.mjs', import.meta.url), 'utf8'), /\['03[0-2]'/);
  // Exact reviewed PR99 schema fixture. It is test data, not a release migration.
  assert.equal(createHash('sha256').update(schema032.replaceAll('\r\n', '\n')).digest('hex'), 'ef11f48725f9e51ef3e485974bd9826d98a8d41b13f8a991db48fd7231379dc7');
});

for (const engine of ['pglite', 'postgres']) {
  const options = {skip: engine === 'postgres' && !process.env.POSTGRES_TEST_URL, timeout: 60000};
  test(`${engine}: pre-032 deletion commits without an aborted transaction and retains normal tombstones`, options,
    () => withCompatibilityDatabase(engine, async pool => {
      const {app, id} = await seed(pool);
      assert.equal((await pool.query("SELECT to_regclass('prospect_networking_captures') AS captures")).rows[0].captures, null);
      assert.deepEqual(await erase(pool, id, async client => {
        assert.equal((await client.query('SELECT 1 AS healthy')).rows[0].healthy, 1);
      }), {deleted: true, contacts: 1, leads: 0});
      assert.equal(await count(pool, 'prospect_contacts'), 0);
      assert.equal((await app.importCSV(owner, {csv, source: 'Synthetic retry'})).rejected, 1);
    }));

  test(`${engine}: existing 032 captures remain private across deletion, transaction rollback and alias reimports`, options,
    () => withCompatibilityDatabase(engine, async pool => {
      const {app, id} = await seed(pool);
      await add032(pool);
      await app.importCSV(other, {csv});
      const otherId = (await app.search(other)).contacts[0].id;
      await capture(pool, owner, id);
      await capture(pool, other, otherId);
      const before = (await pool.query('SELECT * FROM prospect_contacts ORDER BY id')).rows;
      await assert.rejects(erase(pool, id, () => {throw Error('Synthetic failure after deletion');}), /Synthetic failure/);
      assert.deepEqual((await pool.query('SELECT * FROM prospect_contacts ORDER BY id')).rows, before);
      assert.equal(await count(pool, 'prospect_networking_captures'), 2);
      assert.equal(await count(pool, 'prospect_forgotten'), 0);
      await erase(pool, id);
      assert.equal(await count(pool, 'prospect_networking_captures'), 1);
      const normalized = normalizeContact(person, 'Networking', {importing: true});
      const keys = [...new Set([...identityLookupKeys(normalized), ...candidateKeys(normalized)])];
      assert.equal((await forgottenKeys(pool, owner.uid, keys)).size, keys.length);
      assert.equal((await forgottenKeys(pool, other.uid, keys)).size, 0);
      const stones = (await pool.query('SELECT * FROM prospect_forgotten')).rows;
      assert.ok(stones.every(row => /^[a-f0-9]{64}$/.test(row.key_hash)));
      assert.doesNotMatch(JSON.stringify(stones), /Jordan|Private Synthetic|Referrer|SYNTHETIC NOTE/);
      const aliasCSV = 'First Name,Last Name,Company,Country,State\nJordan,Example,Private Synthetic Company,US,MA';
      assert.equal((await app.importCSV(owner, {csv: aliasCSV})).rejected, 1);
      const lab = createResearchLab({pool, sources: {readiness: {}}});
      await lab.importCSV(owner, {csv: aliasCSV.replace('Country,State', 'Country,State,Estimated Age Range') + ',62'});
      assert.equal((await lab.list(owner)).leads.length, 0);
      assert.equal((await app.search(other)).total, 1);
    }));

  test(`${engine}: recorded 032 without its table fails closed before any deletion`, options,
    () => withCompatibilityDatabase(engine, async pool => {
      const {id} = await seed(pool);
      await pool.query("INSERT INTO prospectpilot_migrations(id) VALUES('032')");
      await assert.rejects(erase(pool, id), {status: 503});
      assert.equal(await count(pool, 'prospect_contacts'), 1);
      assert.equal(await count(pool, 'prospect_forgotten'), 0);
    }));

  test(`${engine}: unverified migration ledger fails closed when the capture table is absent`, options,
    () => withCompatibilityDatabase(engine, async pool => {
      const {id} = await seed(pool);
      await pool.query('ALTER TABLE prospectpilot_migrations RENAME TO synthetic_missing_ledger');
      await assert.rejects(erase(pool, id), {status: 503});
      assert.equal(await count(pool, 'prospect_contacts'), 1);
      assert.equal(await count(pool, 'prospect_forgotten'), 0);
    }));

  test(`${engine}: capture read errors never become empty aliases or a successful deletion`, options,
    () => withCompatibilityDatabase(engine, async pool => {
      const {id} = await seed(pool);
      await add032(pool); await capture(pool, owner, id);
      await assert.rejects(transaction(pool, async client => {
        const guarded = {query: (sql, values) => {
          if (sql.startsWith("SELECT payload->'person'")) throw Object.assign(Error('Synthetic capture permission failure'), {code: '42501'});
          return client.query(sql, values);
        }};
        await forgetPerson(guarded, owner, {contactId: id}, {contactKeys: identityLookupKeys});
      }), {code: '42501'});
      assert.equal(await count(pool, 'prospect_contacts'), 1);
      assert.equal(await count(pool, 'prospect_networking_captures'), 1);
      assert.equal(await count(pool, 'prospect_forgotten'), 0);
    }));
}
