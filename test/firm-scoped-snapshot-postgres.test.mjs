import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {migrate} from '../migrate.mjs';
import {createFirmScopedSnapshotLoader} from '../firm-scoped-snapshot.mjs';

// Explicitly opt-in disposable PostgreSQL only; never use the app's DATABASE_URL.
for (const revoke of [false,true]) test('PostgreSQL firm snapshot '+(revoke?'refuses concurrent membership revocation':'keeps one read point across concurrent edits'),{
  skip:!process.env.POSTGRES_TEST_URL,timeout:30000
},async()=>{
  const schema='pp_snapshot_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1});
  const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:3,connectionTimeoutMillis:5000,options:`-c search_path=${schema} -c statement_timeout=10000`});
  let unblock,arrived,work;
  const reached=new Promise(resolve=>{arrived=resolve;});
  const gate=new Promise(resolve=>{unblock=resolve;});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await migrate({connect:()=>pool.connect(),end:async()=>{}});
    await pool.query(readFileSync(new URL('../schema-drafts/firm-preview-boundary.sql',import.meta.url),'utf8'));
    await pool.query(`INSERT INTO firm_workspaces(id,name,status) VALUES ('firm','Synthetic firm','active');
      INSERT INTO firm_members(firm_id,user_id,label,role,status,approved_by,approval_reference) VALUES
      ('firm','supervisor','Supervisor','supervisor','active','reviewer','fixture'),
      ('firm','source','Source','advisor','departed','reviewer','fixture'),
      ('firm','target','Target','advisor','active','reviewer','fixture');
      INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES ('contact','source','{}','["old:key"]');
      INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES ('lead','legacy','source','synthetic@example.test','{}');
      INSERT INTO firm_contact_assignments(contact_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ('contact','firm','source','firm_created','fixture','reviewer');
      INSERT INTO firm_lead_assignments(lead_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ('lead','firm','source','firm_created','fixture','reviewer');
      INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome) VALUES ('activity','lead','source','fixture','old');`);
    let paused=false;
    const instrumented={connect:async()=>{
      const client=await pool.connect();
      return {release:error=>client.release(error),query:async(sql,values)=>{
        const result=await client.query(sql,values);
        if(!paused&&sql.includes('FROM firm_contact_assignments')){paused=true;arrived();await gate;}
        return result;
      }};
    }};
    const auth={verifySessionCookie:async()=>({uid:'supervisor',email:'synthetic@example.test',email_verified:true,firebase:{sign_in_provider:'password'}}),
      getUser:async uid=>({uid,disabled:uid==='source',emailVerified:true})};
    work=createFirmScopedSnapshotLoader({pool:instrumented,auth,sessionCookie:'synthetic',firmId:'firm'})({sourceUid:'source',targetUid:'target'});
    // A rejected request must not leave the test waiting forever for the gate.
    await Promise.race([reached,work.then(()=>{throw Error('Snapshot bypassed test gate');})]);
    if(revoke)await pool.query("UPDATE firm_members SET status='suspended' WHERE user_id='supervisor'");
    else await pool.query(`BEGIN; UPDATE prospect_contacts SET identity_keys='["new:key"]' WHERE id='contact';
      UPDATE advisor_activities SET outcome='new' WHERE id='activity'; COMMIT;`);
    unblock();
    if(revoke)await assert.rejects(work,{status:403});
    else {
      const snapshot=await work;
      assert.deepEqual(snapshot.contacts[0].identity_keys,['old:key']);
      assert.equal(snapshot.activities[0].outcome,'old');
      assert.deepEqual((await pool.query('SELECT identity_keys FROM prospect_contacts')).rows[0].identity_keys,['new:key']);
    }
  } finally {
    unblock();await Promise.allSettled(work?[work]:[]);await pool.end();
    assert.match(schema,/^pp_snapshot_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
