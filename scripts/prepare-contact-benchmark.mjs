import {writeFile} from 'node:fs/promises';

const [path,countText='300',cohort_id='contact_trial']=process.argv.slice(2);
if(!path||process.argv.length>5)throw Error('Usage: node scripts/prepare-contact-benchmark.mjs output.json [candidate-count] [opaque-cohort-id]');
const count=Number(countText);
if(!Number.isSafeInteger(count)||count<1||count>100000)throw Error('Choose 1–100,000 candidates.');
if(!/^[A-Za-z0-9_-]{1,100}$/.test(cohort_id))throw Error('Use an opaque cohort ID, not personal information.');
const candidate_ids=Array.from({length:count},(_,i)=>'candidate_'+String(i+1).padStart(6,'0'));
const input={schema_version:1,cohort_id,candidate_ids,runs:['prospectpilot','wiza'].map(label=>({label,outcomes:candidate_ids.map(candidate_id=>({candidate_id,returned:null})),costs_micros:{provider:null,subscription:null,labor:null,infrastructure:null,export:null},user_seconds:null}))};
// Exclusive creation prevents an accidental rerun from replacing reviewer work.
await writeFile(path,JSON.stringify(input,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Prepared ${count} candidate slots for each run. No outcomes or costs have been measured. Replace every returned:null before evaluation; retain the person-to-ID mapping separately.`);
