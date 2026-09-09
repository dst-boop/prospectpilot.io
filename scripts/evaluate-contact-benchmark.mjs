import {readFile} from 'node:fs/promises';
import {evaluateContactBenchmark} from '../contact-benchmark.mjs';
const path=process.argv[2];
if(!path)throw Error('Usage: node scripts/evaluate-contact-benchmark.mjs path/to/benchmark.json');
const input=await readFile(path);
if(input.byteLength>20_000_000)throw Error('Benchmark input exceeds 20 MB.');
console.log(JSON.stringify(evaluateContactBenchmark(JSON.parse(input)),null,2));
