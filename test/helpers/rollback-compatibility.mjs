import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../../migrate.mjs';

export function validateCompatibilityTestURL(value) {
  assert.ok(value, 'POSTGRES_TEST_URL is required');
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only a disposable loopback database is allowed');
  assert.match(url.pathname, /^\/[a-z0-9_]*test[a-z0-9_]*$/i);
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  return value;
}

export async function withCompatibilityDatabase(engine, run) {
  if (engine === 'pglite') {
    const db = new PGlite();
    const query = (sql, values) => !values && sql.includes(';') ? db.exec(sql).then(rows => rows.at(-1)) : db.query(sql, values);
    const pool = {query, connect: async () => ({query, release() {}})};
    try { await migrate({...pool, end: async () => {}}); return await run(pool); }
    finally { await db.close(); }
  }
  assert.equal(engine, 'postgres');
  const connectionString = validateCompatibilityTestURL(process.env.POSTGRES_TEST_URL);
  const schema = 'pp_compat_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Pool({connectionString, max: 1, connectionTimeoutMillis: 5000});
  const pool = new pg.Pool({connectionString, max: 2, connectionTimeoutMillis: 5000,
    options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=5000`});
  let created = false;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); created = true;
    await migrate({connect: () => pool.connect(), end: async () => {}});
    return await run(pool);
  } finally {
    await pool.end();
    try {
      assert.match(schema, /^pp_compat_test_[a-f0-9]{32}$/);
      if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    } finally { await admin.end(); }
  }
}

export async function transaction(pool, work) {
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
