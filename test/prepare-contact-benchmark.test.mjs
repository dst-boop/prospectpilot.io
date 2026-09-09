import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateContactBenchmark} from '../contact-benchmark.mjs';

test('benchmark preparation preserves unknown outcomes and refuses to overwrite reviewer work',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'contact-benchmark-'));
 try{
  const path=join(directory,'trial.json'),script=fileURLToPath(new URL('../scripts/prepare-contact-benchmark.mjs',import.meta.url));
  execFileSync(process.execPath,[script,path,'3','trial_fixture']);
  const draft=JSON.parse(await readFile(path,'utf8'));
  assert.throws(()=>evaluateContactBenchmark(draft),/explicit returned boolean/);
  for(const run of draft.runs){assert.deepEqual(run.outcomes.map(r=>r.candidate_id),draft.candidate_ids);assert.ok(Object.values(run.costs_micros).every(v=>v===null));}
  const reviewed='reviewer work must survive';await writeFile(path,reviewed);
  assert.throws(()=>execFileSync(process.execPath,[script,path,'3','trial_fixture'],{stdio:'pipe'}));
  assert.equal(await readFile(path,'utf8'),reviewed);
 }finally{await rm(directory,{recursive:true,force:true});}
});
