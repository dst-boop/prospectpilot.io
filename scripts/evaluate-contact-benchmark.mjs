import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {evaluateContactBenchmark} from '../contact-benchmark.mjs';
const path=process.argv[2];
if(!path)throw Error('Usage: node scripts/evaluate-contact-benchmark.mjs path/to/benchmark.json');
const limit=20_000_000;
if((await stat(path)).size>limit)throw Error('Benchmark input exceeds 20 MB.');
const chunks=[];let bytes=0;
for await(const chunk of createReadStream(path,{highWaterMark:65536})){
 bytes+=chunk.length;if(bytes>limit)throw Error('Benchmark input exceeds 20 MB.');
 chunks.push(chunk);
}
let input;try{input=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));}catch{throw Error('Benchmark input must be valid JSON. File contents are omitted from this error.');}
console.log(JSON.stringify(evaluateContactBenchmark(input),null,2));
