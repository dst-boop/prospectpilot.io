import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';

// Run the same ownership regressions against PostgreSQL in CI and PGlite
// locally. Every real-PostgreSQL fixture owns a fresh, synthetic-only schema.
// No application credentials or production database URL are loaded here.
export async function createOwnershipTestDatabase() {
  if (!process.env.POSTGRES_TEST_URL) return new PGlite();
  const schema='pp_owner_test_'+randomUUID().replaceAll('-','');
  const client=new pg.Client({connectionString:process.env.POSTGRES_TEST_URL,
    options:`-c search_path=${schema} -c statement_timeout=10000`});
  await client.connect();
  try { await client.query(`CREATE SCHEMA ${schema}`); }
  catch (error) { await client.end(); throw error; }
  return {
    query:(...args)=>client.query(...args),
    exec:sql=>client.query(sql),
    async close() {
      try {
        await client.query('ROLLBACK');
        await client.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally { await client.end(); }
    },
  };
}
