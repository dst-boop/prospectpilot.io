// One-shot, explicit empty staging database only; no production entrypoint imports.
import pg from 'pg';
import {stagingConfig} from './staging-config.mjs';
import {migrate} from '../migrate.mjs';
const config=stagingConfig(process.env);
if(process.env.STAGING_INITIALIZE_EMPTY_DATABASE!==config.database)throw Error('Explicit empty staging database initialization required');
const pool=new pg.Pool(config.db);
try{
 const tables=(await pool.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0];
 if(Number(tables.n)!==0)throw Error('Refusing to initialize a nonempty database');
 await migrate({connect:()=>pool.connect(),end:async()=>{}});
 await pool.query('CREATE TABLE staging_pilot_identity(singleton boolean PRIMARY KEY CHECK(singleton),project_id text NOT NULL,owner_uid text NOT NULL,expires_at timestamptz NOT NULL)');
 await pool.query('INSERT INTO staging_pilot_identity VALUES(true,$1,$2,$3)',[config.project,config.uid,new Date(config.expires)]);
 console.log('Empty staging database initialized. No contacts seeded; import the supplied fictional CSV after real owner sign-in.');
}finally{await pool.end();}
