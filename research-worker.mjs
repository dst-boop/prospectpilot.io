import {createResearchLab} from './research-lab.mjs';
import {createLabSources} from './lab-sources.mjs';
import pg from 'pg';import worker from './generated/worker.mjs';import {createDatabase} from './database.mjs';import {createResearchJobs} from './research-jobs.mjs';import {createNativeResearch,publicGet} from './native-research.mjs';import {createWarnService} from './warn.mjs';
const pool=new pg.Pool({max:3,connectionTimeoutMillis:10000,statement_timeout:30000});
const db=createDatabase(pool),native=createNativeResearch({warn:createWarnService({get:publicGet})});
const lab=createResearchLab({pool,sources:createLabSources({warn:createWarnService({get:publicGet}),searchKey:process.env.BRAVE_SEARCH_API_KEY||'',searchCostMicros:process.env.BRAVE_QUERY_COST_MICROS===undefined?null:Number(process.env.BRAVE_QUERY_COST_MICROS)})});
let stop=false;process.on('SIGTERM',()=>{stop=true;});
const queue=createResearchJobs({pool,runSource:async(job,source)=>{
 const response=await worker.fetch(new Request('https://prospectpilot.io/api/research/auto',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':job.user_id,'oai-authenticated-user-email':job.user_email},body:JSON.stringify({lead_id:job.lead_id,source,identity_signature:job.identity_signature})}),{DB:db,NATIVE_RESEARCH:native});
 const data=await response.json();if(!response.ok){const e=Error('Research source failed');e.status=response.status;throw e;}return data;
}});
try{await lab.scheduleDue();const until=Date.now()+12*60*1000;let idle=0;while(!stop&&Date.now()<until){if(await lab.tick() || await queue.tick()){idle=0;continue;}if(++idle>16)break;await new Promise(r=>setTimeout(r,5000));}}finally{await pool.end();}
