// Native synthetic initial-migration rehearsal only. Never production config.
import {validateStagingDatabaseUrl} from '../test/helpers/staging-database.mjs';
export function validateInitial034Environment(env){
 if(env.NODE_ENV==='production')throw Error('Initial034 rehearsal refuses production mode');
 const config=validateStagingDatabaseUrl(env);
 if(!config||config.host!=='127.0.0.1')throw Error('Initial034 requires explicit disposable literal-loopback PostgreSQL');
 if(!/^[a-f0-9]{64}$/.test(env.SYNTHETIC_POSTGRES_CONTAINER||''))throw Error('Exact local CI PostgreSQL container ID required');
 return {connectionString:env.STAGING_DATABASE_URL||env.POSTGRES_TEST_URL,containerId:env.SYNTHETIC_POSTGRES_CONTAINER};
}
export function initial034ChildEnvironment(env){
 const validated=validateInitial034Environment(env);
 const clean={NODE_ENV:'test',INITIAL034_NATIVE_REQUIRED:'1',SYNTHETIC_STAGING:'1',STAGING_DATABASE_URL:validated.connectionString,POSTGRES_TEST_URL:validated.connectionString,SYNTHETIC_POSTGRES_CONTAINER:validated.containerId};
 for(const key of ['PATH','HOME','TMPDIR','TMP','TEMP'])if(env[key])clean[key]=env[key];
 return clean;
}
