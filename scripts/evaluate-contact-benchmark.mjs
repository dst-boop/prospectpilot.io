import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {evaluateContactBenchmark} from '../contact-benchmark.mjs';
const path=process.argv[2];
const args=process.argv.slice(3),requiredLabel=args[1];
if(!path||args.length&&(args.length!==2||args[0]!=='--require-cost-ceiling'||!/^[A-Za-z0-9_-]{1,100}$/.test(requiredLabel)))throw Error('Usage: node scripts/evaluate-contact-benchmark.mjs path/to/benchmark.json [--require-cost-ceiling run_label]');
const limit=20_000_000;
if((await stat(path)).size>limit)throw Error('Benchmark input exceeds 20 MB.');
const chunks=[];let bytes=0;
for await(const chunk of createReadStream(path,{highWaterMark:65536})){
 bytes+=chunk.length;if(bytes>limit)throw Error('Benchmark input exceeds 20 MB.');
 chunks.push(chunk);
}
let input;try{input=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}catch{throw Error('Benchmark input must be valid JSON. File contents are omitted from this error.');}
const result=evaluateContactBenchmark(input);
const selected=requiredLabel?result.runs.find(run=>run.label===requiredLabel):null;
if(requiredLabel&&!selected)throw Error('The required cost-ceiling run label was not found.');
console.log(JSON.stringify(result,null,2));
if(selected&&selected.cost_ceiling_assessment.status!=='pass'){
 console.error('The selected run has not met the $2 all-in usable-lead cost ceiling.');
 process.exitCode=2;
}
