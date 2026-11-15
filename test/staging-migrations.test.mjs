import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {migrate} from '../migrate.mjs';
import {createStagingDatabase, validateStagingDatabaseUrl} from './helpers/staging-database.mjs';

const localUrl = 'postgres://postgres:synthetic-ci-only@127.0.0.1:5432/prospectpilot_test';

test('staging fixture accepts only explicit disposable loopback database credentials', () => {
  assert.equal(validateStagingDatabaseUrl({DATABASE_URL: 'postgres://production.example/db'}), null);
  assert.equal(validateStagingDatabaseUrl({STAGING_DATABASE_URL: localUrl}).database, 'prospectpilot_test');
  assert.equal(validateStagingDatabaseUrl({POSTGRES_TEST_URL: localUrl}).host, '127.0.0.1');
  for (const url of [
    localUrl.replace('127.0.0.1', 'db.example.com'),
    localUrl.replace('prospectpilot_test', 'production'),
    localUrl.replace('synthetic-ci-only', 'real-password'),
    localUrl.replace('postgres:synthetic', 'admin:synthetic'),
    `${localUrl}?host=remote.example`, `${localUrl}?options=-csearch_path=public`,
    `${localUrl}#fragment`, 'not-a-url',
  ]) assert.throws(() => validateStagingDatabaseUrl({STAGING_DATABASE_URL: url}));
  for (const key of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGSSLMODE', 'PGPASSFILE']) {
    assert.throws(() => validateStagingDatabaseUrl({STAGING_DATABASE_URL: localUrl, [key]: 'inherited'}), /PG\*/);
  }
  assert.throws(() => validateStagingDatabaseUrl({STAGING_DATABASE_URL: localUrl, POSTGRES_TEST_URL: localUrl.replace('5432', '5433')}), /Conflicting/);
});

// Apply the real pre-032 SQL, not a current schema with its history edited.
async function baseline031(db) {
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter(file => /^\d{3}-.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 31).sort();
  await db.query('BEGIN');
  try {
    await db.query('CREATE TABLE prospectpilot_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    await db.query(await readFile(new URL('../generated/schema.sql', import.meta.url), 'utf8'));
    await db.query("INSERT INTO prospectpilot_migrations(id) VALUES ('001')");
    for (const file of files) {
      await db.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
      await db.query('INSERT INTO prospectpilot_migrations(id) VALUES ($1)', [file.slice(0, 3)]);
    }
    await db.query("INSERT INTO prospect_contacts(id,user_id,payload) VALUES ('old-contact','synthetic-owner',$1)", [JSON.stringify({name:'Synthetic Contact', source_kind:'csv_import', evidence:['fixture-only']})]);
    await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES ('old-lead','synthetic-team','synthetic-owner','owner@example.invalid',$1)", [JSON.stringify({name:'Synthetic Lead', evidence:['fixture-only']})]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function snapshot(db) {
  return {
    contacts: (await db.query('SELECT * FROM prospect_contacts ORDER BY id')).rows,
    leads: (await db.query('SELECT * FROM discovery_leads ORDER BY id')).rows,
    acquisitions: (await db.query('SELECT * FROM lead_acquisitions ORDER BY id')).rows,
  };
}

for (const backend of ['pglite', 'postgres']) {
  const skip = backend === 'postgres' && !process.env.STAGING_DATABASE_URL && !process.env.POSTGRES_TEST_URL
    ? 'Set an explicit disposable loopback STAGING_DATABASE_URL or POSTGRES_TEST_URL to run real PostgreSQL.' : false;
  test(`staging ${backend}: 031 upgrade preserves data through 033, reruns safely, failure rolls back`, {skip}, async () => {
    const db = await createStagingDatabase({backend});
    try {
      await baseline031(db);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM prospectpilot_migrations')).rows[0].n, 31);
      const before = await snapshot(db);
      assert.equal(before.acquisitions.length, 1);
      // Fail after 032 DDL actually executes. PostgreSQL must undo that DDL and
      // its history insert, not merely reject a mocked query before BEGIN.
      const failingPool = {
        connect: async () => ({query: async (sql, values) => {
          const result = await db.query(sql, values);
          if (sql.startsWith('INSERT INTO prospectpilot_migrations') && values?.[0] === '032') {
            await db.query('SELECT * FROM staging_intentionally_missing_relation');
          }
          return result;
        }, release() {}}), end: async () => {},
      };
      await assert.rejects(migrate(failingPool), /staging_intentionally_missing_relation/);
      assert.equal((await db.query("SELECT to_regclass('prospect_networking_captures') AS name")).rows[0].name, null);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM prospectpilot_migrations WHERE id='032'")).rows[0].n, 0);
      assert.deepEqual(await snapshot(db), before);
      await migrate(db.pool);
      await db.query("INSERT INTO prospect_networking_captures(id,user_id,contact_id,request_key,fingerprint,payload,result) VALUES ('capture','synthetic-owner','old-contact','request','synthetic-fingerprint','{}','{}')");
      await migrate(db.pool);
      assert.deepEqual(await snapshot(db), before);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM prospectpilot_migrations')).rows[0].n, 33);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM prospect_networking_captures')).rows[0].n, 1);
    } finally { await db.close(); }
  });

  test(`staging ${backend}: concurrent fixtures isolate schemas and cleanup only their own schema`, {skip}, async () => {
    const first = await createStagingDatabase({backend});
    let second;
    try {
      second = await createStagingDatabase({backend});
      assert.notEqual(first.schema, second.schema);
      for (const db of [first, second]) {
        assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name, db.schema);
        await migrate(db.pool);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM prospectpilot_migrations')).rows[0].n, 33);
        await db.query('CREATE TABLE isolation_probe (id TEXT PRIMARY KEY)');
        await db.query('INSERT INTO isolation_probe VALUES ($1)', [db.schema]);
      }
      assert.deepEqual((await first.query('SELECT id FROM isolation_probe')).rows, [{id:first.schema}]);
      assert.deepEqual((await second.query('SELECT id FROM isolation_probe')).rows, [{id:second.schema}]);
      await first.close();
      await first.close();
      assert.deepEqual((await second.query('SELECT id FROM isolation_probe')).rows, [{id:second.schema}]);
      if (backend === 'postgres') {
        assert.equal((await second.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1', [first.schema])).rows[0].n, 0);
      }
    } finally { await first.close(); await second?.close(); }
  });
}
