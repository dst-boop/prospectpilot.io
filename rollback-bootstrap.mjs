// Explicit rollback entrypoints only. Normal startup remains unchanged.
// Hold the migration runner's shared advisory lock for this process lifetime.
// This does not fence arbitrary DDL, old revisions, or external schedulers.
import {verifyRollbackSchema} from './rollback-schema.mjs';
export async function startRollbackRuntime({client,start,verify=verifyRollbackSchema}) {
 let connected=false;
 try {
  await client.connect();connected=true;
  const lock=await client.query('SELECT pg_try_advisory_lock_shared(505002) AS locked');
  if(lock.rows[0]?.locked!==true)throw Error('Rollback schema is being changed; startup refused');
  await verify(client);
  await start();
  return {close:()=>client.end()};
 }catch(error){if(connected)await client.end().catch(()=>{});throw error;}
}
export function validateRollbackEnvironment(env,role){
 if(!['web','worker'].includes(role))throw Error('Invalid rollback role');
 if(env.PGOPTIONS)throw Error('Rollback entrypoints refuse PGOPTIONS to keep guard and runtime connection settings aligned');
 if(env.PROSPECTPILOT_READ_ONLY&&env.PROSPECTPILOT_READ_ONLY!=='false')throw Error('Full-function rollback refuses implicit read-only degradation');
 for(const key of ['GOOGLE_CLOUD_PROJECT','OWNER_EMAIL','PGHOST','PGDATABASE','PGUSER','PGPASSWORD'])if(!env[key])throw Error('Missing '+key);
}
export async function runRollbackEntrypoint(role){
 validateRollbackEnvironment(process.env,role);
 const {default:pg}=await import('pg');
 const client=new pg.Client({connectionTimeoutMillis:10000,statement_timeout:30000,options:'-c lock_timeout=5000',application_name:'prospectpilot-rollback-guard'});
 // Losing the guard connection loses the lock; terminate instead of serving unguarded.
 client.on('error',()=>{console.error('Rollback schema guard connection lost; exiting');process.exit(1);});
 const guard=await startRollbackRuntime({client,start:()=>role==='web'?import('./server.mjs'):import('./research-worker.mjs')});
 if(role==='worker')await guard.close();
 // Web guard remains connected until server shutdown exits the process.
}
