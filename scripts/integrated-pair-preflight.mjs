// Isolated SOURCE diagnostic, never runtime image capability or transfer approval.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrate} from '../migrate.mjs';
import {createStagingDatabase,validateStagingDatabaseUrl} from '../test/helpers/staging-database.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const integratedPreflightPins={"floor": {"firm-scoped-snapshot.mjs": "760352b49be5dfca107a449e6bcc75eb880d43855011a4b6a496970487a74ba7", "schema-drafts/firm-preview-boundary.sql": "f3c0a2c6ebf25a7e54ff3722f29d1e02d92f959e4e91285bb365454a46462d93", "firm-preview-boundary.mjs": "3ebdf5e6ed054169c3b2fceca988758e4b2966ecae534f66e26834a882ef037b"}, "successor": {"firm-scoped-snapshot.mjs": "481b3f80127826417640344b63a7d6e90c0924c4545bda6fedea72a3c83e45ce", "schema-drafts/firm-preview-boundary.sql": "f3c0a2c6ebf25a7e54ff3722f29d1e02d92f959e4e91285bb365454a46462d93", "firm-preview-boundary.mjs": "3ebdf5e6ed054169c3b2fceca988758e4b2966ecae534f66e26834a882ef037b"}};
const migrationPins={"migrate.mjs": "df208e672aa0914108b087e7b02b74afd158fdc344f9b3de5fc25deb19d29f89", "generated/schema.sql": "86af359152bfb8f22a3f4994c8da6e8697c73dbd41665853cdac55a45911f366", "migrations/002-query-indexes.sql": "005ea715a3bbf383cb5041a905bb7f371f9eca1735bf1011941c74b79b0494e0", "migrations/003-linkedin.sql": "89682cf0e75cc79ea5bb41d7817b1c6525c0da646e26bae79b4ca97056860e21", "migrations/004-research-jobs.sql": "7958a824eadbf31f049ce8bad7607ffc95e1e3839c862ade80072ba87f6a5be9", "migrations/005-research-history-index.sql": "e5bdbd4fee28e459b3a928540bd67b4828879110996b08cbcd8f18ad0343a4a9", "migrations/006-research-lab.sql": "9e315190563e299d31b011f8d365f72201aed9e5c6e371f0b76055a280cb6947", "migrations/007-quality-v2.sql": "50d4cf04d4795d50704ab7a6408ef77a92adfe70d5fd6c0b825149d27389fb63", "migrations/008-prospect-workspace.sql": "7a5d210f61a808380634edbf480faee752276ec51867dbd184425eee0c1ae8f5", "migrations/009-prospect-jobs.sql": "f3f7ccbefb42a4d702e7411eb0af9d3dfbe4c8d16e19b456044710a388285bb8", "migrations/010-plan-latest-filing.sql": "5a53c13a9bcd2c0f717c6814c46b8399ff9827a14279564b6a332aecd09ab24e", "migrations/011-email-domain-check.sql": "78b4aa3b4a8f06ffb0b6d4983dc1bb86de33810c90d4b780b0e1398a8fb139f4", "migrations/012-plan-catalog-summary.sql": "3515ad8887910a581ba4bf9fa17f9f442a92bcee234bde9bc7894d97bc7d3a8e", "migrations/013-advisor-workflow.sql": "521440fd1127a1b907bc1f0b498044b532e9e3e4fd5e5f842c875c4f18293982", "migrations/014-outreach-cadence.sql": "3b3e33244e6b6b6c8e806dffc3eccc49b32f290f215889ce0421df6a583f7eeb", "migrations/015-dial-budget.sql": "fb1770502762fdb92d4e8d88564288036fdf9586cbd5f3ad14056c2a07039fed", "migrations/016-inbound-contact.sql": "aae1a5ce0a6183b7bc5b025cea4704c63ef4be9c439bf1bb1012a3a23e99db89", "migrations/017-forget.sql": "8eabf3c810b1354982a32136582886cc8640ae6adfc6061f47f11f2db68f5443", "migrations/018-phone-check.sql": "3d91ab1ed116d74e71a56b2f097ed3d9aef38d0622f83b1129b3a66a660dcf17", "migrations/019-web-research.sql": "31ebb9017db3ead539e591e8c6d13343ad4f9494f814587e32045f150af60a57", "migrations/020-list-sharing.sql": "c1fc4ff894fb2cd3e03270c6809c13d5ca83d423add2d76c983977f22d9ad21e", "migrations/021-lab-companies.sql": "b1adc50548bfe8fad233fcfc42b70043ba384ecb98dadcffb1faf34788e404d6", "migrations/022-identity-reviews.sql": "5236894981f0f70a8e2ae82204025e4a36161998cd08b74a5db86f304da59afa", "migrations/023-memberships.sql": "c57a14469ce088290c0993ed4a018c889b64b638109809db2b34ebaf4948cee2", "migrations/024-billing.sql": "a4559f3e782a0bae3539cff5824debfecd22a0d73678c22ad81d8f927bdd62d1", "migrations/025-topups.sql": "bdc7dbc476d38d8c5c00123e15703a0b45e0525dcdbd66a758c452f042cb86d9", "migrations/026-movable-assets.sql": "98c5e65dd1d4e2ce658529e146a775027f64ee866e1c4cb605e462b992696f04", "migrations/027-lead-ledger.sql": "781019d506222b3a6991737d4461173c9eee78d0a26f1db450cb1c0c7b967359", "migrations/028-charge-detail.sql": "cd60eda07eab101051f190e013ef3c8ad31578666cdf7a69cf88939054790bfa", "migrations/029-lab-lead-ledger.sql": "fac3ab9de08a58561a162ce66260786f5e17a494ee375d435d5ef4ac2e42565b", "migrations/030-personal-events.sql": "2b60bc11e1039595aba547022b545128f7d8baaf8002938092721b02c5679714", "migrations/031-autopilot.sql": "47cda53e4506553d85d5df906732108d361505ff87df87406bf872256b60b7fd", "migrations/032-networking-capture.sql": "ef11f48725f9e51ef3e485974bd9826d98a8d41b13f8a991db48fd7231379dc7", "migrations/033-planning-decisions.sql": "65a0c1618165786f55a2ac6f30f680f997e3c8750ac442246a63cac3d771e850", "migrations/034-historical-identities.sql": "25be33ddf7067f272f3f9ecb18f2d662c14473507eeaa54a12ec27deb5d44432"};
const seed=`INSERT INTO firm_workspaces(id,name,status) VALUES ('firm-a','Firm A','active'),('firm-b','Firm B','active');
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
export async function probeIntegratedPreflight({db,createLoader,expectedMetadata}){
 await db.query(seed);
 const statements=[];
 const pool={connect:async()=>({query:async(sql,args)=>{statements.push(sql);return db.query(sql,args);},release(){}})};
 const auth={verifySessionCookie:async(cookie,revoked)=>{assert.equal(cookie,'synthetic-source-session');assert.equal(revoked,true);return {uid:'supervisor',email:'supervisor@example.test',email_verified:true,firebase:{sign_in_provider:'password'}};},getUser:async uid=>({uid,disabled:uid==='source',emailVerified:true})};
 const load=(extra={})=>createLoader({pool,firmId:'firm-a',auth,sessionCookie:'synthetic-source-session',...extra})({sourceUid:'source',targetUid:'target'});
 const snapshot=async()=>{const out={};for(const {tablename} of(await db.query('SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename')).rows){assert.match(tablename,/^[a-z_]+$/);out[tablename]=(await db.query('SELECT to_jsonb(t) AS row FROM "'+tablename+'" t ORDER BY to_jsonb(t)::text')).rows;}return out;};
 const add=async(owner,kind,id,namespace='SOURCE-SECRET-NAMESPACE',token='SOURCE-SECRET-TOKEN')=>db.query('INSERT INTO prospect_identity_evidence(user_id,record_kind,record_id,token_owner_id,key_hash,key_version) VALUES($1,$2,$3,$4,$5,$6)',[owner,kind,id,namespace,token,'hmac:SOURCE-SECRET-VERSION']);
 const missingEvidence=await load();assert.equal(missingEvidence.can_execute,false);
 if(expectedMetadata){assert.equal(missingEvidence.historicalIdentity.source.records_without_retained_evidence,2);assert.equal(missingEvidence.historicalIdentity.target_assigned_contacts.records_without_retained_evidence,1);assert.ok(missingEvidence.blockers.some(x=>x.code==='historical_evidence_missing'));assert.equal(missingEvidence.historicalIdentity.source.key_availability,'not_assessed');}
 await add('source','contact','contact-a');await add('source','lead','lead-a');
 await db.query("INSERT INTO prospect_historical_reviews(id,user_id,destination,fingerprint,candidate,payload,key_hashes) VALUES('associated','source','contact','associated','{\"email\":\"SOURCE-SECRET-CANDIDATE\"}','{\"existing_contact_id\":\"contact-a\"}',ARRAY['SOURCE-SECRET-HASH'])");
 const before=await snapshot(),result=await load();
 assert.equal(result.can_execute,false);assert.equal(result.complete,false);
 assert.deepEqual(result.contacts.map(r=>r.id),['contact-a']);assert.deepEqual(result.targetContacts.map(r=>r.id),['target-a']);
 assert.doesNotMatch(JSON.stringify(result),/SOURCE-SECRET|SECRET-NOTE|SECRET-PHONE|PRIVATE-SECRET|private:identity|private-target:identity|other-firm:identity|hidden@example\.test|SECRET-LEAD|OBSERVATION-SECRET|ACTIVITY-SECRET/);
 assert.deepEqual(await snapshot(),before,'Read-only source preflight changes no rows');
 if(expectedMetadata){
  assert.equal(result.historicalIdentity.can_transfer,false);assert.equal(result.historicalIdentity.source.evidence_count,2);assert.equal(result.historicalIdentity.source.associated_review_count,1);assert.equal(result.historicalIdentity.source.key_availability,'not_assessed');
  assert.ok(result.blockers.some(x=>x.code==='historical_identity_policy_unresolved'));
 }else assert.equal(result.historicalIdentity,undefined,'Older source has no034 metadata preflight, not a capability approval');
 const first=result.fingerprint;
 for(const [uid,kind,id] of [['source','contact','private-a'],['source','contact','contact-b'],['outsider','contact','contact-a'],['target','contact','private-target']])await add(uid,kind,id);
 await db.query("INSERT INTO prospect_historical_identifiers(user_id,token_owner_id,key_hash,key_version) VALUES('source','SOURCE-SECRET-DELETED','SOURCE-SECRET-DELETED','legacy')");
 assert.equal((await load()).fingerprint,first,'Private/other-firm/other-owner/deleted history remains unenumerated');
 await db.query("UPDATE prospect_identity_evidence SET token_owner_id='SOURCE-SECRET-ROTATED' WHERE user_id='source' AND record_id='contact-a'");
 const changed=await load();if(expectedMetadata)assert.notEqual(changed.fingerprint,first);else assert.equal(changed.fingerprint,first);
 assert.doesNotMatch(JSON.stringify(changed),/SOURCE-SECRET/);
 const reads=statements.filter(s=>s.includes('FROM prospect_historical_identifiers'));assert.equal(reads.length,0);
 const deniedAuth={...auth,verifySessionCookie:async()=>({uid:'outsider',email:'outsider@example.test',email_verified:true,firebase:{sign_in_provider:'password'}})};
 await assert.rejects(load({auth:deniedAuth}),{status:403});
 if(expectedMetadata){
  const missing={connect:async()=>({query:async(sql,args)=>{if(sql.includes('FROM prospect_identity_evidence'))throw Object.assign(Error('synthetic missing034'),{code:'42P01'});return db.query(sql,args);},release(){}})};
  await assert.rejects(load({pool:missing}),{status:503});
  await db.query("INSERT INTO prospect_identity_evidence(user_id,record_kind,record_id,token_owner_id,key_hash,key_version) SELECT 'source','contact','contact-a','source','overflow-'||n,'legacy' FROM generate_series(1,1001)n");
  await assert.rejects(load(),{status:413});
 }
 assert.ok(statements.length>0&&statements.every(sql=>/^(BEGIN|SET LOCAL|SELECT|COMMIT|ROLLBACK)/.test(sql)),'Only bounded read transaction statements');
 assert.ok(statements.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
 assert.ok(statements.includes('BEGIN READ ONLY'));
 return {sourceOnly:true,runtimeCapability:false,metadataInventory:expectedMetadata,can_execute:false,can_transfer:false,privacyVerified:true,authorizationRefused:true,boundedEvidenceRefused:expectedMetadata,missingSchemaRefused:expectedMetadata};
}
export async function runIntegratedPreflight(directory){
 assert.ok(isAbsolute(directory));assert.notEqual(process.env.NODE_ENV,'production');
 const fixtureEnv={...process.env};delete fixtureEnv.PGHOST;delete fixtureEnv.PGPORT;
 const config=validateStagingDatabaseUrl(fixtureEnv);assert.equal(config?.host,'127.0.0.1','Explicit disposable native database required');
 assert.equal(process.env.ROLLBACK_SYNTHETIC_BOOTSTRAP,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGPORT,String(config.port),'Strict preload port must match explicit fixture');
 for(const [file,digest] of Object.entries(migrationPins))assert.equal(sha(await readFile(new URL('../'+file,import.meta.url))),digest,'Host migration fixture exactly pinned');
 const results={};
 for(const phase of ['floor','successor']){
  for(const [file,digest] of Object.entries(integratedPreflightPins[phase]))assert.equal(sha(await readFile(join(directory,phase,file))),digest,'Pinned source-only fixture');
  const {createFirmScopedSnapshotLoader}=await import(pathToFileURL(join(directory,phase,'firm-scoped-snapshot.mjs')));
  const db=await createStagingDatabase({backend:'postgres',env:fixtureEnv});
  try{
   await migrate(db.pool);await db.query(await readFile(join(directory,phase,'schema-drafts/firm-preview-boundary.sql'),'utf8'));
   results[phase]=await probeIntegratedPreflight({db,createLoader:createFirmScopedSnapshotLoader,expectedMetadata:phase==='successor'});
  }finally{await db.close();}
 }
 console.log('INTEGRATED_PREFLIGHT_RESULT:'+JSON.stringify({verified:true,draftDiagnosticOnly:true,runtimePreflightAvailable:false,scope:'pinned source-only diagnostic in separate disposable schemas, never runtime image capability',runtimeCapability:false,fullCompatibility:false,results}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){if(process.argv.length!==4||process.argv[2]!=='--source-dir')throw Error('Explicit source-only fixture directory required');await runIntegratedPreflight(process.argv[3]);}
