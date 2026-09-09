import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateContactBenchmark} from '../contact-benchmark.mjs';

test('benchmark CLI rejects oversized files and omits malformed file content from errors',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'contact-benchmark-input-'));
 try{
  const path=join(directory,'input.json'),script=fileURLToPath(new URL('../scripts/evaluate-contact-benchmark.mjs',import.meta.url));
  const file=await open(path,'w');try{await file.truncate(20_000_001);}finally{await file.close();}
  const invoke=()=>execFileSync(process.execPath,[script,path],{stdio:'pipe'});
  assert.throws(invoke,error=>error.stderr.toString().includes('exceeds 20 MB')&&error.stdout.length===0);
  const marker='REVIEWER_EVIDENCE_CONTENT';await writeFile(path,'{"evidence_ref":"'+marker+'",BROKEN}');
  assert.throws(invoke,error=>error.stderr.toString().includes('must be valid JSON')&&!error.stderr.toString().includes(marker)&&error.stdout.length===0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('benchmark preparation preserves unknown outcomes and refuses to overwrite reviewer work',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'contact-benchmark-'));
 try{
  const path=join(directory,'trial.json'),script=fileURLToPath(new URL('../scripts/prepare-contact-benchmark.mjs',import.meta.url));
  execFileSync(process.execPath,[script,path,'3','trial_fixture']);
  const draft=JSON.parse(await readFile(path,'utf8'));
  assert.throws(()=>evaluateContactBenchmark(draft),/explicit returned boolean/);
  for(const run of draft.runs){assert.deepEqual(run.outcomes.map(r=>r.candidate_id),draft.candidate_ids);assert.ok(Object.values(run.costs_micros).every(v=>v===null));}
  for(const run of draft.runs)for(const row of run.outcomes)row.returned=false;
  await writeFile(path,JSON.stringify(draft));
  const evaluator=fileURLToPath(new URL('../scripts/evaluate-contact-benchmark.mjs',import.meta.url));
  const summary=JSON.parse(execFileSync(process.execPath,[evaluator,path],{encoding:'utf8'}));
  assert.equal(summary.runs[0].missing_results,3);assert.equal(summary.runs[0].total_cost_micros,null);assert.equal(summary.superiority_established,false);
  const reviewed='reviewer work must survive';await writeFile(path,reviewed);
  assert.throws(()=>execFileSync(process.execPath,[script,path,'3','trial_fixture'],{stdio:'pipe'}));
  assert.equal(await readFile(path,'utf8'),reviewed);
 }finally{await rm(directory,{recursive:true,force:true});}
});
