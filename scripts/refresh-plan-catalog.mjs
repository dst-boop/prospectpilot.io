// Monthly public-plan catalog refresh, run as a separate Cloud Run job.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const year=Number(process.env.PLAN_FORM_YEAR||new Date().getUTCFullYear()-1);
if(!Number.isInteger(year)||year<2023||year>new Date().getUTCFullYear())throw Error('Invalid plan form year');
const root=await mkdtemp(join(tmpdir(),'prospectpilot-plans-'));
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',env:process.env});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Catalog command failed with exit '+code)));});
try{
  await run('python3',['scripts/download-plan-data.py',String(year),root]);
  const output=join(root,'catalog.jsonl');
  await run('python3',['scripts/prepare-plan-catalog.py','--form',join(root,`F_5500_${year}_Latest.zip`),'--schedule-h',join(root,`F_SCH_H_${year}_Latest.zip`),'--short-form',join(root,`F_5500_SF_${year}_Latest.zip`),'--output',output]);
  await run(process.execPath,['scripts/import-plan-catalog.mjs',output]);
}finally{await rm(root,{recursive:true,force:true});}
