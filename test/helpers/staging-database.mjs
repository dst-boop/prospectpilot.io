import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';

const schemaPattern = /^pp_staging_[a-f0-9]{24}$/;

// Never inherit libpq/node-postgres defaults, service files, SSL or search paths.
// This contract is only for a disposable local/CI PostgreSQL service.
export function validateStagingDatabaseUrl(env = process.env) {
  const urls = [env.STAGING_DATABASE_URL, env.POSTGRES_TEST_URL].filter(Boolean);
  if (!urls.length) return null;
  if (Object.entries(env).some(([key, value]) => /^PG/i.test(key) && value)) {
    throw new Error('Unset inherited PG* connection overrides before running staging tests.');
  }
  if (urls.length === 2 && urls[0] !== urls[1]) throw new Error('Conflicting staging database URLs.');
  let url;
  try { url = new URL(urls[0]); } catch { throw new Error('Invalid staging database URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username !== 'postgres' || url.password !== 'synthetic-ci-only'
      || url.pathname !== '/prospectpilot_test' || url.search || url.hash
      || (url.port && (!/^\d+$/.test(url.port) || +url.port < 1 || +url.port > 65535))) {
    throw new Error('Staging requires a loopback-only postgres:synthetic-ci-only connection to prospectpilot_test, with no URL options.');
  }
  return {
    host: url.hostname === '[::1]' ? '::1' : url.hostname,
    port: Number(url.port || 5432), user: 'postgres', password: 'synthetic-ci-only',
    database: 'prospectpilot_test', ssl: false,
    application_name: 'prospectpilot-synthetic-staging', connectionTimeoutMillis: 5000,
  };
}

export async function createStagingDatabase({env = process.env, backend = 'auto'} = {}) {
  if (!['auto', 'postgres', 'pglite'].includes(backend)) throw new Error('Unknown staging backend.');
  const config = validateStagingDatabaseUrl(env);
  if (backend === 'postgres' && !config) throw new Error('Explicit STAGING_DATABASE_URL or POSTGRES_TEST_URL required.');
  const usePostgres = backend !== 'pglite' && Boolean(config);
  const schema = `pp_staging_${randomBytes(12).toString('hex')}`;
  if (!schemaPattern.test(schema)) throw new Error('Invalid generated schema.');
  const db = usePostgres ? new pg.Client({...config, options: `-c search_path=${schema}`}) : new PGlite();
  let created = false, closed = false;
  const query = async (sql, values) => {
    if (closed) throw new Error('Staging fixture is closed.');
    if (usePostgres) return db.query(sql, values);
    if (!values && sql.includes(';')) return (await db.exec(sql)).at(-1);
    const result = await db.query(sql, values);
    return {...result, rowCount: result.rows.length || result.affectedRows || 0};
  };
  const close = async () => {
    if (closed) return;
    try {
      // Only this closure's randomly generated schema can ever be removed.
      if (created) {
        await query('ROLLBACK');
        await query(`DROP SCHEMA "${schema}" CASCADE`);
      }
    } finally {
      closed = true;
      if (usePostgres) await db.end(); else await db.close();
    }
  };
  try {
    if (usePostgres) await db.connect();
    await query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await query(`SET search_path TO "${schema}"`);
    // migrate() owns/releases its pool; fixture owns the actual connection.
    const client = {query, release() {}};
    const pool = {query, connect: async () => client, end: async () => {}};
    return {schema, backend: usePostgres ? 'postgres' : 'pglite', query, pool, close};
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}
