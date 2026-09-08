import {readFileSync,writeFileSync} from 'node:fs';
import {fingerprint,validateAccuracy} from './research-release-gate.mjs';
const [mode,input,output]=process.argv.slice(2);
if(!input||!output||!['prepare','validate'].includes(mode))throw Error('Usage: node research-benchmark.mjs prepare|validate input.json output.json');
const data=JSON.parse(readFileSync(input,'utf8'));
if(mode==='prepare'){
 if(!Array.isArray(data))throw Error('Input must be an array of captured cases.');
 const cases=data.map(c=>({id:c.id,category:c.category,source_url:c.source_url,lead:c.lead,predicted:c.predicted,expected:null,correct:null,reviewed_by:null}));
 writeFileSync(output,JSON.stringify({source_fingerprint:fingerprint(),independent_review:false,reviewer:null,implementable:false,cases},null,2),{flag:'wx'});
}else{
 const reason=validateAccuracy(data,fingerprint());if(reason)throw Error(reason);
 writeFileSync(output,JSON.stringify(data,null,2),{flag:'wx'});
}
