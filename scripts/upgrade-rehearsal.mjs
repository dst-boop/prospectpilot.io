// Run only synthetic tests with an allowlisted environment, never the app server.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateStagingDatabaseUrl} from '../test/helpers/staging-database.mjs';
const postgres = process.argv.includes('--postgres');
if (process.argv.slice(2).some(arg => arg !== '--postgres')) throw Error('Usage: node scripts/upgrade-rehearsal.mjs [--postgres]');
if (process.env.NODE_ENV === 'production') throw Error('Upgrade rehearsal refuses production mode');
const config = validateStagingDatabaseUrl(process.env);
if (postgres && !config) throw Error('--postgres requires an explicit disposable loopback test database');
const env = {NODE_ENV: 'test', SYNTHETIC_STAGING: '1', UPGRADE_REQUIRE_POSTGRES: postgres ? '1' : '0'};
for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
if (postgres) env.STAGING_DATABASE_URL = process.env.STAGING_DATABASE_URL || process.env.POSTGRES_TEST_URL;
console.log(postgres ? 'Full upgrade rehearsal: disposable PostgreSQL 16 required; synthetic fixtures only.' : 'Full upgrade rehearsal: PGlite only, not PostgreSQL or production proof.');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/full-upgrade.rehearsal.mjs'], {cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
