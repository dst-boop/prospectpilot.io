// Only synthetic fixtures and a local service container; never starts an app.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initial034ChildEnvironment} from './initial034-safety.mjs';
if(process.argv.length!==3||process.argv[2]!=='--postgres')throw Error('Explicit --postgres required');
const env=initial034ChildEnvironment(process.env);
console.log('Initial029-to034 preactivation-abort rehearsal: disposable PostgreSQL only, not production recovery approval.');
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','test/initial034.rehearsal.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env,stdio:'inherit',timeout:300000});
if(result.error)throw Error('Synthetic initial034 rehearsal could not complete');
process.exitCode=result.status??1;
