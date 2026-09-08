import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
export function fingerprint(){
 const files=JSON.parse(readFileSync(new URL('review-files.json',import.meta.url),'utf8')).filter(f=>!f.endsWith('.md'));
 const hash=createHash('sha256');for(const f of [...files].sort())hash.update(f).update(readFileSync(new URL(f,import.meta.url)));return hash.digest('hex');
}
export function validateAccuracy(report,current){
 if(!report||report.source_fingerprint!==current)return 'No independently reviewed benchmark exists for this exact package.';
 if(report.independent_review!==true||!report.reviewer||report.implementable!==true)return 'Independent accuracy and implementation review is incomplete.';
 if(!Array.isArray(report.cases)||report.cases.length<600)return 'At least 600 independently labeled benchmark cases are required.';
 const ids=new Set();const categories=new Map();let correct=0;
 for(const c of report.cases){
  if(!c.id||ids.has(c.id)||!c.source_url||!c.reviewed_by||typeof c.correct!=='boolean')return 'Benchmark evidence is incomplete or duplicated.';
  ids.add(c.id);categories.set(c.category,(categories.get(c.category)||0)+1);if(c.correct)correct++;
 }
 const required=['website','registry','license','professional','announcement','news','association','maps','sec','expertise','warn','mwbe'];
 if(required.some(c=>(categories.get(c)||0)<30))return 'Every source category needs at least 30 independently reviewed cases.';
 // Conservative acceptance: zero errors and a one-sided 95% exact lower bound >=99.5%.
 if(correct!==report.cases.length||Math.pow(0.05,1/correct)<0.995)return 'The benchmark does not support the required 99.5% accuracy threshold.';
 return null;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.log('Accuracy deployment gate removed by user request. Benchmark validation is optional; deployment tests still apply.');
}
