import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createLegacyOwnerRecoveryInspector} from '../legacy-owner-recovery.mjs';

// Explicit disposable test database only. No DATABASE_URL or production fallback.
for(const revoke of [false,true])test('PostgreSQL legacy inspection '+(revoke?'refuses concurrent admin revocation':'returns the earlier count after concurrent ownership change'),{
  skip:!process.env.POSTGRES_TEST_URL,timeout:30000
},async()=>{
  const schema='pp_recovery_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1,connectionTimeoutMillis:5000});
  const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:3,connectionTimeoutMillis:5000,options:`-c search_path=${schema} -c statement_timeout=10000`});
  let unblock,arrived,work;
  const reached=new Promise(resolve=>{arrived=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});
  try{
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
    await pool.query(`INSERT INTO discovery_users(user_id,email,full_name,role) VALUES ('operator','synthetic@example.test','Synthetic admin','admin');
      INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES ('synthetic-lead','legacy','','display@example.test','{}');`);
    const instrumented={connect:async()=>{
      const client=await pool.connect();
      return {release:error=>client.release(error),query:async(sql,values)=>{
        const result=await client.query(sql,values);
        if(sql.includes('FROM discovery_leads')){arrived();await gate;}
        return result;
      }};
    }};
    const auth={verifySessionCookie:async()=>({uid:'operator',email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'password'}})};
    work=createLegacyOwnerRecoveryInspector({pool:instrumented,auth,sessionCookie:'synthetic',operatorUids:['operator'],legacyTeam:'legacy'})();
    await Promise.race([reached,work.then(()=>{throw Error('Inspector bypassed test gate');})]);
    if(revoke)await pool.query("UPDATE discovery_users SET role='advisor' WHERE user_id='operator'");
    else await pool.query("UPDATE discovery_leads SET owner_user_id='assigned-elsewhere' WHERE id='synthetic-lead'");
    unblock();
    if(revoke)await assert.rejects(work,{status:403});
    else{
      const result=await work;assert.equal(result.counts.total,1);assert.equal(result.can_execute,false);
      assert.equal((await pool.query('SELECT owner_user_id FROM discovery_leads')).rows[0].owner_user_id,'assigned-elsewhere');
    }
  }finally{
    unblock();await Promise.allSettled(work?[work]:[]);await pool.end();
    assert.match(schema,/^pp_recovery_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
