import test, {before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {createFirmScopedSnapshotLoader} from '../firm-scoped-snapshot.mjs';
import {previewAdvisorReassignment} from '../advisor-reassignment-preview.mjs';

let db, queries, authCalls, accountCalls, releases;
const pair = {sourceUid:'source',targetUid:'target'};
const claims = {uid:'supervisor',email:'supervisor@example.test',email_verified:true,firebase:{sign_in_provider:'password'}};
const auth = {
  verifySessionCookie:async(cookie,revoked)=>{authCalls.push([cookie,revoked]);return claims;},
  getUser:async uid=>{accountCalls.push(uid);return {uid,disabled:uid==='source',emailVerified:true,email:'hidden@example.test',customClaims:{admin:true}};}
};
const pool = {connect:async()=>({query:async(sql,values)=>{queries.push({sql,values});return db.query(sql,values);},release:error=>releases.push(error)})};
const loader = (options={}) => createFirmScopedSnapshotLoader({pool,auth,firmId:'firm-a',sessionCookie:'synthetic-session',...options});
const seed = `INSERT INTO firm_workspaces(id,name,status) VALUES ('firm-a','Firm A','active'),('firm-b','Firm B','active');
  INSERT INTO firm_members(firm_id,user_id,label,role,status,approved_by,approval_reference) VALUES
  ('firm-a','supervisor','Supervisor','supervisor','active','reviewer','fixture'),
  ('firm-a','source','Source','advisor','departed','reviewer','fixture'),
  ('firm-a','target','Target','advisor','active','reviewer','fixture'),
  ('firm-b','source','Source','advisor','active','reviewer','fixture'),
  ('firm-b','outsider','Outsider','owner','active','reviewer','fixture');
  INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES
  ('contact-a','source','{"notes":"SECRET-NOTE","phone":"SECRET-PHONE"}','["email:synthetic@example.test"]'),
  ('target-a','target','{}','["email:synthetic@example.test"]'),
  ('private-a','source','{"notes":"PRIVATE-SECRET"}','["private:identity"]'),
  ('private-target','target','{}','["private-target:identity"]'),
  ('contact-b','source','{}','["other-firm:identity"]');
  INSERT INTO prospect_lists(id,user_id,name) VALUES ('list-a','source','Private list name'),('private-list','source','Private');
  INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES
  ('lead-a','legacy-shared','source','hidden@example.test','{"notes":"SECRET-LEAD"}'),
  ('private-lead','legacy-shared','source','hidden@example.test','{}');
  INSERT INTO firm_contact_assignments(contact_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES
  ('contact-a','firm-a','source','firm_created','fixture','reviewer'),('target-a','firm-a','target','firm_created','fixture','reviewer'),
  ('contact-b','firm-b','source','firm_created','fixture','reviewer');
  INSERT INTO firm_list_assignments(list_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ('list-a','firm-a','source','firm_created','fixture','reviewer');
  INSERT INTO firm_lead_assignments(lead_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ('lead-a','firm-a','source','firm_created','fixture','reviewer');
  INSERT INTO prospect_list_members(list_id,contact_id) VALUES ('list-a','contact-a');
  INSERT INTO advisor_contact_links(contact_id,lead_id,user_id) VALUES ('contact-a','lead-a','source');
  INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES ('lead-a','source','age','{"secret":"OBSERVATION-SECRET"}');
  INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,note) VALUES ('activity-a','lead-a','source','fixture','connected','ACTIVITY-SECRET');`;
before(async()=>{
  db = new PGlite();
  await migrate({connect:async()=>({query:async(sql,values)=>sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values),release(){}}),end:async()=>{}});
  await db.exec(readFileSync(new URL('../schema-drafts/firm-preview-boundary.sql',import.meta.url),'utf8'));
});
after(async()=>{await db.close();});
beforeEach(async()=>{
  await db.exec(`TRUNCATE firm_workspaces,prospect_contacts,prospect_lists,discovery_leads,prospect_jobs,prospect_imports,
    research_jobs,lead_call_blocks,lead_call_records,lab_runs,prospect_identity_evidence,prospect_historical_identifiers,prospect_historical_reviews RESTART IDENTITY CASCADE;`);
  await db.exec(seed);
  queries=[];authCalls=[];accountCalls=[];releases=[];
});

test('one read-only repeatable-read transaction returns only explicitly assigned metadata',async()=>{
  const snapshot=await loader()(pair);
  assert.equal(snapshot.complete,false);assert.equal(snapshot.inventory_complete,true);assert.equal(snapshot.can_execute,false);
  assert.deepEqual(snapshot.contacts.map(r=>r.id),['contact-a']);
  assert.deepEqual(snapshot.targetContacts.map(r=>r.id),['target-a']);
  assert.equal(snapshot.discoveryLeads[0].legacy_team,'legacy-shared');assert.equal(snapshot.discoveryLeads[0].team,undefined);
  assert.equal(snapshot.scope.firm_id,'firm-a');assert.equal(snapshot.activities[0].user_id,'source');
  assert.deepEqual(authCalls,[['synthetic-session',true],['synthetic-session',true]]);
  assert.deepEqual(accountCalls,['source','target']);assert.equal(releases.length,1);
  assert.equal(queries[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.ok(queries.some(q=>q.sql==='COMMIT'));
  assert.ok(queries.every(q=>/^(BEGIN|SET LOCAL|SELECT|COMMIT)/.test(q.sql)));
  const text=JSON.stringify(snapshot);
  for(const secret of ['SECRET-NOTE','SECRET-PHONE','PRIVATE-SECRET','PRIVATE-SECRET','private:identity','private-target:identity','other-firm:identity','SECRET-LEAD','OBSERVATION-SECRET','ACTIVITY-SECRET','hidden@example.test','Private list name'])assert.ok(!text.includes(secret),secret);
  assert.ok(snapshot.blockers.some(b=>b.code==='service_continuity_unverified'));
});
test('missing server configuration fails closed',()=>{
  for(const options of [{pool:{}},{auth:{}},{firmId:''}])assert.throws(()=>loader(options),{status:503});
});
test('revoked or invalid sessions cause no database or account reads',async()=>{
  for(const value of [null,{...claims,email_verified:false},{...claims,firebase:{sign_in_provider:'anonymous'}},{...claims,uid:''}])
    await assert.rejects(loader({auth:{...auth,verifySessionCookie:async()=>value}})(pair),{status:401});
  await assert.rejects(loader({auth:{...auth,verifySessionCookie:async()=>{throw Error('token secret');}}})(pair),{status:401});
  assert.deepEqual(queries,[]);assert.deepEqual(accountCalls,[]);
});
test('client claims cannot elevate an advisor or foreign owner',async()=>{
  for(const uid of ['source','target','outsider','missing'])await assert.rejects(loader({auth:{...auth,verifySessionCookie:async()=>({...claims,uid,role:'owner',team:'firm-a'})}})(pair),{status:403});
  assert.deepEqual(accountCalls,[]);assert.ok(queries.every(q=>!q.sql.includes('firm_contact_assignments')));
});
test('bad pairs fail before authentication',async()=>{
  for(const input of [null,{}, {sourceUid:'source',targetUid:'source'}, {...pair,targetUid:' bad'}])
    await assert.rejects(loader()(input??{}),{status:422});
  assert.deepEqual(authCalls,[]);
});
test('source, target and firm must be currently eligible',async()=>{
  await db.query("UPDATE firm_members SET status='suspended' WHERE firm_id='firm-a' AND user_id='target'");
  await assert.rejects(loader()(pair),{status:403});assert.deepEqual(accountCalls,[]);
});
test('single-use includes parallel and failed calls',async()=>{
  const read=loader();const result=read(pair);await assert.rejects(read(pair),{status:403});await result;
  const bad=loader();await assert.rejects(bad({...pair,targetUid:'missing'}),{status:403});await assert.rejects(bad(pair),{status:403});
});
test('target account must be active verified and exact',async()=>{
  for(const row of [{uid:'wrong',disabled:false,emailVerified:true},{uid:'target',disabled:false},{uid:'target',disabled:true,emailVerified:true},{uid:'target',disabled:false,emailVerified:false}])
    await assert.rejects(loader({auth:{...auth,getUser:async uid=>uid==='target'?row:auth.getUser(uid)}})(pair),e=>[422,503].includes(e.status));
});
test('owner drift refuses instead of omitting or inferring ownership',async()=>{
  await db.query("UPDATE prospect_contacts SET user_id='outsider' WHERE id='contact-a'");
  await assert.rejects(loader()(pair),{status:409});assert.ok(queries.some(q=>q.sql==='ROLLBACK'));
});
for(const [name,sql] of [
  ['foreign list member',"INSERT INTO prospect_list_members(list_id,contact_id) VALUES ('list-a','private-a')"],
  ['incoming private list',"INSERT INTO prospect_list_members(list_id,contact_id) VALUES ('private-list','contact-a')"],
  ['private linked lead',"UPDATE advisor_contact_links SET lead_id='private-lead' WHERE contact_id='contact-a'"],
  ['other author observation',"INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES ('lead-a','outsider','age','{}')"],
  ['other author activity',"INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome) VALUES ('foreign','lead-a','outsider','foreign','connected')"],
  ['linked task',"INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES ('job','source','enrich','fixture','hash',0); INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,contact_id,payload) VALUES ('task','job','source','enrich','provider','contact-a','{}')"],
  ['research job',"INSERT INTO research_jobs(id,lead_id,user_id,user_email) VALUES ('job','lead-a','source','hidden@example.test')"],
  ['research run',"INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key) VALUES ('run','source','hidden@example.test','discovery','fixture'); INSERT INTO lab_run_leads(run_id,lead_id,source) VALUES ('run','lead-a','fixture')"],
  ['autopilot',"INSERT INTO prospect_autopilot_runs(id,user_id,list_id,steps,approved_micros) VALUES ('auto','source','list-a','[]',0)"],
  ['identity review',"INSERT INTO lab_identity_reviews(id,user_id,kind,fingerprint,match_ids,reason) VALUES ('review','source','probable','fixture',ARRAY['lead-a'],'fixture')"],
  ['import provenance',"UPDATE lead_acquisitions SET import_id='private-import' WHERE contact_id='contact-a'"],
  ['linked provider usage',"INSERT INTO prospect_external_usage(user_id,provider,usage_key,units,lead_id) SELECT 'source','zoominfo','fixture',1,id FROM lead_acquisitions WHERE contact_id='contact-a'"]
])test('unsupported or mixed scope fails closed: '+name,async()=>{
  await db.exec(sql);await assert.rejects(loader()(pair),{status:409});assert.ok(queries.some(q=>q.sql==='ROLLBACK'));
});
test('private unrelated work is neither read nor silently claimed absent',async()=>{
  await db.query("INSERT INTO research_jobs(id,lead_id,user_id,user_email) VALUES ('private-job','private-lead','source','hidden@example.test')");
  const snapshot=await loader()(pair);assert.equal(snapshot.coverage.account_wide,false);
  assert.ok(!JSON.stringify(snapshot).includes('private-job'));
});
test('row overflow is refused rather than marked complete',async()=>{
  await db.exec(`INSERT INTO prospect_contacts(id,user_id,payload) SELECT 'many-'||n,'source','{}' FROM generate_series(1,1001) n;
    INSERT INTO firm_contact_assignments(contact_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by)
    SELECT 'many-'||n,'firm-a','source','firm_created','fixture','reviewer' FROM generate_series(1,1001) n;`);
  await assert.rejects(loader()(pair),{status:413});
});
test('malformed identity keys are not accepted as an empty inventory',async()=>{
  await db.query("UPDATE prospect_contacts SET identity_keys='{}' WHERE id='contact-a'");
  await assert.rejects(loader()(pair),{status:409});
});
test('session revoked during read refuses all output and rolls back',async()=>{
  let calls=0;
  await assert.rejects(loader({auth:{...auth,verifySessionCookie:async()=>{if(++calls===2)throw Error('revoked');return claims;}}})(pair),{status:401});
  assert.ok(queries.some(q=>q.sql==='ROLLBACK'));assert.ok(!queries.some(q=>q.sql==='COMMIT'));
});
test('a pool cannot downgrade transaction guarantees',async()=>{
  const unsafe={connect:async()=>({query:async(sql,values)=>sql.includes('current_setting')?{rows:[{isolation:'read committed',read_only:'off'}]}:pool.connect().then(c=>c.query(sql,values)),release:error=>releases.push(error)})};
  await assert.rejects(loader({pool:unsafe})(pair),{status:503});assert.deepEqual(accountCalls,[]);
});
test('database errors are sanitized and rollback failures evict client',async()=>{
  const release=[];const rollback=Error('rollback failed');
  const brokenPool={connect:async()=>({query:async sql=>{if(sql==='ROLLBACK')throw rollback;if(sql.startsWith('SET'))throw Error('database secret');return {rows:[]};},release:e=>release.push(e)})};
  await assert.rejects(loader({pool:brokenPool})(pair),e=>e.status===503&&!e.message.includes('secret'));
  assert.deepEqual(release,[rollback]);
});
test('firm snapshot cannot be mistaken for legacy complete offboarding',async()=>{
  const snapshot=await loader()(pair);
  await assert.rejects(previewAdvisorReassignment({actor:{uid:'supervisor'},...pair},{
    authorize:async()=>({approved:true,scope:'advisor-reassignment-preview',team:'firm-a',...pair}),
    resolveAccount:auth.getUser,loadSnapshot:async()=>snapshot
  }),{status:409});
});
test('read does not mutate roots, audit, costs, membership or assignments',async()=>{
  const state=async()=>JSON.stringify((await db.query(`SELECT
    (SELECT jsonb_agg(c) FROM prospect_contacts c) AS contacts,
    (SELECT jsonb_agg(c) FROM lead_acquisitions c) AS costs,
    (SELECT jsonb_agg(c) FROM firm_members c) AS members,
    (SELECT jsonb_agg(c) FROM firm_contact_assignments c) AS assignments`)).rows);
  const before=await state();await loader()(pair);assert.equal(await state(),before);
});

test('fresh membership check refuses a grant revoked after the snapshot commits',async()=>{
  let changed=false;
  const raced={connect:async()=>{
    const c=await pool.connect();return {release:e=>c.release(e),query:async(sql,values)=>{
      const result=await c.query(sql,values);
      if(sql==='COMMIT'&&!changed){changed=true;await db.query("UPDATE firm_members SET status='suspended' WHERE user_id='supervisor'");}
      return result;
    }};
  }};
  await assert.rejects(loader({pool:raced})(pair),{status:403});assert.equal(releases.length,1);
});
test('PostgreSQL actually rejects writes inside the checked snapshot transaction',async()=>{
  const enforcing={connect:async()=>{
    const c=await pool.connect();return {release:e=>c.release(e),query:async(sql,values)=>{
      const result=await c.query(sql,values);
      if(sql.includes('current_setting'))await assert.rejects(db.query("UPDATE prospect_contacts SET payload='{}'"),e=>e.code==='25006');
      return result;
    }};
  }};
  await assert.rejects(loader({pool:enforcing})(pair),{status:503});
});

for(const [name,sql] of [
  ['acquisition private lead',"UPDATE lead_acquisitions SET lab_lead_id='private-lead' WHERE contact_id='contact-a'"],
  ['acquisition private contact',"UPDATE lead_acquisitions SET lab_lead_id='lead-a' WHERE contact_id='private-a'"],
  ['later import provenance',`UPDATE prospect_contacts SET payload='{"source_history":[{}, {"import_id":"private-import"}]}' WHERE id='contact-a'`],
  ['later provider merge provenance',`UPDATE prospect_contacts SET payload='{"field_sources":{"email":[{"job_id":"private-job"}]}}' WHERE id='contact-a'`],
  ['embedded lead run',`UPDATE discovery_leads SET payload='{"source_history":[{"run_id":"private-run"}]}' WHERE id='lead-a'`]
])test('independent review scope regression: '+name,async()=>{
  await db.exec(sql);await assert.rejects(loader()(pair),{status:409});
});
test('unusual valid UID cannot change account-map prototype or disappear',async()=>{
  await db.exec(`INSERT INTO firm_members(firm_id,user_id,label,role,status,approved_by,approval_reference)
    VALUES ('firm-a','__proto__','Prototype UID','advisor','active','reviewer','fixture')`);
  const snapshot=await loader()({...pair,targetUid:'__proto__'});
  assert.equal(Object.getPrototypeOf(snapshot.accounts),null);
  assert.equal(Object.hasOwn(snapshot.accounts,'__proto__'),true);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).accounts.__proto__.uid,'__proto__');
});
test('the fresh authorization read also has local read-only timeouts',async()=>{
  await loader()(pair);
  const begin=queries.findIndex(q=>q.sql==='BEGIN READ ONLY');assert.ok(begin>0);
  const final=queries.slice(begin).map(q=>q.sql);
  assert.equal(final[1],"SET LOCAL statement_timeout = '5s'");
  assert.equal(final[2],"SET LOCAL lock_timeout = '1s'");
  assert.ok(final[4].startsWith('SELECT m.user_id'));
  assert.equal(final.at(-1),'COMMIT');
});


test('networking history on assigned source contacts refuses without reading private details',async()=>{
  await db.query("INSERT INTO prospect_networking_captures(id,user_id,contact_id,request_key,fingerprint,payload,result) VALUES('capture-source','source','contact-a','synthetic-capture-key','hash','{\"note\":\"PRIVATE-NETWORKING-NOTE\"}','{}')");
  await assert.rejects(loader()(pair),{status:409});
  const reads=queries.filter(q=>q.sql.includes('prospect_networking_captures'));
  assert.equal(reads.length,1);
  assert.equal(reads[0].sql,'SELECT EXISTS(SELECT 1 FROM prospect_networking_captures WHERE contact_id=ANY($1::text[])) AS blocked');
  assert.deepEqual(reads[0].values,[['contact-a']]);
  assert.ok(queries.some(q=>q.sql==='ROLLBACK'));
});

test('unrelated and collision-only target networking captures stay private and outside source inventory',async()=>{
  const before=await loader()(pair);queries=[];
  await db.exec(`INSERT INTO prospect_networking_captures(id,user_id,contact_id,request_key,fingerprint,payload,result) VALUES
    ('capture-private','source','private-a','private-networking-key','hash','{"note":"PRIVATE-NETWORKING-NOTE"}','{}'),
    ('capture-target','target','target-a','target-networking-key','hash','{"note":"TARGET-NETWORKING-NOTE"}','{}');`);
  const snapshot=await loader()(pair);
  assert.equal(snapshot.inventory_complete,true);assert.equal(snapshot.complete,false);
  assert.equal(snapshot.fingerprint,before.fingerprint);
  assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE-NETWORKING-NOTE|TARGET-NETWORKING-NOTE|capture-private|capture-target/);
  const reads=queries.filter(q=>q.sql.includes('prospect_networking_captures'));
  assert.equal(reads.length,1);assert.deepEqual(reads[0].values,[['contact-a']]);
  assert.ok(reads[0].sql.startsWith('SELECT EXISTS(SELECT 1 '));
  assert.doesNotMatch(reads[0].sql,/payload|request_key|fingerprint|result/);
});

test('034 preflight marks missing evidence unknown and never treats inventory as transfer approval',async()=>{
 const snapshot=await loader()(pair);
 assert.equal(snapshot.historicalIdentity.source.record_count,2);
 assert.equal(snapshot.historicalIdentity.source.records_without_retained_evidence,2);
 assert.equal(snapshot.historicalIdentity.target_assigned_contacts.records_without_retained_evidence,1);
 assert.equal(snapshot.historicalIdentity.can_transfer,false);
 assert.equal(snapshot.historicalIdentity.source.key_availability,'not_assessed');
 for(const code of ['historical_evidence_missing','historical_identity_policy_unresolved','apply_not_implemented'])assert.ok(snapshot.blockers.some(b=>b.code===code));
 assert.ok(!queries.some(q=>q.sql.includes('FROM prospect_historical_identifiers')));
});
const addEvidence=(uid,kind,id,namespace='original-owner',token='SECRET-TOKEN',version='hmac:unavailable-version')=>db.query(
 'INSERT INTO prospect_identity_evidence(user_id,record_kind,record_id,token_owner_id,key_hash,key_version) VALUES($1,$2,$3,$4,$5,$6)',[uid,kind,id,namespace,token,version]);
test('034 exact associated evidence contributes counts and provenance fingerprint, not token disclosure or key coverage claims',async()=>{
 await addEvidence('source','contact','contact-a');await addEvidence('source','lead','lead-a');
 const before=await loader()(pair),serialized=JSON.stringify(before);
 assert.equal(before.historicalIdentity.source.evidence_count,2);assert.equal(before.historicalIdentity.source.records_without_retained_evidence,0);
 assert.doesNotMatch(serialized,/SECRET-TOKEN|original-owner|unavailable-version/);
 assert.equal(before.historicalIdentity.source.key_availability,'not_assessed');
 await db.query("UPDATE prospect_identity_evidence SET token_owner_id='corrected-namespace' WHERE record_id='contact-a'");
 const after=await loader()(pair);assert.notEqual(after.historicalIdentity.source.fingerprint,before.historicalIdentity.source.fingerprint);
 assert.equal(after.can_execute,false);assert.ok(after.blockers.some(b=>b.code==='historical_identity_policy_unresolved'));
});
test('034 private, other-firm, mismatched-owner and owner-wide deleted evidence is never enumerated',async()=>{
 const before=await loader()(pair);
 for(const [uid,kind,id] of [['source','contact','private-a'],['source','contact','contact-b'],['outsider','contact','contact-a'],['source','lead','private-lead'],['target','contact','private-target']])await addEvidence(uid,kind,id);
 await db.query("INSERT INTO prospect_historical_identifiers(user_id,token_owner_id,key_hash,key_version) VALUES('source','private-namespace','DELETED-SECRET','legacy')");
 const after=await loader()(pair);assert.equal(after.fingerprint,before.fingerprint);
 assert.doesNotMatch(JSON.stringify(after),/DELETED-SECRET|private-namespace|SECRET-TOKEN/);
});
test('034 associated update and prior approval flag review without disclosing incoming or deleted details',async()=>{
 for(const [id,owner,destination,payload,resolution,status] of [
  ['associated','source','contact',{existing_contact_id:'contact-a'},{},'open'],
  ['resolved','source','lead',{},{result_id:'lead-a'},'resolved'],
  ['private','source','contact',{existing_contact_id:'private-a'},{},'open'],
  ['other-owner','outsider','contact',{existing_contact_id:'contact-a'},{},'open'],
  ['arrival','source','contact',{},{},'open']])await db.query(`INSERT INTO prospect_historical_reviews(id,user_id,destination,fingerprint,candidate,payload,key_hashes,resolution,status) VALUES($1,$2,$3,$1,'{"email":"PRIVATE-INCOMING"}',$4::jsonb,ARRAY['PRIVATE-HASH'],$5::jsonb,$6)`,[id,owner,destination,JSON.stringify(payload),JSON.stringify(resolution),status]);
 const snapshot=await loader()(pair);assert.equal(snapshot.historicalIdentity.source.associated_review_count,2);
 assert.ok(snapshot.blockers.some(b=>b.code==='historical_review_associated'));
 assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE-INCOMING|PRIVATE-HASH|"associated"|"resolved"|other-owner/);
 const reads=queries.filter(q=>q.sql.includes('FROM prospect_historical_reviews'));
 assert.equal(reads.length,2);for(const r of reads){assert.match(r.sql,/SELECT id,status,resolved_at/);assert.doesNotMatch(r.sql,/SELECT.*candidate/);}
});
test('034 inventory cannot silently downgrade if evidence schema is unavailable',async()=>{
 const failing={connect:async()=>({query:async(sql,values)=>{if(sql.includes('FROM prospect_identity_evidence'))throw Object.assign(Error('missing schema'),{code:'42P01'});return pool.connect().then(c=>c.query(sql,values));},release(){}})};
 await assert.rejects(loader({pool:failing})(pair),{status:503});
});
test('034 evidence inventory refuses oversized association sets instead of truncating coverage',async()=>{
 await db.query("INSERT INTO prospect_identity_evidence(user_id,record_kind,record_id,token_owner_id,key_hash,key_version) SELECT 'source','contact','contact-a','source','bounded-'||g,'legacy' FROM generate_series(1,1001) g");
 await assert.rejects(loader()(pair),{status:413});assert.ok(queries.some(q=>q.sql==='ROLLBACK'));
});
