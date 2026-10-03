// Cost per lead for every advisor, as CSV on stdout: one row per advisor and
// period. For the operator, run against the production database (the same PG*
// settings as migrate.mjs, e.g. through the Cloud SQL Auth Proxy):
//   node scripts/lead-costs/report.mjs --period month --from 2026-04-01 --to 2026-09-30 --tz America/New_York
// Advisors appear by Firebase uid; the output holds ids, counts and money only.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {leadCosts,leadCostCSV} from '../../lead-costs.mjs';

export function reportArgs(argv){
 const input={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i]?.replace(/^--/,'');if(!['period','from','to','tz'].includes(key)||argv[i+1]===undefined)throw Error('Usage: report.mjs [--period day|week|month] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz Area/City]');
  input[key]=argv[i+1];
 }
 return input;
}
export async function report(db,argv){return leadCostCSV(await leadCosts(db,reportArgs(argv),{userId:null}));}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const {default:pg}=await import('pg');
 const pool=new pg.Pool({max:2,connectionTimeoutMillis:10_000,application_name:'prospectpilot-lead-costs'});
 try{process.stdout.write(await report(pool,process.argv.slice(2)));}
 catch(e){console.error(e.message);process.exitCode=1;}
 finally{await pool.end();}
}
