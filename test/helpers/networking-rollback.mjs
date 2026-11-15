import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../migrate.mjs';
import {createProspectWorkspace, identityLookupKeys} from '../../prospect-workspace.mjs';
import {createResearchLab} from '../../research-lab.mjs';
import {normalizeContact} from '../../prospect-data-quality.mjs';
import {candidateKeys} from '../../lead-quality.mjs';
import {forgottenKeys} from '../../forget.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const owner = {uid: 'rollback-owner', email: 'owner@example.test'};
const other = {uid: 'rollback-other', email: 'other@example.test'};
const originalCSV = 'First Name,Last Name,Company,Email\nJordan,Example,Original Synthetic Company,jordan@example.test';
const alias = {first_name: 'Jordan', last_name: 'Example', company: 'New Synthetic Company',
  email: 'JORDAN@example.test', linkedin_url: 'https://www.linkedin.com/in/Jordan-Synthetic/?trk=fixture',
  country: 'United States', state: 'Massachusetts'};
const capture = (request_key = 'synthetic-upgrade-request') => ({request_key, person: alias,
  kind: 'warm_introduction', context: 'Synthetic upgrade conference',
  referrer: {name: 'Private Referrer', context: 'Synthetic referrer context'},
  note: 'PRIVATE SYNTHETIC NOTE. Never keep this in a tombstone.'});

// Never fall back to DATABASE_URL/PGHOST. An explicit disposable loopback
// database is mandatory, with no options that can override its destination.
export function validateRollbackTestURL(value) {
  if (!value) throw Error('POSTGRES_TEST_URL is required; use a disposable local PostgreSQL test database.');
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only loopback test databases are allowed');
  assert.match(url.pathname, /^\/[a-z0-9_]*test[a-z0-9_]*$/i, 'Database name must explicitly contain test');
  assert.equal(url.search, '', 'Connection URL options are not allowed');
  assert.equal(url.hash, '', 'Connection URL fragments are not allowed');
  return value;
}

export async function withRollbackDatabase(engine, run) {
  if (engine === 'pglite') {
    const db = new PGlite();
    const query = (sql, values) => !values && sql.includes(';') ? db.exec(sql).then(rows => rows.at(-1)) : db.query(sql, values);
    const pool = {query, connect: async () => ({query, release() {}}), end: async () => {}};
    try { return await run(pool); } finally { await db.close(); }
  }
  assert.equal(engine, 'postgres');
  const connectionString = validateRollbackTestURL(process.env.POSTGRES_TEST_URL);
  const schema = 'pp_rollback_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({connectionString, max: 1, connectionTimeoutMillis: 5000});
  const pool = new pg.Pool({connectionString, max: 2, connectionTimeoutMillis: 5000,
    options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000`});
  let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    return await run(pool);
  } finally {
    await pool.end();
    try {
      assert.match(schema, /^pp_rollback_test_[a-f0-9]{32}$/);
      if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally { await admin.end(); }
  }
}

async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Reconstruct the real pre-capture schema from migrations 001..031, including
// the runner's ledger. Do not fake an upgrade by dropping 032 after migrating.
async function preCaptureSchema(pool) {
  const files = [...read('migrate.mjs').matchAll(/\['(\d{3})','([^']+\.sql)'\]/g)]
    .map(([, id, file]) => ({id, file})).filter(({id}) => Number(id) <= 31);
  assert.deepEqual(files.map(({id}) => id), Array.from({length: 31}, (_, i) => String(i + 1).padStart(3, '0')));
  await transaction(pool, async client => {
    await client.query('CREATE TABLE prospectpilot_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const {id, file} of files) {
      await client.query(read(file));
      await client.query('INSERT INTO prospectpilot_migrations(id) VALUES($1)', [id]);
    }
  });
  assert.equal((await pool.query("SELECT to_regclass('prospect_networking_captures') AS table_name")).rows[0].table_name, null);
}

const rows = async (pool, table) => (await pool.query(`SELECT * FROM ${table} ORDER BY 1,2`)).rows;
const deleteContact = (pool, forget, id) => transaction(pool, client =>
  forget(client, owner, {contactId: id}, {contactKeys: identityLookupKeys}));

// Each import probe sees the same post-deletion state; a successful negative
// control must not create a collision that masks the next import surface.
async function probeWorkspace(pool, run) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const isolated = {transactionClient: client, query: (...args) => client.query(...args)};
    return await run(createProspectWorkspace({pool: isolated}));
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}

export async function verifyNetworkingRollback(pool, forget, {legacyNegativeControl = false} = {}) {
  await preCaptureSchema(pool);
  const app = createProspectWorkspace({pool});
  await app.importCSV(owner, {source: 'Synthetic pre-upgrade import', csv: originalCSV});
  await app.importCSV(other, {source: 'Synthetic other owner', csv: originalCSV});
  const beforeContacts = await rows(pool, 'prospect_contacts');
  const beforeMigrations = await rows(pool, 'prospectpilot_migrations');
  const id = beforeContacts.find(row => row.user_id === owner.uid).id;
  const migrations = {connect: () => pool.connect(), end: async () => {}};
  await migrate(migrations);
  assert.deepEqual(await rows(pool, 'prospect_contacts'), beforeContacts, '032 preserves existing contact fields and timestamps');
  assert.deepEqual((await rows(pool, 'prospectpilot_migrations')).filter(row => Number(row.id) <= 31), beforeMigrations);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM prospectpilot_migrations WHERE id='032'")).rows[0].n, 1);

  const saved = await app.captureNetworking(owner, capture());
  const otherSaved = await app.captureNetworking(other, capture());
  assert.equal(saved.duplicates, 1);
  assert.equal(saved.capture.contact_id, id);
  assert.deepEqual(await rows(pool, 'prospect_contacts'), beforeContacts, 'capture-only alias stays out of shared contact data');
  const captures = await rows(pool, 'prospect_networking_captures');
  await migrate(migrations);
  assert.deepEqual(await rows(pool, 'prospect_networking_captures'), captures, 'rerunning migrations preserves capture payloads');
  assert.deepEqual(await rows(pool, 'prospect_contacts'), beforeContacts);

  // A thrown operation after DELETE must roll back both cascading deletes and
  // tombstones. This executes the selected rollback module, not copied SQL.
  await assert.rejects(transaction(pool, async client => {
    await forget(client, owner, {contactId: id}, {contactKeys: identityLookupKeys});
    throw Error('Synthetic transaction failure after deletion');
  }), /Synthetic transaction failure/);
  assert.deepEqual(await rows(pool, 'prospect_contacts'), beforeContacts);
  assert.deepEqual(await rows(pool, 'prospect_networking_captures'), captures);
  assert.deepEqual(await rows(pool, 'prospect_forgotten'), []);

  assert.deepEqual(await deleteContact(pool, forget, id), {deleted: true, contacts: 1, leads: 0});
  assert.equal((await app.networkingHistory(owner)).captures.length, 0, '032 FK cascade removes the private ledger');
  assert.equal((await app.networkingHistory(other)).captures[0].id, otherSaved.capture.id, 'another owner retains their capture');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM prospect_forgotten WHERE user_id=$1', [other.uid])).rows[0].n, 0);
  assert.ok((await pool.query("SELECT to_regclass('prospect_networking_captures') AS table_name")).rows[0].table_name, 'application rollback retains schema 032');

  const person = normalizeContact(alias, 'Networking', {importing: true});
  const keys = [...new Set([...identityLookupKeys(person), ...candidateKeys(person)])];
  const blocked = await forgottenKeys(pool, owner.uid, keys);
  const aliasLinkedin = keys.find(key => key.startsWith('linkedin:'));
  assert.ok(aliasLinkedin, 'fixture must have a capture-only LinkedIn alias');
  const stones = await rows(pool, 'prospect_forgotten');
  assert.ok(stones.length > 0);
  assert.ok(stones.every(row => /^[a-f0-9]{64}$/.test(row.key_hash)), 'only identity hashes persist');
  for (const value of ['Jordan', 'New Synthetic Company', 'jordan-synthetic', 'Private Referrer', 'PRIVATE SYNTHETIC NOTE'])
    assert.ok(!JSON.stringify(stones).includes(value));
  const importCaches = JSON.stringify((await pool.query('SELECT result FROM prospect_imports WHERE user_id=$1', [owner.uid])).rows);
  for (const value of ['Jordan Example', 'Private Referrer', 'PRIVATE SYNTHETIC NOTE']) assert.ok(!importCaches.includes(value));

  // Re-import without the original email/company: the new keys existed only
  // in the now-deleted private capture. Exercise all actual import surfaces.
  const aliasCSV = 'First Name,Last Name,Company,Country,State\nJordan,Example,New Synthetic Company,US,MA';
  const directory = await probeWorkspace(pool, probe => probe.importCSV(owner, {source: 'Synthetic alias reimport', csv: aliasCSV}));
  const network = await probeWorkspace(pool, probe => probe.captureNetworking(owner, {...capture('synthetic-alias-reimport'),
    person: {...alias, email: '', linkedin_url: 'https://www.linkedin.com/in/jordan-synthetic', country: 'US', state: 'MA'}}));
  const lab = createResearchLab({pool, now: () => new Date('2026-09-12T15:00:00Z'), sources: {readiness: {}}});
  await lab.importCSV(owner, {csv: aliasCSV.replace('Country,State', 'Country,State,Estimated Age Range') + ',62'});
  const leadCount = (await lab.list(owner)).leads.length;
  if (legacyNegativeControl) {
    assert.equal(blocked.has(aliasLinkedin), false, 'historical deletion fails to tombstone capture-only LinkedIn');
    assert.equal(directory.added, 1, 'negative control reproduces directory resurrection');
    assert.ok(network.capture, 'negative control reproduces networking resurrection');
    assert.equal(leadCount, 1, 'negative control reproduces Research Lab resurrection');
  } else {
    assert.equal(blocked.size, keys.length, 'rollback must tombstone every normalized capture identity before cascade');
    assert.equal(directory.added, 0, 'rollback must prevent directory resurrection');
    assert.equal(directory.rejected, 1);
    assert.equal(network.capture, undefined, 'rollback must prevent networking resurrection');
    assert.equal(network.rejected, 1);
    assert.equal(leadCount, 0, 'rollback must prevent Research Lab resurrection');
  }
  await assert.rejects(app.captureNetworking(owner, capture()), {status: 409}, 'old request cannot replay a deleted capture');
  const otherAgain = await app.captureNetworking(other, capture('synthetic-other-repeat'));
  assert.equal(otherAgain.rejected, 0, 'owner tombstones cannot block another owner');
  assert.equal(otherAgain.duplicates, 1);
  return {migration: '031 -> 032 (twice)', deletedCaptures: 1, protected: !legacyNegativeControl,
    directoryReimported: directory.added, labReimported: leadCount};
}
