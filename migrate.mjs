import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import pg from 'pg';
import {readFileSync} from 'node:fs';
export async function migrate(pool){
 let client,broken;
 try{
  client=await pool.connect();
  await client.query('BEGIN');
  // Fail promptly under contention rather than blocking a live application.
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  await client.query('SELECT pg_advisory_xact_lock(505002)');
  await client.query('CREATE TABLE IF NOT EXISTS prospectpilot_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for(const [id,file] of [['001','generated/schema.sql'],['002','migrations/002-query-indexes.sql'],['003','migrations/003-linkedin.sql'],['004','migrations/004-research-jobs.sql'],['005','migrations/005-research-history-index.sql'],['006','migrations/006-research-lab.sql'],['007','migrations/007-quality-v2.sql'],['008','migrations/008-prospect-workspace.sql'],['009','migrations/009-prospect-jobs.sql'],['010','migrations/010-plan-latest-filing.sql'],['011','migrations/011-email-domain-check.sql'],['012','migrations/012-plan-catalog-summary.sql']]){
   if((await client.query('SELECT id FROM prospectpilot_migrations WHERE id=$1',[id])).rowCount)continue;
   await client.query(readFileSync(new URL(file,import.meta.url),'utf8'));
   await client.query('INSERT INTO prospectpilot_migrations(id) VALUES($1)',[id]);
  }
  await client.query('COMMIT');
 }catch(error){if(client){try{await client.query('ROLLBACK');}catch(rollbackError){broken=rollbackError;}}throw error;}
 finally{client?.release(broken);await pool.end();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 await migrate(new pg.Pool({max:1,connectionTimeoutMillis:10_000,application_name:'prospectpilot-migrate'}));
 console.log('Database schema ready.');
}
