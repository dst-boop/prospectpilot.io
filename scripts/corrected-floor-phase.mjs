// Test-only image overlay. App imports resolve ONLY inside each image.
// Receipt attests synthetic row continuity, not image provenance or production readiness.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrate} from '../migrate.mjs';
import {createHandler} from '../handler.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {readOnlyFallback} from '../readonly-fallback.mjs';
import {startRollbackRuntime} from '../rollback-bootstrap.mjs';
import {createProspectWorkspace,identityLookupKeys} from '../prospect-workspace.mjs';
import {phoneReadiness} from '../prospect-data-quality.mjs';
import {forgetPerson,forgottenKeys} from '../forget.mjs';
import {fetchLegacySafely} from '../legacy-identity-guard.mjs';
export function validateTwoImageEnvironment(env){
 if(env.NODE_ENV==='production')throw Error('Synthetic phase refuses production');
 if(env.TWO_IMAGE_SYNTHETIC!=='1'||env.ROLLBACK_SYNTHETIC_BOOTSTRAP!=='1')throw Error('Explicit synthetic two-image and network guard markers required');
 if(!/^[a-f0-9]{24}$/.test(env.TWO_IMAGE_NONCE||'')||env.TWO_IMAGE_SCHEMA!=='pp_two_'+env.TWO_IMAGE_NONCE)throw Error('Invalid synthetic fixture identity');
 if(!/^synthetic-two-image-[a-f0-9]{64}$/.test(env.TWO_IMAGE_KEY||''))throw Error('Synthetic fixture key required');
 if(Object.entries(env).some(([k,v])=>v&&((/^PG/i.test(k)&&!['PGHOST','PGPORT'].includes(k))||/^FORGET_TOMBSTONE/.test(k))))throw Error('Inherited database or identity settings forbidden');
 let url;try{url=new URL(env.STAGING_DATABASE_URL||'');}catch{throw Error('Invalid synthetic database');}
 const port=Number(url.port||5432);
 if(url.protocol!=='postgres:'||url.hostname!=='127.0.0.1'||url.username!=='postgres'||url.password!=='synthetic-ci-only'||url.pathname!=='/prospectpilot_test'||url.search||url.hash||!Number.isInteger(port)||port<1||port>65535||env.PGHOST!=='127.0.0.1'||env.PGPORT!==String(port))throw Error('Only fixed synthetic loopback database permitted');
 return {schema:env.TWO_IMAGE_SCHEMA,nonce:env.TWO_IMAGE_NONCE,key:env.TWO_IMAGE_KEY,config:{host:'127.0.0.1',port,user:'postgres',password:'synthetic-ci-only',database:'prospectpilot_test',ssl:false,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:17000}};
}
export function validateTwoImageReceipt(text,{schema,nonce}){
 if(typeof text!=='string'||Buffer.byteLength(text)>16384)throw Error('Invalid bounded receipt');
 let value;try{value=JSON.parse(text);}catch{throw Error('Invalid receipt JSON');}
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='digest,nonce,schema,version'||value.version!==1||value.schema!==schema||value.nonce!==nonce||!/^[a-f0-9]{64}$/.test(value.digest||''))throw Error('Receipt not bound to synthetic fixture');
 return value;
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function readReceipt(){let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>16384)throw Error('Receipt limit exceeded');}return input;}
export async function runTwoImagePhase(mode,env=process.env){
 assert.ok(['--successor','--floor'].includes(mode),'Explicit image phase required');
 const {schema,nonce,key:syntheticKey,config}=validateTwoImageEnvironment(env);
 const receipt=mode==='--floor'?validateTwoImageReceipt(await readReceipt(),{schema,nonce}):null;
 process.env.FORGET_TOMBSTONE_KEY=syntheticKey;
 const options='-c search_path='+schema;
 let guard;
 const normalPool=new pg.Pool({...config,options,max:2});
 let externalCalls=0;
 const deny=()=>{externalCalls++;throw Error('Synthetic two-image forbids providers');};
 const owner={uid:'synthetic-image-advisor',email:'image@example.test',email_verified:true,firebase:{sign_in_provider:'password'}};
 const peer={...owner,uid:'synthetic-image-recycled'};
 const productIdentity={...owner,uid:'synthetic-product-'+mode.slice(2),email:'product@example.test'};
 const adminIdentity={...owner,uid:'synthetic-image-admin',email:'admin@example.test'};
 const auth={verifySessionCookie:async(cookie,revoked)=>{assert.equal(revoked,true);if(cookie==='owner')return owner;if(cookie==='peer')return peer;if(cookie==='admin')return adminIdentity;if(cookie==='product')return productIdentity;throw Error('Invalid synthetic session');}};
 const createLab=pool=>createResearchLab({pool,sources:{readiness:{},quote:()=>0,run:deny},dispatch:async()=>false});
 const create=pool=>createHandler({auth,origins:['https://synthetic.example.test'],ownerEmail:'admin@example.test',lab:createLab(pool),readOnly:readOnlyFallback('false'),releaseId:'synthetic-two-image',worker:{fetch:deny}});
 const request=(handler,path,{method='GET',body,cookie='owner'}={})=>handler(new Request('https://synthetic.example.test'+path,{method,headers:{origin:'https://synthetic.example.test',cookie:'__session='+cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 const rows=async(pool,table)=>{assert.match(table,/^[a-z_]+$/);return(await pool.query('SELECT row_to_json(t) AS value FROM "'+table+'" t')).rows.map(x=>JSON.stringify(x.value)).sort();};
 const snapshot=async()=>{const tables=(await normalPool.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename",[schema])).rows;const result={};for(const {tablename} of tables)result[tablename]=await rows(normalPool,tablename);return result;};
 const historicalCSV='First Name,Last Name,Company,Email\nJamie,Historical,Former Fixture,former-image@example.test';
 const header='First Name,Last Name,Company,Email,Direct Phone,Mobile Phone,Direct Phone Do Not Call,Mobile Phone Do Not Call\n';
 const productProbe=async handler=>{
  const response=await request(handler,'/api/lab/runs',{method:'POST',cookie:'product',body:{employers:['Synthetic Namesake'],states:['NY'],sources:['public_web'],max_companies:10,plan_filter:{order:'former_employee_population'},idempotency_key:'two-image-'+mode.slice(2)}});
  assert.equal(response.status,200);const run=await response.json();
  const visible=await request(handler,'/api/lab/runs/'+run.id,{cookie:'product'});assert.equal(visible.status,200);
  const tasks=(await visible.json()).tasks;
  assert.equal(tasks.length,1);const payload=tasks[0].payload;
   assert.equal(payload.plan_identity_review,true);assert.equal(payload.plan_candidates.length,2);
   assert.deepEqual(payload.plan_candidates.map(p=>p.ein).sort(),['111111111','222222222']);
   assert.deepEqual(payload.plan_candidates.map(p=>p.separated_future_benefits).sort((a,b)=>a-b),[15,40],'Separate filings never summed');
   assert.equal(payload.city,'');assert.equal(payload.state,'');assert.ok(!payload.plan_id&&!payload.sponsor_ein&&!payload.website);
 };

 try{
  assert.equal((await normalPool.query('SELECT current_schema() AS schema')).rows[0].schema,schema,'Orchestrator must create exact isolated schema');
  if(mode==='--successor'){
   assert.deepEqual(await snapshot(),{},'Successor never reuses nonempty fixture');
   await migrate(new pg.Pool({...config,options,max:1}));
   for(const [id,ein,city,count,assets] of [['synthetic-ein-one','111111111','Albany',15,1000],['synthetic-ein-two','222222222','Buffalo',40,2000]]){
    const year=new Date().getUTCFullYear()-1;
    await normalPool.query('INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload) VALUES($1,$2,$3,$4,$5)',[id,'synthetic namesake','NY',year,JSON.stringify({id,sponsor:'Synthetic Namesake',sponsor_key:'synthetic namesake',state:'NY',city,ein,plan_number:'001',plan_year:year,separated_future_benefits:count,participants_with_balances:100,net_assets:assets,scope:'employer_plan',individual_balance:null})]);
   }

  }
  const lab=createLab(normalPool),historicalApp=createProspectWorkspace({pool:normalPool});
  const contactRoute=(id,method='GET',body)=>historicalApp.route(new Request('https://synthetic.example.test/api/prospect/contacts/'+id,{method,...body?{body:JSON.stringify(body)}:{}}),owner);
  if(mode==='--successor'){
 await lab.importCSV(owner,{csv:'First Name,Last Name,Company,Email\nJordan,Image,Synthetic Manufacturing,jordan@example.test'});
 const id=(await lab.list(owner)).leads[0].lead.id;
 const initial=await lab.detail(owner,id);
 for(const [field,value] of Object.entries({planning_decision:{origin:'inbound_request',topic:'retirement_income',identity_confirmed:true,prospect_confirmed:true},residence:{country:'US',scope:'residence',state:'NY'},contact:{channel:'email',address:'jordan@example.test',identity_confirmed:true,outreach_basis:'person_requested'}}))
  await lab.review(owner,id,{field,value,verdict:'confirmed',source:'Synthetic image fixture',note:'Fictional disclosure',observed_at:new Date().toISOString(),identity_signature:initial.quality.identity_signature});
 // Seed pending and leased work plus paid reservation without invoking a provider.
 await normalPool.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('image-job',$1,'enrich','image-job','synthetic',100)",[owner.uid]);
 for(const [id,status] of [['image-pending','pending'],['image-running','running']])await normalPool.query("INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,payload,status,lease_token,lease_until) VALUES($1,'image-job',$2,'enrich','synthetic','{}',$3,$4,now()+interval '1 hour')",[id,owner.uid,status,status==='running'?'synthetic-lease':null]);
 await normalPool.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('image-running',$1,'synthetic',100)",[owner.uid]);
 const normal=create(normalPool);
 assert.equal((await request(normal,'/api/lab/worklist')).status,200);
 let detail=await lab.advisor.detail(owner,id);
 const outcome={outcome:'follow_up',note:'Synthetic commitment before activation.',next_at:new Date(Date.now()+86400000*3).toISOString(),signature:detail.action.signature,idempotency_key:'image-before'};
 assert.equal((await request(normal,'/api/lab/leads/'+id+'/activity',{method:'POST',body:outcome})).status,200);
 await historicalApp.importCSV(owner,{csv:historicalCSV,source:'Synthetic historical seed'});
 const historicalId=(await historicalApp.search(owner)).contacts.find(c=>c.email==='former-image@example.test').id;
 const originalContact=(await contactRoute(historicalId)).contact;
 await contactRoute(historicalId,'PATCH',{fields:{company:'Current Fixture',email:'current-image@example.test'},reason:'Synthetic confirmed correction',revision:originalContact.edit_revision});
 await contactRoute(historicalId,'DELETE');
 const markers=await rows(normalPool,'prospect_historical_identifiers');assert.ok(markers.length);
 assert.doesNotMatch(markers.join(''),/former-image@example|current-image@example|Jamie/);
 const app=historicalApp;
 await app.importCSV(owner,{source:'Synthetic mobile',csv:header+'Phone,Fixture,Fixture Works,phone@example.test,,2125550199,,false'});
 await app.importCSV(owner,{source:'Synthetic direct DNC',csv:header+'Phone,Fixture,Fixture Works,phone@example.test,2125550199,2125550199,true,false'});
 const c=(await app.search(owner)).contacts.find(c=>c.email==='phone@example.test');
 assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
 assert.equal((await(await app.exportCSV(owner,{ids:[c.id]})).text()).includes('+12125550199'),false);
 assert.equal((await app.search(peer)).contacts.length,0);
 // Capture-only aliases must survive as hashed tombstones on deletion.
 const capture=await app.captureNetworking(owner,{request_key:'rollback-image-alias',kind:'in_person',person:{first_name:'Phone',last_name:'Fixture',company:'New Alias Company',email:'phone@example.test',linkedin_url:'https://www.linkedin.com/in/rollback-image-fixture'},context:'Synthetic only'});
 assert.equal(capture.capture.contact_id,c.id);
 await productProbe(normal);
 assert.equal(externalCalls,0);
 console.log('TWO_IMAGE_RECEIPT:'+JSON.stringify({version:1,nonce,schema,digest:hash(await snapshot())}));
 return;
 }

 let recovered;
 guard=await startRollbackRuntime({client:new pg.Client({...config,options}),start:async()=>{recovered=create(normalPool);}});
 const before=await snapshot();assert.equal(hash(before),receipt.digest,'Every successor row retained before floor writes');
 const id=(await lab.list(owner)).leads.find(x=>x.lead.email==='jordan@example.test')?.lead.id || (await lab.list(owner)).leads[0].lead.id;
 assert.equal((await request(recovered,'/api/lab/worklist')).status,200);
 assert.equal((await (await request(recovered,'/api/lab/worklist',{cookie:'peer'})).json()).total,0);
 let detail=await lab.advisor.detail(owner,id);
 assert.equal(detail.activities.length,1);
 const outcome={outcome:'follow_up',note:'Synthetic floor commitment',next_at:new Date(Date.now()+86400000*3).toISOString(),signature:detail.action.signature,idempotency_key:'image-before'};
 const replayBefore=await snapshot();
 assert.equal((await request(recovered,'/api/lab/leads/'+id+'/activity',{method:'POST',body:outcome})).status,200);
 assert.deepEqual(await snapshot(),replayBefore,'Successor activity idempotency is retained by floor');
 detail=await lab.advisor.detail(owner,id);
 assert.equal((await request(recovered,'/api/lab/leads/'+id+'/activity',{method:'POST',body:{...outcome,signature:detail.action.signature,idempotency_key:'image-after'}})).status,200);
 assert.equal((await lab.advisor.detail(owner,id)).activities.length,2);
 for(const table of ['prospect_jobs','prospect_tasks','prospect_charges','lab_observations','prospectpilot_migrations'])assert.deepEqual(await rows(normalPool,table),before[table]);
 const app=historicalApp;
 const c=(await app.search(owner)).contacts.find(c=>c.email==='phone@example.test');
 assert.ok(c);assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
 assert.equal((await(await app.exportCSV(owner,{ids:[c.id]})).text()).includes('+12125550199'),false);
 assert.equal((await app.search(peer)).contacts.length,0);
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

 await productProbe(recovered);
 for(const table of ['lab_runs','lab_tasks']){const current=await rows(normalPool,table);for(const row of before[table])assert.ok(current.includes(row),'Successor pending task/run retains sponsor ambiguity context');}
 await guard.close();guard=null;
 const pre035=await snapshot();let admitted035=false;
 try{
  await normalPool.query("INSERT INTO prospectpilot_migrations(id) VALUES('035')");
  await assert.rejects(startRollbackRuntime({client:new pg.Client({...config,options}),start:async()=>{admitted035=true;}}),error=>/verification refused/.test(error.message)&&/001 through034/.test(error.cause?.message||''));
  assert.equal(admitted035,false);
 }finally{await normalPool.query("DELETE FROM prospectpilot_migrations WHERE id='035'");}
 assert.deepEqual(await snapshot(),pre035);
 console.log('TWO_IMAGE_RESULT:'+JSON.stringify({verified:true,fullCompatibility:false,sponsorIdentityCompatible:true,localDownloadAbsentOnFloor:true,productCompatibility:'sponsor identity preserved; successor local download absent on floor; browser proof separate; no rollout approval',nonce,schema,successor_rows_preserved:true,activity_idempotency:true,advice_decisions_preserved:true,dnc_export:true,uid_isolation:true,historical_hold_resolution:true,key_coverage_fail_closed:true,privacy_deletion:true,alias_tombstones:true,queues_reservations_unchanged:true,schema035_refused:true,external_calls:externalCalls,auth:'injected synthetic; not Firebase',worker_executed:false,scope:'distinct image handler semantics; provenance asserted by orchestrator, not production rollout'}));
 }finally{
  delete process.env.FORGET_TOMBSTONE_KEY;delete process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS;
  try{await guard?.close();}finally{await normalPool.end();}
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 if(process.argv.length!==3)throw Error('One explicit two-image phase required');
 await runTwoImagePhase(process.argv[2]);
}
