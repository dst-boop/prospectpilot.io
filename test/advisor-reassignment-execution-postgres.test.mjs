import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createReassignmentExecutionService} from '../advisor-reassignment-execution.mjs';
import {requestFor,fixtureSchema,seedFixture,syntheticAdapter} from './fixtures/reassignment-execution-fixture.mjs';

// Opt-in disposable PostgreSQL only. No application connection or credentials
// are consulted. This exercises the synthetic contract, not legacy ownership.
for(const replay of [true,false])test('PostgreSQL serializes concurrent '+(replay?'idempotent replay':'competing stale transfer'),{
  skip:!process.env.POSTGRES_TEST_URL,timeout:30000
},async()=>{
  const schema='pp_transfer_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:1,connectionTimeoutMillis:5000});
  const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,max:4,connectionTimeoutMillis:5000,
    options:`-c search_path=${schema} -c statement_timeout=10000`});
  let unblock,arrived,secondStarted,first,second;
  const gate=new Promise(resolve=>{unblock=resolve;});
  const reached=new Promise(resolve=>{arrived=resolve;});
  const secondEntered=new Promise(resolve=>{secondStarted=resolve;});
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);await pool.query(fixtureSchema);await seedFixture(pool.query.bind(pool));
    const firstAdapter=syntheticAdapter({beforeCas:async()=>{arrived();await gate;}});
    first=createReassignmentExecutionService({pool,adapter:firstAdapter})(requestFor());
    await Promise.race([reached,first.then(()=>{throw Error('Fixture bypassed concurrency gate');})]);
    const secondPool={connect:async()=>{const client=await pool.connect();return {release:error=>client.release(error),query:async(sql,args)=>{
      const result=client.query(sql,args);
      if(sql.includes('SELECT snapshot FROM reassignment_fixture_state'))secondStarted();
      return result;
    }};}};
    const secondRequest=requestFor(undefined,replay?{}:{idempotencyKey:'competing-key'});
    second=createReassignmentExecutionService({pool:secondPool,adapter:syntheticAdapter()})(secondRequest);
    await Promise.race([secondEntered,second.then(()=>{throw Error('Second call bypassed authorization lock');})]);
    unblock();
    const results=await Promise.allSettled([first,second]);
    assert.equal(results[0].status,'fulfilled');
    // PostgreSQL can reject the blocked serializable reader with 40001. The
    // caller resolves it by the SAME idempotency key, never automatic blind retry.
    if(results[1].status==='rejected')assert.ok([409,503].includes(results[1].reason.status));
    else {assert.equal(replay,true);assert.equal(results[1].value.replayed,true);}
    const retry=createReassignmentExecutionService({pool,adapter:syntheticAdapter()});
    if(replay){const result=await retry(secondRequest);assert.equal(result.replayed,true);assert.deepEqual(result.receipt,results[0].value.receipt);}
    else await assert.rejects(retry(secondRequest),{status:409});
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM reassignment_fixture_receipts')).rows[0].count,1);
  } finally {
    unblock();await Promise.allSettled([first,second].filter(Boolean));await pool.end();
    assert.match(schema,/^pp_transfer_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
