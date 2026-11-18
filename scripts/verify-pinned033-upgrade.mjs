// Preserve the original 029→033→PR100 rehearsal at its reviewed exact source.
// This is baseline evidence only, never a claim that PR100 can run schema034.
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {validateStagingDatabaseUrl} from '../test/helpers/staging-database.mjs';
export const pinned033='acb3adbb3ce714889350f6facc55c3c32471fc42';
const native=process.argv[2]==='--postgres';
if(process.argv.length!==3||!['--postgres','--pglite'].includes(process.argv[2]))throw Error('Explicit --postgres or --pglite required');
const config=validateStagingDatabaseUrl();
if(process.env.NODE_ENV==='production'||(native&&!config)||(!native&&config))throw Error('Explicit isolated test backend required');
const root=fileURLToPath(new URL('..',import.meta.url));
assertCommit();
function assertCommit(){if(execFileSync('git',['rev-parse',pinned033+'^{commit}'],{cwd:root,encoding:'utf8'}).trim()!==pinned033)throw Error('Missing pinned033 history');}
// A disposable detached worktree gives historical git helpers their own root.
const dir=await mkdtemp(join(root,'.pinned033-rehearsal-'));
let attached=false;
try{
 execFileSync('git',['worktree','add','--detach',dir,pinned033],{cwd:root});attached=true;
 await symlink(join(root,'node_modules'),join(dir,'node_modules'),'dir');
 console.log('Pinned historical baseline only: '+pinned033+'; not034 rollback approval.');
 const result=spawnSync(process.execPath,['scripts/upgrade-rehearsal.mjs',...(native?['--postgres']:[])],{cwd:dir,env:process.env,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error('Pinned033 upgrade rehearsal failed: '+result.status);
}finally{if(attached)execFileSync('git',['worktree','remove','--force',dir],{cwd:root});else await rm(dir,{recursive:true,force:true});}
