import {retireIdentityEvidence,holdHistoricalArrival,historicalCandidateHash} from '../historical-identities.mjs';
import {LEAD_TEAM} from '../forget.mjs';
// Reusable synthetic scenarios. Caller provides a disposable database; no credentials loaded here.
import assert from 'node:assert/strict';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {stagingConfig} from './staging-config.mjs';
import {createAuthenticatedStaging,fictionalCSV} from './staging-app.mjs';
const now=Date.now(),project='prospectpilot-stg-261118';
const env={STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'approved-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+7*86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-app-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_app',PGUSER:'prospectpilot_stg_app',PGPASSWORD:'test-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'fictional-public-key',appId:'fictional-app'})};
const claims={uid:'approved-owner',aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};

const binding={uid:'synthetic-tester',email:'tester@example.test',expires:new Date(now+86400000).toISOString()};
const admitted=()=>stagingConfig({...env,STAGING_TESTER_BINDINGS:JSON.stringify([binding])});
const tester={...claims,uid:binding.uid,email:binding.email};

export const testerProofConfig=admitted();
export async function runTesterAuthorityScenarios({pool,seedPool=pool}){
 const config=testerProofConfig;

 let revokedTester=false;const verify=async(token,revoked)=>{assert.equal(revoked,true);if(token==='owner')return claims;if(token==='tester'&&!revokedTester)return tester;throw Error('denied');};
 let clock=now;const app=createAuthenticatedStaging({pool,config,auth:{verifyIdToken:verify,verifySessionCookie:verify,createSessionCookie:async t=>t},loginScript:'// synthetic only',clock:()=>clock});
 const req=(who,path,method='GET',body)=>app(new Request(config.origin+path,{method,headers:{origin:config.origin,cookie:'__session='+who,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const json=async(who,path,method,body)=>{const r=await req(who,path,method,body);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const snapshot=async()=>{const names=(await seedPool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const out={};for(const {tablename} of names){assert.match(tablename,/^[a-z_][a-z0-9_]*$/);out[tablename]=(await seedPool.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM "${tablename}" t`)).rows[0].rows;}return out;};
 for(const path of ['/prospect','/lab','/audience']){
  const ownerPage=await req('owner',path+'?tester=true'),testerResponse=await req('tester',path);
  assert.equal(ownerPage.status,200);assert.equal(testerResponse.status,200);
  assert.doesNotMatch(await ownerPage.text(),/Approved fictional tester/);assert.match(await testerResponse.text(),/Approved fictional tester/);
 }
 for(const path of ['/prospect-client.js','/lab-client.js']){assert.doesNotMatch(await (await req('owner',path)).text(),/installTesterUI/);assert.match(await (await req('tester',path)).text(),/installTesterUI/);assert.equal((await req('unknown',path)).status,401);}
 const records={};
 for(const who of ['owner','tester']){
  const list=await json(who,'/api/prospect/lists','POST',{name:'Synthetic '+who});
  const input={csv:fictionalCSV,format:'generic',source:'Synthetic fixture',list_id:list.id};
  assert.equal((await json(who,'/api/prospect/import/preview','POST',input)).preview,true);
  const imported=await json(who,'/api/prospect/import','POST',input);assert.equal(imported.added,2);
  assert.equal((await json(who,'/api/prospect/import','POST',input)).replayed,true);
  const contacts=await json(who,'/api/prospect/contacts');assert.equal(contacts.total,2);
  const id=contacts.contacts.find(c=>c.first_name==='Alex').id;const detail=await json(who,'/api/prospect/contacts/'+id);
  await json(who,'/api/prospect/contacts/'+id+'/prepare','POST',{revision:detail.contact.edit_revision});
  const handoff=await json(who,'/api/lab/contact-import','POST',{ids:[id]});assert.equal(handoff.result.added,1);assert.equal(handoff.result.duplicates,0);assert.equal(handoff.result.ambiguous,0);assert.equal(handoff.linked,1);
  const leads=(await pool.query('SELECT id FROM discovery_leads WHERE owner_user_id=$1',[who==='owner'?claims.uid:tester.uid])).rows;
  const imports=(await pool.query('SELECT id FROM prospect_imports WHERE user_id=$1',[who==='owner'?claims.uid:tester.uid])).rows;
  records[who]={id,list:list.id,lead:leads[0].id,import:imports[0].id};
 }
 // Reverse arrival order for the second identical fixture person too.
 for(const who of ['tester','owner']){const contacts=await json(who,'/api/prospect/contacts');const id=contacts.contacts.find(c=>c.first_name==='Sam').id;const handoff=await json(who,'/api/lab/contact-import','POST',{ids:[id]});assert.equal(handoff.result.added,1);assert.equal(handoff.result.duplicates,0);assert.equal(handoff.result.ambiguous,0);assert.equal(handoff.linked,1);assert.equal(handoff.lead_ids.length,1);}
 // The production default still uses the established team-wide dedup policy.
 const third={...claims,uid:'synthetic-default-policy',email:'default@example.test'};
 const workspace=createProspectWorkspace({pool,checkDomain:()=>{throw Error('disabled');}});await workspace.importCSV(third,{csv:fictionalCSV,format:'generic',source:'Synthetic'});
 const thirdContact=(await pool.query("SELECT id FROM prospect_contacts WHERE user_id=$1 AND payload->>'first_name'='Alex'",[third.uid])).rows[0];
 const legacy=createResearchLab({pool,sources:{readiness:{}},dispatch:async()=>false});
 const defaultResult=await legacy.route(new Request(config.origin+'/api/lab/contact-import',{method:'POST',body:JSON.stringify({ids:[thirdContact.id]})}),third);
 assert.equal(defaultResult.lead_ids.length,0);assert.equal((await pool.query('SELECT id FROM discovery_leads WHERE owner_user_id=$1',[third.uid])).rows.length,0);
 assert.notEqual(records.owner.id,records.tester.id);assert.notEqual(records.owner.lead,records.tester.lead);
 for(const who of ['owner','tester']){const other=records[who==='owner'?'tester':'owner'];
  for(const path of ['/api/prospect/contacts/'+other.id,'/api/prospect/imports/'+other.import,'/api/lab/leads/'+other.lead,'/api/lab/leads/'+other.lead+'/activity','/api/lab/leads/'+other.lead+'/related'])assert.ok([403,404].includes((await req(who,path)).status),path);
  for(const [path,method,body] of [['/api/prospect/contacts/'+other.id,'PATCH',{suppressed:true}],['/api/prospect/contacts/'+other.id+'/prepare','POST',{revision:'synthetic-revision'}],['/api/prospect/contacts/'+other.id+'/review','POST',{decision:'keep',list_id:other.list}],['/api/lab/leads/'+other.lead+'/activity','POST',{note:'Synthetic forbidden',outcome:'no_answer',idempotency_key:'synthetic-forbidden'}],['/api/lab/leads/'+other.lead+'/review','POST',{decision:'keep'}]])assert.ok([403,404].includes((await req(who,path,method,body)).status),path);
  assert.equal((await json(who,'/api/prospect/lists')).lists.length,1);
  assert.equal((await json(who,'/api/lab/leads')).total,2);
  assert.equal((await json(who,'/api/lab/worklist?view=all')).total,2);
  assert.equal((await json(who,'/api/lab/runs')).runs.length,2);
  const summary=await json(who,'/api/lab/summary');assert.equal(summary.inventory.reduce((n,r)=>n+Number(r.n),0),2);
  assert.equal((await json(who,'/api/lab/scoreboard')).added,2);

  assert.equal((await req(who,'/api/lab/contact-import','POST',{ids:[other.id]})).status,404);
  for(const path of ['/api/prospect/contacts','/api/prospect/data-quality','/api/prospect/daily-review','/api/lab/worklist','/api/lab/leads','/api/lab/runs','/api/lab/summary','/api/lab/settings','/api/lab/sources','/api/lab/scoreboard','/api/lab/advisor-profile']){const r=await req(who,path);assert.equal(r.status,200,path);const body=await r.text();assert.ok(!body.includes(other.id)&&!body.includes(other.lead)&&!body.includes(other.import),path+' no cross-user IDs');}
  assert.ok([403,404].includes((await req(who,'/api/prospect/contacts?list_id='+other.list)).status));

  assert.ok([403,404].includes((await req(who,'/api/prospect/import','POST',{csv:fictionalCSV,list_id:other.list})).status));
 }
 for(const path of ['/api/prospect/export','/api/lab/advisor-profile','/api/lab/identity-reviews/x','/api/lab/historical-identity-reviews/x','/api/prospect/lists/x/shares','/api/lab/runs','/api/team-hub/execute'])assert.equal((await req('tester',path,'POST',{})).status,403,path);
 assert.equal((await req('tester','/api/prospect/import','POST',{csv:'arbitrary,unapproved'})).status,422);
 assert.equal((await req('tester','/api/lab/historical-identity-reviews')).status,403);
 assert.equal((await req('owner','/api/lab/historical-identity-reviews')).status,200);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM prospect_contacts')).rows[0].n,6);
 // Actual owner historical create/update resolutions ignore foreign collisions,
 // but still reject same-owner collisions. All records/markers are synthetic.
 const raw=(await pool.query('SELECT payload FROM discovery_leads WHERE id=$1',[records.owner.lead])).rows[0].payload;
 const base=typeof raw==='string'?JSON.parse(raw):raw;
 const approve={decision:'different_person',confirmed_distinct:true,reason:'Synthetic reviewed distinct person test'};
 for(const operation of ['create','update'])for(const sameOwner of [false,true]){
  const tag=operation+(sameOwner?'same':'foreign'),email='synthetic-history-'+tag+'@example.test';
  const candidate={...base,id:'synthetic-candidate-'+tag,email,first_name:'Synthetic '+tag};
  const foreignId='synthetic-collision-'+tag;
  await seedPool.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',[foreignId,LEAD_TEAM,sameOwner?claims.uid:tester.uid,sameOwner?claims.email:tester.email,JSON.stringify({...candidate,id:foreignId})]);
  await retireIdentityEvidence(seedPool,claims.uid,'lead','synthetic-retired-'+tag,candidate);
  let payload={source:'Synthetic historical proof'};
  if(operation==='update'){
   const existingId='synthetic-existing-'+tag,live={...base,id:existingId,email:'synthetic-before-'+tag+'@example.test'};
   await seedPool.query('INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,$2,$3,$4,$5)',[existingId,LEAD_TEAM,claims.uid,claims.email,JSON.stringify(live)]);
   candidate.id=existingId;payload={...payload,existing_lead_id:existingId,source_revision:historicalCandidateHash(live),changed_fields:['email','first_name']};
  }
  const hold=await holdHistoricalArrival(seedPool,claims.uid,'lead',candidate,payload);assert.ok(hold?.id);
  const before=await snapshot();
  const response=await req('owner','/api/lab/historical-identity-reviews/'+hold.id,'POST',approve);
  assert.equal(response.status,sameOwner?409:200,await response.clone().text());
  if(sameOwner)assert.deepEqual(await snapshot(),before);
  else{const result=await response.json();assert.equal(result.resolved,true);assert.notEqual(result.id,foreignId);const saved=(await pool.query('SELECT owner_user_id FROM discovery_leads WHERE id=$1',[result.id])).rows[0];assert.equal(saved.owner_user_id,claims.uid);}
 }
 // Removing the final tester binding must not restore cross-user candidate matching.
 const removedApp=createAuthenticatedStaging({pool,config:stagingConfig(env),auth:{verifyIdToken:verify,verifySessionCookie:verify},loginScript:'// synthetic'});
 const freshUser={...tester,uid:'synthetic-removed-history',email:'removed@example.test'};
 const syntheticInput={csv:'First Name,Last Name,Company,Email\nFictional,AfterRemoval,Example,after-removal@example.test',format:'generic'};
 const ws=createProspectWorkspace({pool});await ws.importCSV(claims,syntheticInput);await ws.importCSV(freshUser,syntheticInput);
 const otherContact=(await pool.query("SELECT id FROM prospect_contacts WHERE user_id=$1 AND payload->>'email'='after-removal@example.test'",[freshUser.uid])).rows[0];
 const ownContact=(await pool.query("SELECT id FROM prospect_contacts WHERE user_id=$1 AND payload->>'email'='after-removal@example.test'",[claims.uid])).rows[0];
 const isolated=createResearchLab({pool,sources:{readiness:{}},isolateCandidateOwners:true});
 const otherHandoff=await isolated.route(new Request(config.origin+'/api/lab/contact-import',{method:'POST',body:JSON.stringify({ids:[otherContact.id]})}),freshUser);assert.equal(otherHandoff.lead_ids.length,1);
 const ownHandoff=await removedApp(new Request(config.origin+'/api/lab/contact-import',{method:'POST',headers:{origin:config.origin,cookie:'__session=owner','content-type':'application/json'},body:JSON.stringify({ids:[ownContact.id]})}));assert.equal(ownHandoff.status,200);assert.equal((await ownHandoff.json()).lead_ids.length,1);

 await seedPool.query('INSERT INTO advisor_profiles(user_id,display_name) VALUES($1,$2)',[claims.uid,'Synthetic owner-private profile']);
 assert.doesNotMatch(await (await req('tester','/api/lab/advisor-profile?user_id='+claims.uid)).text(),/owner-private/);
 await json('tester','/api/lab/leads/'+records.tester.lead+'/activity','POST',{signature:(await json('tester','/api/lab/leads/'+records.tester.lead+'/activity')).action.signature,outcome:'no_answer',idempotency_key:'synthetic-own',note:'Synthetic tester-private activity'});
 assert.doesNotMatch(await (await req('owner','/api/lab/worklist')).text(),/tester-private/);
 await json('tester','/api/prospect/contacts/'+records.tester.id,'PATCH',{suppressed:true});
 assert.notEqual((await json('owner','/api/prospect/contacts/'+records.owner.id)).contact.suppressed,true);
 assert.equal((await req('tester','/auth/session','POST',{idToken:'owner'})).status,200);revokedTester=true;assert.equal((await req('tester','/login')).status,200);assert.equal((await req('tester','/auth/session','POST',{idToken:'owner'})).status,200);assert.equal((await req('tester','/logout','POST')).status,303);revokedTester=false;
 const beforeRevocation=await snapshot();for(const path of ['/api/prospect/contacts','/staging-fixture.csv']){revokedTester=true;assert.equal((await req('tester',path)).status,401);revokedTester=false;clock=config.testers[0].expires;assert.equal((await req('tester',path)).status,401);clock=now;}
 assert.deepEqual(await snapshot(),beforeRevocation);
 const removed=createAuthenticatedStaging({pool,config:stagingConfig(env),auth:{verifyIdToken:verify,verifySessionCookie:verify},loginScript:'// synthetic'});
 assert.equal((await removed(new Request(config.origin+'/api/prospect/contacts',{headers:{cookie:'__session=tester'}}))).status,401);
 await seedPool.query('INSERT INTO prospect_list_shares(list_id,recipient_uid,recipient_email,owner_email,role) VALUES($1,$2,$3,$4,$5)',[records.owner.list,tester.uid,tester.email,claims.email,'editor']);
 const beforeShared=await snapshot();assert.equal((await req('tester','/api/prospect/lists')).status,403);
 assert.equal((await req('tester','/api/prospect/import','POST',{csv:fictionalCSV,list_id:records.owner.list})).status,403);
 assert.deepEqual(await snapshot(),beforeShared);
 await seedPool.query('DELETE FROM prospect_list_shares WHERE recipient_uid=$1',[tester.uid]);
 await seedPool.query('INSERT INTO discovery_users(user_id,email,full_name,role) VALUES($1,$2,$3,$4)',[tester.uid,tester.email,'Synthetic Tester','admin']);
 const beforeAdmin=await snapshot();assert.equal((await req('tester','/api/lab/leads/'+records.owner.lead)).status,403);
 assert.equal((await req('tester','/api/lab/leads')).status,403);
 assert.deepEqual(await snapshot(),beforeAdmin);
 await seedPool.query('DELETE FROM discovery_users WHERE user_id=$1',[tester.uid]);
 await seedPool.query('INSERT INTO discovery_users(user_id,email,full_name,role) VALUES($1,$2,$3,$4)',[claims.uid,claims.email,'Synthetic Owner','admin']);
 const beforeOwnerAdmin=await snapshot();assert.equal((await req('owner','/api/lab/leads')).status,403);assert.deepEqual(await snapshot(),beforeOwnerAdmin);
 await seedPool.query('DELETE FROM discovery_users WHERE user_id=$1',[claims.uid]);
 await seedPool.query('INSERT INTO prospect_list_shares(list_id,recipient_uid,recipient_email,owner_email,role) VALUES($1,$2,$3,$4,$5)',[records.tester.list,claims.uid,claims.email,tester.email,'viewer']);
 const beforeOwnerShare=await snapshot();assert.equal((await req('owner','/api/prospect/lists')).status,403);assert.deepEqual(await snapshot(),beforeOwnerShare);
 

}
