// Run in a production-derived proof child after full filesystem/config comparison.
// No host application code or test dependencies are mounted.
// Deliberately injected auth: this is not Firebase or real-user validation.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fetchLegacySafely} from '../legacy-identity-guard.mjs';
import pg from 'pg';
import {migrate} from '../migrate.mjs';
import {createHandler} from '../handler.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {readOnlyFallback} from '../readonly-fallback.mjs';
import {startRollbackRuntime} from '../rollback-bootstrap.mjs';
import {createProspectWorkspace,identityLookupKeys} from '../prospect-workspace.mjs';
import {phoneReadiness} from '../prospect-data-quality.mjs';
import {forgetPerson,forgottenKeys} from '../forget.mjs';

if(process.argv.length!==3||process.argv[2]!=='--synthetic-image')throw Error('Explicit --synthetic-image required');
if(process.env.FORGET_TOMBSTONE_KEY||process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS)throw Error('Inherited identity keys forbidden in synthetic rehearsal');
if(Object.entries(process.env).some(([k,v])=>/^PG/.test(k)&&v))throw Error('Inherited PG settings forbidden');
const url=new URL(process.env.STAGING_DATABASE_URL||'');
if(url.protocol!=='postgres:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username!=='postgres'||url.password!=='synthetic-ci-only'||url.pathname!=='/prospectpilot_test'||url.search||url.hash)throw Error('Only disposable loopback synthetic CI PostgreSQL is permitted');
const config={host:url.hostname,port:Number(url.port||5432),user:'postgres',password:'synthetic-ci-only',database:'prospectpilot_test',ssl:false,connectionTimeoutMillis:5000};
const schema='pp_image_'+randomBytes(12).toString('hex');
const admin=new pg.Client(config);await admin.connect();
let normalPool,readPool,guard;
let externalCalls=0;
const deny=()=>{externalCalls++;throw Error('Synthetic image rehearsal forbids outbound providers');};
const originalFetch=globalThis.fetch;globalThis.fetch=deny;
const syntheticKey='synthetic-image-'+randomBytes(32).toString('hex');
const priorKey=process.env.FORGET_TOMBSTONE_KEY,priorKeys=process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS;
process.env.FORGET_TOMBSTONE_KEY=syntheticKey;
const owner={uid:'synthetic-image-advisor',email:'image@example.test',email_verified:true,firebase:{sign_in_provider:'password'}};
const peer={...owner,uid:'synthetic-image-recycled'};
const adminIdentity={...owner,uid:'synthetic-image-admin',email:'admin@example.test'};
const auth={verifySessionCookie:async(cookie,revoked)=>{assert.equal(revoked,true);if(cookie==='owner')return owner;if(cookie==='peer')return peer;if(cookie==='admin')return adminIdentity;throw Error('Invalid synthetic session');}};
const createLab=pool=>createResearchLab({pool,sources:{readiness:{},run:deny},dispatch:deny});
const create= (pool,mode)=>createHandler({auth,origins:['https://synthetic.example.test'],ownerEmail:'admin@example.test',lab:createLab(pool),readOnly:readOnlyFallback(mode),releaseId:'synthetic-image-rehearsal',worker:{fetch:deny}});
const request=(handler,path,{method='GET',body,cookie='owner'}={})=>handler(new Request('https://synthetic.example.test'+path,{method,headers:{origin:'https://synthetic.example.test',cookie:'__session='+cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
const rows=async(pool,table)=>(await pool.query('SELECT row_to_json(t) AS value FROM "'+table+'" t')).rows.map(x=>JSON.stringify(x.value)).sort();
const snapshot=async()=>{
 const tables=(await normalPool.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[schema])).rows;
 const result={};for(const {tablename} of tables)result[tablename]=await rows(normalPool,tablename);return result;
};
try{
 await admin.query('CREATE SCHEMA "'+schema+'"');
 const options='-c search_path='+schema;
 await migrate(new pg.Pool({...config,options}));
 normalPool=new pg.Pool({...config,options,max:2});
 readPool=new pg.Pool({...config,options:options+' -c default_transaction_read_only=on',max:2});
 assert.equal((await normalPool.query('SELECT max(id) AS version FROM prospectpilot_migrations')).rows[0].version,'034');
 const lab=createLab(normalPool);
 await lab.importCSV(owner,{csv:'First Name,Last Name,Company,Email\nJordan,Image,Synthetic Manufacturing,jordan@example.test'});
 const id=(await lab.list(owner)).leads[0].lead.id;
 const initial=await lab.detail(owner,id);
 for(const [field,value] of Object.entries({planning_decision:{origin:'inbound_request',topic:'retirement_income',identity_confirmed:true,prospect_confirmed:true},residence:{country:'US',scope:'residence',state:'NY'},contact:{channel:'email',address:'jordan@example.test',identity_confirmed:true,outreach_basis:'person_requested'}}))
  await lab.review(owner,id,{field,value,verdict:'confirmed',source:'Synthetic image fixture',note:'Fictional disclosure',observed_at:new Date().toISOString(),identity_signature:initial.quality.identity_signature});
 // Seed pending and leased work plus paid reservation without invoking a provider.
 await normalPool.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('image-job',$1,'enrich','image-job','synthetic',100)",[owner.uid]);
 for(const [id,status] of [['image-pending','pending'],['image-running','running']])await normalPool.query("INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,payload,status,lease_token,lease_until) VALUES($1,'image-job',$2,'enrich','synthetic','{}',$3,$4,now()+interval '1 hour')",[id,owner.uid,status,status==='running'?'synthetic-lease':null]);
 await normalPool.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('image-running',$1,'synthetic',100)",[owner.uid]);
 const normal=create(normalPool,'false'),readonly=create(readPool,'true');
 assert.equal((await request(normal,'/api/lab/worklist')).status,200);
 let detail=await lab.advisor.detail(owner,id);
 const outcome={outcome:'follow_up',note:'Synthetic commitment before activation.',next_at:new Date(Date.now()+86400000*3).toISOString(),signature:detail.action.signature,idempotency_key:'image-before'};
 assert.equal((await request(normal,'/api/lab/leads/'+id+'/activity',{method:'POST',body:outcome})).status,200);
 // Historical evidence is created BEFORE fallback/guarded restart, not only afterwards.
 const historicalApp=createProspectWorkspace({pool:normalPool});
 const historicalCSV='First Name,Last Name,Company,Email\nJamie,Historical,Former Fixture,former-image@example.test';
 await historicalApp.importCSV(owner,{csv:historicalCSV,source:'Synthetic historical seed'});
 const historicalId=(await historicalApp.search(owner)).contacts.find(c=>c.email==='former-image@example.test').id;
 const contactRoute=(id,method='GET',body)=>historicalApp.route(new Request('https://synthetic.example.test/api/prospect/contacts/'+id,{method,...body?{body:JSON.stringify(body)}:{}}),owner);
 const originalContact=(await contactRoute(historicalId)).contact;
 await contactRoute(historicalId,'PATCH',{fields:{company:'Current Fixture',email:'current-image@example.test'},reason:'Synthetic confirmed correction',revision:originalContact.edit_revision});
 await contactRoute(historicalId,'DELETE');
 const markers=await rows(normalPool,'prospect_historical_identifiers');assert.ok(markers.length);
 assert.doesNotMatch(markers.join(''),/former-image@example|current-image@example|Jamie/);
 const before=await snapshot();
 assert.equal((await request(readonly,'/version')).status,200);
 const work=await (await request(readonly,'/api/fallback/worklist')).json();assert.equal(work.total,1);assert.equal(work.items[0].quality.status,'verified');
 assert.equal((await request(readonly,'/api/fallback/brief/'+id)).status,200);
 assert.equal((await request(readonly,'/api/fallback/brief/'+id,{cookie:'peer'})).status,404);
 for(const path of ['/api/lab/leads/'+id+'/activity','/api/prospect/jobs','/api/prospect/networking','/api/stripe/webhook'])assert.equal((await request(readonly,path,{method:'POST',body:outcome})).status,503,path);
 await assert.rejects(readPool.query("UPDATE prospect_tasks SET status='completed'"),{code:'25006'});
 const worker=spawnSync(process.execPath,['research-worker.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PROSPECTPILOT_READ_ONLY:'true'},encoding:'utf8',timeout:15000});
 assert.equal(worker.status,0,worker.stderr);assert.match(worker.stdout,/"executed":false/);
 assert.deepEqual(await snapshot(),before,'Read-only activation altered persisted data');
 // Recovery means normal web capability returns; deliberately never replay paid queues.
 let recovered;
 guard=await startRollbackRuntime({client:new pg.Client({...config,options}),start:async()=>{recovered=create(normalPool,'false');}});
 assert.deepEqual(await snapshot(),before,'Guarded full-function startup altered persisted data');
 assert.equal((await request(recovered,'/api/lab/worklist')).status,200);
 assert.equal((await (await request(recovered,'/api/lab/worklist',{cookie:'peer'})).json()).total,0,'recycled email must not gain UID worklist');
 detail=await lab.advisor.detail(owner,id);
 assert.equal((await request(recovered,'/api/lab/leads/'+id+'/activity',{method:'POST',body:{...outcome,note:'Synthetic recovery commitment.',signature:detail.action.signature,idempotency_key:'image-after'}})).status,200);
 for(const table of ['prospect_jobs','prospect_tasks','prospect_charges','lab_observations','prospectpilot_migrations'])assert.deepEqual(await rows(normalPool,table),before[table],table+' changed during recovery');
 assert.equal((await lab.advisor.detail(owner,id)).activities.length,2);
 // Exercise the extracted runtime's same-number DNC replay and export policy.
 const app=createProspectWorkspace({pool:normalPool});
 const header='First Name,Last Name,Company,Email,Direct Phone,Mobile Phone,Direct Phone Do Not Call,Mobile Phone Do Not Call\n';
 await app.importCSV(owner,{source:'Synthetic mobile',csv:header+'Phone,Fixture,Fixture Works,phone@example.test,,2125550199,,false'});
 await app.importCSV(owner,{source:'Synthetic direct DNC',csv:header+'Phone,Fixture,Fixture Works,phone@example.test,2125550199,2125550199,true,false'});
 const c=(await app.search(owner)).contacts.find(c=>c.email==='phone@example.test');
 assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
 assert.equal((await(await app.exportCSV(owner,{ids:[c.id]})).text()).includes('+12125550199'),false);
 assert.equal((await app.search(peer)).contacts.length,0);
 // Capture-only aliases must survive as hashed tombstones on deletion.
 const capture=await app.captureNetworking(owner,{request_key:'rollback-image-alias',kind:'in_person',person:{first_name:'Phone',last_name:'Fixture',company:'New Alias Company',email:'phone@example.test',linkedin_url:'https://www.linkedin.com/in/rollback-image-fixture'},context:'Synthetic only'});
 assert.equal(capture.capture.contact_id,c.id);
 const client=await normalPool.connect();try{await client.query('BEGIN');await forgetPerson(client,owner,{contactId:c.id},{contactKeys:identityLookupKeys});await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 const aliasKeys=identityLookupKeys({linkedin_url:'https://www.linkedin.com/in/rollback-image-fixture'});
 assert.ok(aliasKeys.length);assert.equal((await forgottenKeys(normalPool,owner.uid,aliasKeys)).size,aliasKeys.length);
 assert.equal((await app.networkingHistory(owner)).captures.length,0);
 // The recovered handler must preserve034 holds, not merely accept its tables.
 const held=await historicalApp.importCSV(owner,{csv:historicalCSV,source:'Synthetic after guarded return'});
 assert.equal(held.added,0);assert.equal(held.conflicts,1);
 const reviewList=await (await request(recovered,'/api/lab/historical-identity-reviews')).json();
 assert.equal(reviewList.total,1);const historicalReview=reviewList.reviews[0];
 assert.equal(historicalReview.arrival.email,'former-image@example.test');
 assert.doesNotMatch(JSON.stringify(reviewList),/current-image@example|key_hash|token_owner_id|key_version/);
 assert.equal((await (await request(recovered,'/api/lab/historical-identity-reviews',{cookie:'peer'})).json()).total,0);
 const approval={decision:'different_person',confirmed_distinct:true,reason:'Synthetic source confirms a different person'};
 const reviewPath='/api/lab/historical-identity-reviews/'+historicalReview.id;
 assert.equal((await request(recovered,reviewPath,{method:'POST',body:approval,cookie:'peer'})).status,404);
 const preRotation=await snapshot();
 process.env.FORGET_TOMBSTONE_KEY='synthetic-rotated-'+randomBytes(32).toString('hex');
 await assert.rejects(historicalApp.importCSV(owner,{csv:historicalCSV,source:'Synthetic uncovered rotation'}),{status:503});
 assert.equal((await request(recovered,reviewPath,{method:'POST',body:approval})).status,503);
 assert.deepEqual(await snapshot(),preRotation,'Missing key coverage must not mutate rows');
 process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS=JSON.stringify([syntheticKey]);
 const approved=await request(recovered,reviewPath,{method:'POST',body:approval});assert.equal(approved.status,200);
 const resolved=await approved.json();assert.ok(resolved.id);
 assert.equal((await contactRoute(resolved.id)).contact.email,'former-image@example.test');
 assert.equal((await request(recovered,reviewPath,{method:'POST',body:approval})).status,409);
 const cleared=(await normalPool.query('SELECT candidate,payload FROM prospect_historical_reviews WHERE id=$1',[historicalReview.id])).rows[0];
 assert.deepEqual(cleared,{candidate:{},payload:{}});
 const replay=await historicalApp.importCSV(owner,{csv:historicalCSV,source:'Synthetic after guarded return'});
 assert.equal(replay.conflicts,0);assert.equal(replay.rows[0].status,'reviewed');
 assert.equal((await historicalApp.importCSV(owner,{csv:historicalCSV.replace('Former Fixture','Current Fixture').replace('former-image@example.test','current-image@example.test'),source:'Synthetic definitive restriction'})).rejected,1);
 await contactRoute(resolved.id,'DELETE');
 assert.equal((await normalPool.query('SELECT status FROM prospect_historical_reviews WHERE id=$1',[historicalReview.id])).rows[0].status,'discarded');
 // HTTP guard exercised through real handler; queue guard exercised directly,
 // plus runtime worker wiring checked. No normal worker/paid queues are started.
 for(const path of ['/api/v3/discovery/imports/csv','/api/enrichment/commit','/api/research/auto','/api/research/save','/api/wealthfeed/check','/api/beta/calls']){
  assert.equal((await request(recovered,path,{method:'POST',body:{}})).status,403,path+' denies ordinary user before legacy delegation');
  const denied=await request(recovered,path,{method:'POST',body:{},cookie:'admin'});
  assert.equal(denied.status,409,path+' denies administrator mutation at identity guard');
  assert.match((await denied.json()).detail,/\/prospect.*\/lab/);
 }
 const guardedQueue=await fetchLegacySafely({fetch:deny},new Request('https://synthetic.example.test/api/research/auto',{method:'POST',body:'{}'}),{});
 assert.equal(guardedQueue.status,409);
 const workerSource=readFileSync(new URL('../research-worker.mjs',import.meta.url),'utf8');
 assert.match(workerSource,/fetchLegacySafely\(worker,/);assert.doesNotMatch(workerSource,/await worker\.fetch\(/);
 for(const table of ['prospect_jobs','prospect_tasks','prospect_charges'])assert.deepEqual(await rows(normalPool,table),before[table],table+' changed during historical/legacy recovery checks');
 assert.equal(externalCalls,0);
 console.log(JSON.stringify({verified:true,schema:'034',historical_hold_resolution:true,key_rotation_fail_closed:true,historical_review_privacy:true,legacy_web_guard:true,legacy_queue_guard:'direct helper plus runtime wiring; normal worker not executed',phases:['normal','readonly','guarded-full-function-return'],dnc_replay_export:true,uid_isolation:true,capture_alias_tombstone:true,pending_and_leased_tasks_retained:true,reservations_retained:true,worker_executed:false,external_calls:0,auth:'injected synthetic, not Firebase',scope:'guarded runtime-image handler restart, not different successor image, actual server entrypoint, real Firebase or production rollout'}));
}finally{
 globalThis.fetch=originalFetch;
 if(priorKey===undefined)delete process.env.FORGET_TOMBSTONE_KEY;else process.env.FORGET_TOMBSTONE_KEY=priorKey;
 if(priorKeys===undefined)delete process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS;else process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS=priorKeys;
 await guard?.close();
 await readPool?.end();await normalPool?.end();
 await admin.query('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');await admin.end();
}
