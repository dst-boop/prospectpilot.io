import test, {before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createLegacyOwnerRecoveryInspector} from '../legacy-owner-recovery.mjs';

let db, queries, authCalls, releases, beforeQuery, afterQuery;
const claims = {uid:'admin-uid',email:'recycled@example.test',email_verified:true,firebase:{sign_in_provider:'password'}};
const auth = {verifySessionCookie:async(cookie,revoked)=>{authCalls.push([cookie,revoked]);return claims;}};
const pool = {connect:async()=>({query:async(sql,values)=>{
  queries.push({sql,values});
  const replacement = await beforeQuery?.(sql,values);
  const result = replacement ?? await db.query(sql,values);
  await afterQuery?.(sql,values,result);
  return result;
},release:error=>releases.push(error)})};
const inspector = (options={}) => createLegacyOwnerRecoveryInspector({pool,auth,sessionCookie:'synthetic-session',operatorUids:['admin-uid'],legacyTeam:'legacy-team',...options});
const inventory = async()=>(await db.query('SELECT * FROM discovery_leads ORDER BY id')).rows;
before(async()=>{
  db=new PGlite();
  await db.exec(readFileSync(new URL('../generated/schema.sql',import.meta.url),'utf8'));
  // Current schema forbids NULL. This simulates imported legacy data ONLY here.
  await db.exec('ALTER TABLE discovery_leads ALTER COLUMN owner_user_id DROP NOT NULL');
});
after(async()=>{await db.close();});
beforeEach(async()=>{
  await db.exec(`TRUNCATE discovery_leads,discovery_users;
    INSERT INTO discovery_users(user_id,email,full_name,role) VALUES
      ('admin-uid','recycled@example.test','Synthetic admin','admin'),
      ('advisor-uid','advisor@example.test','Synthetic advisor','advisor'),
      ('other-admin','other@example.test','Other admin','admin');`);
  const owners = [null,'',' ','\t\n\r\f\v','\u00a0\ufeff','\u2000\u2028\u3000','owner-uid','missing-account-uid',' uid-with-spaces ','\u200b'];
  for (const [index,owner] of owners.entries()) await db.query(
    'INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',
    ['private-id-'+index,'legacy-team',owner,'recycled@example.test',JSON.stringify({notes:'PRIVATE-NOTES',shared_with:['shared@example.test']})]);
  await db.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',
    ['other-team-id','other-team',null,'private@example.test','malformed-private-payload']);
  queries=[];authCalls=[];releases=[];beforeQuery=null;afterQuery=null;
});

test('counts only null/blank UIDs in the selected legacy team without inferring recovery eligibility',async()=>{
  const original=await inventory(),result=await inspector()();
  assert.deepEqual(result.counts,{null_uid:1,empty_uid:1,whitespace_uid:4,total:6});
  assert.equal(result.mode,'aggregate_count_only');assert.equal(result.can_execute,false);
  assert.equal(result.recovery_eligible,false);assert.equal(result.production_ready,false);
  assert.equal(result.coverage.owner_identity,false);assert.equal(result.coverage.sharing,false);
  assert.equal(result.coverage.nonblank_uid_validity,false);assert.equal(result.coverage.firm_assignment,false);
  assert.equal(result.blockers.length,4);assert.deepEqual(await inventory(),original,'no row, sharing, author or timestamp change');
  const text=JSON.stringify(result);
  for (const secret of ['private-id','other-team','PRIVATE-NOTES','shared@example.test','recycled@example.test','admin-uid','synthetic-session','missing-account-uid']) assert.ok(!text.includes(secret),secret);
  assert.deepEqual(authCalls,[['synthetic-session',true],['synthetic-session',true]]);
  assert.deepEqual(releases,[undefined]);
  assert.ok(queries.every(q=>/^(SELECT|BEGIN|SET LOCAL|COMMIT)/.test(q.sql)));
  assert.equal(queries.filter(q=>q.sql.includes('FROM discovery_leads')).length,1);
  assert.equal(queries.filter(q=>q.sql.includes('FROM discovery_users')).length,2);
  assert.ok(queries.every(q=>!/(owner_email|payload|firm_|shared_with|UPDATE |INSERT |DELETE )/i.test(q.sql)));
});

test('zero candidates still cannot execute or certify ownership and rights',async()=>{
  await db.query("DELETE FROM discovery_leads WHERE owner_user_id IS NULL OR length(btrim(owner_user_id))=0");
  await db.query("DELETE FROM discovery_leads WHERE id IN ('private-id-3','private-id-4','private-id-5')");
  const result=await inspector()();assert.equal(result.counts.total,0);assert.equal(result.can_execute,false);assert.equal(result.blockers.length,4);
});

test('configuration is fail closed, without connecting to a database',()=>{
  for (const options of [{pool:{}},{auth:{}},{legacyTeam:''},{legacyTeam:'\n'},{operatorUids:[]},{operatorUids:['']},{operatorUids:['\t']},{operatorUids:Array(17).fill('admin-uid')}])
    assert.throws(()=>inspector(options),{status:503});
  assert.deepEqual(queries,[]);
});

test('invalid or revoked authentication never reaches the database',async()=>{
  for(const invalid of [null,{...claims,uid:''},{...claims,uid:' '.repeat(2)},{...claims,email_verified:false},{...claims,email:'invalid'}, {...claims,firebase:{sign_in_provider:'anonymous'}}])
    await assert.rejects(inspector({auth:{verifySessionCookie:async()=>invalid}})(),{status:401});
  await assert.rejects(inspector({auth:{verifySessionCookie:async()=>{throw new Error('TOKEN-SECRET');}}})(),e=>e.status===401&&!e.message.includes('SECRET'));
  for(const sessionCookie of [null,'','a'.repeat(16385)])await assert.rejects(inspector({sessionCookie})(),{status:401});
  assert.deepEqual(queries,[]);
});

test('same verified email and client admin/firm claims do not grant the narrow operator permission',async()=>{
  for(const uid of ['recycled-new-uid','advisor-uid','other-admin'])
    await assert.rejects(inspector({auth:{verifySessionCookie:async()=>({...claims,uid,role:'admin',admin:true,firm:'owner'})}})(),{status:403});
  assert.deepEqual(queries,[]);
});

test('allowlist is not a database administrator grant and is copied at construction',async()=>{
  const operatorUids=['advisor-uid'];
  const review=inspector({operatorUids,auth:{verifySessionCookie:async()=>({...claims,uid:'advisor-uid',role:'admin'})}});
  await assert.rejects(review(),{status:403});
  assert.ok(queries.every(q=>!q.sql.includes('FROM discovery_leads')));
  const copied=inspector({operatorUids});operatorUids.push('admin-uid');
  await assert.rejects(copied(),{status:403});
});

test('no caller can select an email, record, target owner, firm or alternate team',async()=>{
  for(const input of [{},{email:'recycled@example.test'},{ids:['private-id-0']},{targetUid:'admin-uid'},{legacyTeam:'other-team'},null,undefined])
    await assert.rejects(inspector()(input),{status:422});
  assert.deepEqual(queries,[]);assert.deepEqual(authCalls,[]);
});

test('single use prevents request reuse, including concurrent and failed calls',async()=>{
  const read=inspector(),first=read();await assert.rejects(read(),{status:403});await first;
  await assert.rejects(read(),{status:403});
  const bad=inspector();await assert.rejects(bad({}),{status:422});await assert.rejects(bad(),{status:403});
});

test('exact UID binding handles unusual values without normalization or SQL interpolation',async()=>{
  const unusual=" \u00e9'\";-- ";
  await db.query('UPDATE discovery_users SET user_id=$1 WHERE user_id=$2',[unusual,'admin-uid']);
  const result=await inspector({operatorUids:[unusual],auth:{verifySessionCookie:async()=>({...claims,uid:unusual})}})();
  assert.equal(result.counts.total,6);
  assert.ok(queries.every(q=>!q.sql.includes(unusual)));
  assert.ok(queries.filter(q=>q.sql.includes('FROM discovery_users')).every(q=>q.values[0]===unusual));
});

test('both transactions verify isolation and read-only enforcement and apply local timeouts',async()=>{
  await inspector()();
  assert.equal(queries[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.ok(queries.some(q=>q.sql==='BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY'));
  for(const setting of ['statement_timeout','lock_timeout','idle_in_transaction_session_timeout'])
    assert.equal(queries.filter(q=>q.sql.startsWith('SET LOCAL '+setting)).length,2);
});

for (const stage of [1,2]) test('transaction downgrade is refused at stage '+stage,async()=>{
  let settings=0;
  beforeQuery=async sql=>sql.includes('current_setting')&&++settings===stage?{rows:[{isolation:stage===1?'read committed':'repeatable read',read_only:'off'}]}:undefined;
  await assert.rejects(inspector()(),{status:503});assert.equal(queries.at(-1).sql,'ROLLBACK');
  if(stage===1)assert.ok(queries.every(q=>!q.sql.includes('FROM discovery_leads')));
});

test('database read-only mode really refuses a mutation during the inspection',async()=>{
  const original=await inventory();
  beforeQuery=async sql=>{if(sql.includes('FROM discovery_leads'))await db.query("UPDATE discovery_leads SET owner_user_id='attacker'");};
  await assert.rejects(inspector()(),{status:503});assert.deepEqual(await inventory(),original);
});

test('a demoted admin is refused at the fresh post-count read point',async()=>{
  let committed=false;
  afterQuery=async sql=>{if(sql==='COMMIT'&&!committed){committed=true;await db.query("UPDATE discovery_users SET role='advisor' WHERE user_id='admin-uid'");}};
  await assert.rejects(inspector()(),{status:403});
  assert.equal(queries.filter(q=>q.sql.includes('FROM discovery_leads')).length,1);
  assert.equal(queries.at(-1).sql,'ROLLBACK');
});

test('session revocation or changing identity at the final check discards all counts',async()=>{
  for(const mode of ['revoked','different']){
    let calls=0;
    const changing={verifySessionCookie:async()=>{if(++calls===1)return claims;if(mode==='revoked')throw new Error('private revocation');return {...claims,uid:'other-admin'};}};
    await assert.rejects(inspector({auth:changing,operatorUids:['admin-uid','other-admin']})(),{status:mode==='revoked'?401:403});
    assert.equal(queries.at(-1).sql,'ROLLBACK');
  }
});

for (const field of ['null_uid','empty_uid','whitespace_uid']) test('malformed or overflowing '+field+' counts fail closed',async()=>{
  for(const value of ['-1','01','0.1','NaN','9007199254740992',0,null,{private:'ROW-SECRET'}]){
    beforeQuery=async sql=>sql.includes('FROM discovery_leads')?{rows:[{null_uid:'1',empty_uid:'1',whitespace_uid:'1',[field]:value}]}:undefined;
    await assert.rejects(inspector()(),{status:503});
  }
});

test('unexpected extra aggregate columns are never returned and unsafe sum is refused',async()=>{
  beforeQuery=async sql=>sql.includes('FROM discovery_leads')?{rows:[{null_uid:'1',empty_uid:'1',whitespace_uid:'1',secret:'PRIVATE-ROW'}]}:undefined;
  assert.ok(!JSON.stringify(await inspector()()).includes('PRIVATE-ROW'));
  beforeQuery=async sql=>sql.includes('FROM discovery_leads')?{rows:[{null_uid:'9007199254740991',empty_uid:'1',whitespace_uid:'0'}]}:undefined;
  await assert.rejects(inspector()(),{status:503});
});

test('query errors cannot smuggle trusted-looking status codes, causes or row values',async()=>{
  beforeQuery=async sql=>{if(sql.includes('FROM discovery_leads'))throw Object.assign(new Error('PRIVATE-ROW'),{status:403,cause:'TOKEN'});};
  await assert.rejects(inspector()(),e=>e.status===503&&!e.message.includes('PRIVATE')&&!('cause' in e));
  assert.equal(queries.at(-1).sql,'ROLLBACK');assert.deepEqual(releases,[undefined]);
});

test('connect and release errors are sanitized',async()=>{
  await assert.rejects(inspector({pool:{connect:async()=>{throw new Error('DATABASE-SECRET');}}})(),e=>e.status===503&&!e.message.includes('SECRET'));
  const badRelease={connect:async()=>({query:(...args)=>db.query(...args),release(){throw new Error('RELEASE-SECRET');}})};
  await assert.rejects(inspector({pool:badRelease})(),e=>e.status===503&&!e.message.includes('SECRET'));
});

test('rollback failure evicts the connection without leaking error data',async()=>{
  beforeQuery=async sql=>{if(sql.includes('FROM discovery_leads')||sql==='ROLLBACK')throw new Error('DATABASE-SECRET');};
  await assert.rejects(inspector()(),{status:503});assert.equal(releases.length,1);assert.ok(releases[0] instanceof Error);assert.ok(!releases[0].message.includes('SECRET'));
  await db.query('ROLLBACK');
});

test('uncertain read-only COMMIT evicts the connection and never returns a plan',async()=>{
  beforeQuery=async sql=>{if(sql==='COMMIT')throw new Error('CONNECTION-SECRET');};
  await assert.rejects(inspector()(),{status:503});assert.ok(releases[0] instanceof Error);
});

test('draft has no production imports, route, migration, live client or runtime image copy',()=>{
  const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  for(const file of ['server.mjs','handler.mjs','migrate.mjs','team-lead-hub.mjs','firm-preview-boundary.mjs','firm-scoped-snapshot.mjs','advisor-reassignment-execution.mjs'])
    assert.ok(!read(file).includes('legacy-owner-recovery'),file);
  assert.ok(read('.dockerignore').includes('!legacy-owner-recovery.mjs'));
  assert.ok(!read('Dockerfile').split('AS runtime')[1].includes('legacy-owner-recovery'));
  const source=read('legacy-owner-recovery.mjs');
  assert.doesNotMatch(source,/process\.env|from ['"]pg|fetch\(|getUserByEmail|owner_email|INSERT INTO|UPDATE discovery|DELETE FROM/);
});

for (const stage of [1,2]) test('uncertain BEGIN acknowledgement rolls back and evicts at stage '+stage,async()=>{
  let begins=0;
  afterQuery=async sql=>{if(sql.startsWith('BEGIN')&&++begins===stage)throw new Error('BEGIN-SECRET');};
  await assert.rejects(inspector()(),e=>e.status===503&&!e.message.includes('SECRET'));
  assert.equal(queries.at(-1).sql,'ROLLBACK');assert.ok(releases[0] instanceof Error);
  const settings=(await db.query("SELECT current_setting('transaction_read_only') AS read_only")).rows[0];
  assert.equal(settings.read_only,'off','rollback leaves no open read-only transaction');
});
