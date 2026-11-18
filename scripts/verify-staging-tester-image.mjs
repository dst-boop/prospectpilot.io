// Synthetic exact-image + native PostgreSQL rehearsal. NOT real Google sign-in proof.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {runTesterAuthorityScenarios,testerProofConfig} from './staging-tester-proof-scenarios.mjs';
import pg from 'pg';
// Explicit reviewed-route candidate grants; not a general migration or production tool.
export const writableTables=Object.freeze(['prospect_contacts','prospect_imports','prospect_lists','prospect_list_members','prospect_saved_searches','prospect_identity_evidence','prospect_historical_reviews','prospect_historical_identifiers','lead_acquisitions','prospect_external_usage','discovery_users','discovery_leads','discovery_audit','lab_settings','lab_runs','lab_run_leads','lab_observations','lab_qualification','lab_identity_reviews','advisor_activities','advisor_contact_links','advisor_profiles','advisor_rest_periods']);
export const readableTables=Object.freeze(['employer_plan_catalog_summary','employer_plan_catalog','prospect_forgotten','prospect_list_shares','prospect_memberships','prospect_networking_captures','research_jobs','lab_tasks','lab_costs','lab_companies','lead_call_records','prospect_jobs','prospect_charges','prospect_tasks','prospectpilot_migrations','staging_pilot_identity']);
const valid=value=>/^prospectpilot_stg_[a-z0-9_]+$/.test(value||'');
export function stagingDatabaseGrants(database,role){
 if(!valid(database)||!valid(role))throw Error('Explicit staging database and role required');
 return `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE "${database}" TO "${role}"; GRANT USAGE ON SCHEMA public TO "${role}";`;
}
export function stagingTableGrants(role){
 if(!valid(role))throw Error('Explicit staging role required');
 return writableTables.map(t=>`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.${t} TO "${role}";`).join('\n')+'\n'+readableTables.map(t=>`GRANT SELECT ON TABLE public.${t} TO "${role}";`).join('\n');
}
export function stagingGrants(database,role){return stagingDatabaseGrants(database,role)+'\n'+stagingTableGrants(role);}

import {migrate} from '../migrate.mjs';
import {stagingConfig} from './staging-config.mjs';
import {assertStagingDatabase,createStagingHttpHandler} from './staging-runtime-guards.mjs';
import {createAuthenticatedStaging,fictionalCSV} from './staging-app.mjs';
if(process.argv.length!==3||process.argv[2]!=='--synthetic-image')throw Error('Explicit --synthetic-image required');
if(Object.entries(process.env).some(([k,v])=>/^PG/.test(k)&&v))throw Error('Inherited PG settings forbidden');
const url=new URL(process.env.STAGING_DATABASE_URL||'');
if(url.protocol!=='postgres:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username!=='postgres'||url.password!=='synthetic-ci-only'||url.pathname!=='/prospectpilot_test'||url.search||url.hash)throw Error('Only disposable loopback synthetic CI PostgreSQL is permitted');
const db={host:url.hostname,port:Number(url.port||5432),user:'postgres',password:'synthetic-ci-only',database:'prospectpilot_test',ssl:false,connectionTimeoutMillis:5000};
const config=testerProofConfig,project=config.project,suffix=randomBytes(6).toString('hex'),schema='public',database='prospectpilot_stg_'+suffix,initializer='prospectpilot_stg_init_'+suffix,runtime='prospectpilot_stg_app_'+suffix;
const password=randomBytes(24).toString('hex');
const admin=new pg.Client(db);await admin.connect();
if(!(await admin.query('SHOW server_version')).rows[0].server_version.startsWith('16.')){await admin.end();throw Error('Disposable PostgreSQL 16 required');}let pool,owner,server,proofError,external=0;
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{external++;throw Error('No external fetch permitted');};
try{
 await admin.query(`CREATE ROLE ${initializer} LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
 await admin.query(`CREATE ROLE ${runtime} LOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
 await admin.query(`CREATE DATABASE ${database} OWNER ${initializer}`);
 await migrate(new pg.Pool({...db,database,user:initializer,password}));
 owner=new pg.Pool({...db,database,user:initializer,password});pool=owner;
 await pool.query('CREATE TABLE staging_pilot_identity(singleton boolean PRIMARY KEY CHECK(singleton),project_id text,owner_uid text,expires_at timestamptz)');
 await assert.rejects(assertStagingDatabase(pool,config));
 await pool.query('INSERT INTO staging_pilot_identity VALUES(true,$1,$2,$3)',[project,config.uid,new Date(config.expires)]);
 await assertStagingDatabase(pool,config);
 for(const change of [{project:'production'},{uid:'other'},{expires:config.expires+1}])await assert.rejects(assertStagingDatabase(pool,{...config,...change}));
 await owner.query(stagingGrants(database,runtime));
 pool=new pg.Pool({...db,database,user:runtime,password,max:2});
 assert.equal((await pool.query('SELECT current_user')).rows[0].current_user,runtime);
 const attrs=(await pool.query('SELECT rolsuper,rolcreaterole,rolcreatedb,rolinherit,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.ok(Object.values(attrs).every(v=>v===false));
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);

 for(const sql of ['CREATE TABLE forbidden(x int)','ALTER TABLE prospect_contacts ADD COLUMN forbidden int','DROP TABLE prospect_contacts','TRUNCATE prospect_contacts','DELETE FROM employer_plan_catalog_summary','DELETE FROM employer_plan_catalog','UPDATE employer_plan_catalog SET payload=payload','UPDATE staging_pilot_identity SET owner_uid=owner_uid',"INSERT INTO staging_pilot_identity VALUES(false,'forbidden','forbidden',now())","INSERT INTO prospectpilot_migrations(id) VALUES('forbidden')",'DELETE FROM prospectpilot_migrations'])await assert.rejects(pool.query(sql),e=>e.code==='42501');
 await assertStagingDatabase(pool,config);
 await runTesterAuthorityScenarios({pool,seedPool:owner});
 assert.equal(external,0);
 console.log(JSON.stringify({verified:true,database:'PostgreSQL 16 actual restricted LOGIN; exact existing grant manifest',scope:'two admitted synthetic identities; same fixture both arrival orders; cross-user objects; historical create/update collisions; binding removal; admin/share denials; no observed external fetch',auth:'injected synthetic adapter only, no real Google/IAP or tester access'}));
 }catch(error){proofError=error;throw error;}
 finally{
  globalThis.fetch=originalFetch;const cleanupErrors=[];
  const clean=async(action)=>{try{await action();}catch(error){cleanupErrors.push(error);}};
  if(server)await clean(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await clean(()=>pool?.end());if(owner!==pool)await clean(()=>owner?.end());
  await clean(()=>admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
  await clean(()=>admin.query(`DROP ROLE IF EXISTS ${runtime}`));
  await clean(()=>admin.query(`DROP ROLE IF EXISTS ${initializer}`));await clean(()=>admin.end());
  if(cleanupErrors.length){console.error(JSON.stringify({cleanup_failed:true,count:cleanupErrors.length}));if(!proofError)throw new AggregateError(cleanupErrors,'Synthetic proof cleanup failed');}
 }
