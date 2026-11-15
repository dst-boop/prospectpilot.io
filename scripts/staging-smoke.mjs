// Reproducible synthetic-only subprocess: no inherited app/provider credentials.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const postgres=process.argv.includes('--postgres');
if(process.argv.slice(2).some(arg=>arg!=='--postgres'))throw Error('Usage: node scripts/staging-smoke.mjs [--postgres]');
if(process.env.NODE_ENV==='production')throw Error('Synthetic staging refuses production mode');
if(postgres&&!process.env.STAGING_DATABASE_URL&&!process.env.POSTGRES_TEST_URL)throw Error('--postgres requires the disposable loopback STAGING_DATABASE_URL or POSTGRES_TEST_URL');
// Validate all supplied connection settings BEFORE stripping the environment.
const {validateStagingDatabaseUrl}=await import('../test/helpers/staging-database.mjs');
validateStagingDatabaseUrl(process.env);
const env={NODE_ENV:'test',SYNTHETIC_STAGING:'1'};
for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
if(postgres)env.STAGING_DATABASE_URL=process.env.STAGING_DATABASE_URL||process.env.POSTGRES_TEST_URL;
console.log(postgres?'Synthetic staging: REQUIRED disposable PostgreSQL, fake auth/providers, no external calls or spending.':'Synthetic staging: in-memory PGlite, fake auth/providers. This is NOT real PostgreSQL or Firebase validation.');
const result=spawnSync(process.execPath,['--test','--test-reporter=tap','test/staging-smoke.test.mjs','test/staging-migrations.test.mjs','test/staging-safety.test.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
