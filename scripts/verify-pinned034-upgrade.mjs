// Preserve the frozen #138 initial029→034 rehearsal without modifying its pins.
// This is preactivation-abort evidence, never live034 rollback approval.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {initial034ChildEnvironment} from './initial034-safety.mjs';
import {validateStagingDatabaseUrl} from '../test/helpers/staging-database.mjs';
export const pinned034='9f840ac9e07a9051055bdd3eb97857f0d2645392';
const native=process.argv[2]==='--postgres';
if(process.argv.length!==3||!['--postgres','--pglite'].includes(process.argv[2]))throw Error('Explicit --postgres or --pglite required');
const config=validateStagingDatabaseUrl();
if(process.env.NODE_ENV==='production'||(native&&!config)||(!native&&config))throw Error('Explicit isolated test backend required');
const root=fileURLToPath(new URL('..',import.meta.url));
assertCommit();
function assertCommit(){if(execFileSync('git',['rev-parse',pinned034+'^{commit}'],{cwd:root,encoding:'utf8'}).trim()!==pinned034)throw Error('Missing pinned034 history');}
// A disposable detached worktree gives historical git helpers their own root.
const dir=await mkdtemp(join(root,'.pinned034-rehearsal-'));
let attached=false;
try{
 execFileSync('git',['worktree','add','--detach',dir,pinned034],{cwd:root});attached=true;
 await symlink(join(root,'node_modules'),join(dir,'node_modules'),'dir');
 console.log('Pinned historical baseline only: '+pinned034+'; not live034 rollback approval.');
 const result=spawnSync(process.execPath,native?['scripts/initial034-rehearsal.mjs','--postgres']:['--test','--test-concurrency=1','test/initial034.rehearsal.mjs'],{cwd:dir,env:native?initial034ChildEnvironment(process.env):{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},timeout:360000,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error('Pinned034 upgrade rehearsal failed: '+result.status);
}finally{if(attached)execFileSync('git',['worktree','remove','--force',dir],{cwd:root});else await rm(dir,{recursive:true,force:true});}
