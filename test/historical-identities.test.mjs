import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOwnershipTestDatabase} from './ownership-test-database.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createResearchLab} from '../research-lab.mjs';
const owner={uid:'owner',email:'owner@example.com'},other={uid:'other',email:'other@example.com'};
const csv='First Name,Last Name,Company,Email\nJamie,Rivera,Old Employer,old@example.com';
const files=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
async function fixture(fn){const db=await createOwnershipTestDatabase();try{
 for(const file of files)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 const ws=createProspectWorkspace({pool}),lab=createResearchLab({pool,sources:{readiness:{}}});
 const route=(id,method='GET',body,user=owner)=>ws.route(new Request('https://example.com/api/prospect/contacts/'+id,{method,...body?{body:JSON.stringify(body)}:{}}),user);
 await fn({db,pool,ws,lab,route});
}finally{await db.close();}}
async function changedThenDeleted({ws,route,db},{legacy=false}={}){
 await ws.importCSV(owner,{csv});const id=(await ws.search(owner)).contacts[0].id;
 const before=(await route(id)).contact;
 await route(id,'PATCH',{fields:{company:'New Employer',email:'new@example.com'},reason:'Confirmed employer move',revision:before.edit_revision});
 // Trimming display history must not remove durable import evidence.
 if(!legacy)await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{source_history}','[]') WHERE id=$1",[id]);
 else await db.query('DELETE FROM prospect_identity_evidence WHERE record_id=$1',[id]);
 await route(id,'DELETE');return id;
}
const approve={decision:'different_person',confirmed_distinct:true,reason:'Reviewed current source: reassigned work address belongs to a different person.'};

test('former identifier is held after correction/deletion; owner review saves exact arrival without overriding current tombstones',()=>fixture(async f=>{
 await changedThenDeleted(f);const {ws,lab,db}=f;
 const held=await ws.importCSV(owner,{csv,source:'Later delivery'});
 assert.equal(held.added,0);assert.equal(held.conflicts,1);assert.equal(held.rows[0].status,'identity_review');
 assert.equal((await ws.search(owner)).total,0);
 const list=await lab.historicalIdentityReviews(owner);assert.equal(list.total,1);assert.equal(list.reviews[0].arrival.email,'old@example.com');
 assert.equal(JSON.stringify(list).includes('new@example.com'),false);
 const id=list.reviews[0].id;
 await assert.rejects(lab.resolveHistoricalIdentity(owner,id,{decision:'different_person'}),{status:422});
 await assert.rejects(lab.resolveHistoricalIdentity(other,id,approve),{status:404});
 const result=await lab.resolveHistoricalIdentity(owner,id,approve);assert.equal(result.resolved,true);
 assert.equal((await ws.search(owner)).total,1);
 await assert.rejects(lab.resolveHistoricalIdentity(owner,id,approve),{status:409});
 const replay=await ws.importCSV(owner,{csv,source:'Later delivery'});assert.equal(replay.rows[0].contact_id,result.id);assert.equal(replay.conflicts,0);assert.equal(replay.added,1);
 const fresh=await ws.importCSV(owner,{csv,source:'Another delivery'});assert.equal(fresh.duplicates,1);assert.equal(fresh.conflicts,0);
 assert.equal((await ws.importCSV(owner,{csv:csv.replace('old@example.com','new@example.com').replace('Old Employer','New Employer'),source:'Current deleted identity'})).rejected,1);
 const stored=(await db.query('SELECT candidate,payload FROM prospect_historical_reviews WHERE id=$1',[id])).rows[0];assert.deepEqual(stored,{candidate:{},payload:{}});
 await f.route(result.id,'DELETE');assert.equal((await ws.importCSV(owner,{csv,source:'Again after second delete'})).rejected,1);
}));

test('tenant isolation, namesakes, ambiguous changed name, preview and discard remain safe',()=>fixture(async f=>{
 await changedThenDeleted(f);const {ws,lab,db}=f;
 assert.equal((await ws.importCSV(other,{csv})).added,1);
 assert.equal((await ws.importCSV(owner,{csv:csv.replace('old@example.com','unrelated@example.com'),source:'Namesake'})).added,1);
 const incoming=csv.replace('Jamie,Rivera','Taylor,Else');
 const preview=await ws.importCSV(owner,{csv:incoming},{preview:true});assert.equal(preview.added,0);assert.equal(preview.conflicts,1);assert.equal((await lab.historicalIdentityReviews(owner)).total,0);
 const held=await ws.importCSV(owner,{csv:incoming});assert.equal(held.added,0);
 const id=(await lab.historicalIdentityReviews(owner)).reviews[0].id;
 await lab.resolveHistoricalIdentity(owner,id,{decision:'discard'});
 assert.equal((await lab.historicalIdentityReviews(owner)).total,0);
 const report=(await db.query('SELECT result FROM prospect_imports WHERE id=$1',[held.id])).rows[0].result;assert.equal(report.rows[0].name,undefined);
 assert.equal((await lab.historicalIdentityReviews(other)).total,0);
}));

test('legacy exact retained correction history can hold an old key; missing legacy evidence is not invented',()=>fixture(async f=>{
 await changedThenDeleted(f,{legacy:true});assert.equal((await f.ws.importCSV(owner,{csv,source:'Legacy arrival'})).conflicts,1);
 const rows=(await f.db.query('SELECT * FROM prospect_historical_identifiers')).rows;
 assert.ok(rows.every(r=>/^[a-f0-9]{64}$/.test(r.key_hash)));
 assert.equal(JSON.stringify(rows).includes('example.com'),false);
}));

test('new current tombstone after hold and live collision are rechecked before approval',()=>fixture(async f=>{
 await changedThenDeleted(f);await f.ws.importCSV(owner,{csv,source:'Queued'});
 const id=(await f.lab.historicalIdentityReviews(owner)).reviews[0].id;
 const {tombstone}=await import('../forget.mjs');
 await f.db.query('INSERT INTO prospect_forgotten(user_id,key_hash) VALUES($1,$2)',[owner.uid,tombstone(owner.uid,'email:old@example.com')]);
 await assert.rejects(f.lab.resolveHistoricalIdentity(owner,id,approve),{status:409});
 assert.equal((await f.ws.search(owner)).total,0);
 assert.equal((await f.lab.historicalIdentityReviews(owner)).total,1);
}));


test('Research Lab arrival is held and explicit distinct-person decision saves an unqualified owned lead',()=>fixture(async f=>{
 await changedThenDeleted(f);
 const held=await f.lab.importCSV(owner,{csv});
 assert.equal((await f.lab.list(owner)).leads.length,0);
 const reviews=await f.lab.historicalIdentityReviews(owner);assert.equal(reviews.total,1);assert.equal(reviews.reviews[0].destination,'lead');
 const result=await f.lab.resolveHistoricalIdentity(owner,reviews.reviews[0].id,approve);
 assert.equal(result.destination,'lead');assert.equal((await f.lab.list(owner)).leads.length,1);
 assert.equal((await f.lab.list(other)).leads.length,0);
}));

test('provider search holds historical arrivals without a second paid call on manual resolution',()=>fixture(async f=>{
 await changedThenDeleted(f);const {createProspectJobs}=await import('../prospect-jobs.mjs');let calls=0;
 const jobs=createProspectJobs({pool:f.pool,providers:{readiness:{search:true},search:async()=>{calls++;return {contacts:[{first_name:'Jamie',last_name:'Rivera',company:'Old Employer',email:'old@example.com'}],retrieved:1,total:1};}},config:{dailyBudgetMicros:100000,prices:{search:1000}},pacingMs:{pdl:0}});
 const job=await jobs.enqueue(owner,{action:'search',filters:{company:'Old Employer'},size:1,max_cost_micros:1000,idempotency_key:'historical-provider-search'});
 await jobs.tick();assert.equal((await f.ws.search(owner)).total,0);assert.equal(calls,1);
 assert.equal((await jobs.jobs(owner,job.id)).tasks[0].result.conflicts,1);
 const review=(await f.lab.historicalIdentityReviews(owner)).reviews[0];
 await f.lab.resolveHistoricalIdentity(owner,review.id,approve);assert.equal((await f.ws.search(owner)).total,1);assert.equal(calls,1);
}));

test('networking holds preserve private capture only after explicit owner resolution',()=>fixture(async f=>{
 await changedThenDeleted(f);
 const input={request_key:'historical-networking-request',person:{first_name:'Jamie',last_name:'Rivera',company:'Old Employer',email:'old@example.com'},kind:'in_person',context:'Private synthetic conference',occurred_on:'2026-09-01',note:'Private synthetic note'};
 const held=await f.ws.captureNetworking(owner,input);assert.equal(held.conflicts,1);assert.equal(held.capture,undefined);
 assert.equal((await f.ws.networkingHistory(owner)).captures.length,0);
 const list=await f.lab.historicalIdentityReviews(owner);assert.equal(JSON.stringify(list).includes('Private synthetic note'),false);
 await f.lab.resolveHistoricalIdentity(owner,list.reviews[0].id,approve);
 assert.equal((await f.ws.networkingHistory(owner)).captures.length,1);
 assert.equal((await f.ws.networkingHistory(other)).captures.length,0);
 const replay=await f.ws.captureNetworking(owner,input);assert.equal(replay.capture.contact_id,(await f.ws.search(owner)).contacts[0].id);
}));

test('missing legacy evidence does not invent a former association; stale list and live collisions cannot save',()=>fixture(async f=>{
 await changedThenDeleted(f);await f.db.query('DELETE FROM prospect_historical_identifiers');
 assert.equal((await f.ws.importCSV(owner,{csv,source:'Missing evidence'})).added,1);
 // Restore a fresh synthetic historical marker through an actual correction/deletion.
 const id=(await f.ws.search(owner)).contacts[0].id,before=(await f.route(id)).contact;
 await f.route(id,'PATCH',{fields:{email:'third@example.com',company:'Third Employer'},revision:before.edit_revision,reason:'Reviewed change'});await f.route(id,'DELETE');
 const list=await f.ws.createList(owner,{name:'Review destination'});await f.ws.importCSV(owner,{csv,source:'List arrival',list_id:list.id});
 const review=(await f.lab.historicalIdentityReviews(owner)).reviews[0];
 await f.db.query('DELETE FROM prospect_lists WHERE id=$1',[list.id]);
 await assert.rejects(f.lab.resolveHistoricalIdentity(owner,review.id,approve),{status:404});
 assert.equal((await f.ws.search(owner)).total,0);
}));

test('native PostgreSQL serializes competing review decisions without duplicate contacts',{skip:!process.env.POSTGRES_TEST_URL,timeout:20000},()=>fixture(async f=>{
 await changedThenDeleted(f);await f.ws.importCSV(owner,{csv,source:'Concurrent review'});
 const id=(await f.lab.historicalIdentityReviews(owner)).reviews[0].id;
 const pg=(await import('pg')).default,schema=(await f.db.query('SELECT current_schema() AS name')).rows[0].name;
 const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,options:`-c search_path=${schema} -c statement_timeout=10000`,max:3,connectionTimeoutMillis:5000});
 try{const lab=createResearchLab({pool,sources:{readiness:{}}});
  const decisions=await Promise.allSettled([lab.resolveHistoricalIdentity(owner,id,approve),lab.resolveHistoricalIdentity(owner,id,approve)]);
  assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(decisions.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await f.ws.search(owner)).total,1);
 }finally{await pool.end();}
}));


test('keyed holds persist no unkeyed fallback and rotation without coverage fails closed',()=>fixture(async f=>{
 const old=process.env.FORGET_TOMBSTONE_KEY,previous=process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS;
 const first='synthetic-first-key-'.repeat(3),second='synthetic-second-key-'.repeat(3);
 try{
  process.env.FORGET_TOMBSTONE_KEY=first;delete process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS;
  await changedThenDeleted(f);
  await f.ws.importCSV(owner,{csv,source:'Keyed arrival'});
  const review=(await f.lab.historicalIdentityReviews(owner)).reviews[0];
  const {historicalTokens}=await import('../historical-identities.mjs');
  const held=(await f.db.query('SELECT key_hashes FROM prospect_historical_reviews WHERE id=$1',[review.id])).rows[0];
  delete process.env.FORGET_TOMBSTONE_KEY;
  const unkeyed=historicalTokens(owner.uid,{email:'old@example.com'});
  assert.ok(held.key_hashes.every(k=>!unkeyed.includes(k)));
  process.env.FORGET_TOMBSTONE_KEY=second;
  await assert.rejects(f.ws.importCSV(owner,{csv,source:'After rotation'}),{status:503});
  await assert.rejects(f.lab.resolveHistoricalIdentity(owner,review.id,approve),{status:503});
  assert.equal((await f.ws.search(owner)).total,0);
  process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS=JSON.stringify([first]);
  const resolved=await f.lab.resolveHistoricalIdentity(owner,review.id,approve);assert.ok(resolved.id);
  assert.equal((await f.ws.importCSV(owner,{csv:csv.replace('old@example.com','new@example.com').replace('Old Employer','New Employer'),source:'Prior key tombstone'})).rejected,1);
 }finally{if(old===undefined)delete process.env.FORGET_TOMBSTONE_KEY;else process.env.FORGET_TOMBSTONE_KEY=old;if(previous===undefined)delete process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS;else process.env.FORGET_TOMBSTONE_PREVIOUS_KEYS=previous;}
}));

test('enrichment cannot attach a historical identifier until reviewed; approval updates only the unchanged owned contact',()=>fixture(async f=>{
 await changedThenDeleted(f);
 await f.ws.importCSV(owner,{csv:'First Name,Last Name,Company,LinkedIn URL\nJamie,Rivera,Unrelated Employer,https://linkedin.com/in/synthetic-unrelated'});
 const contact=(await f.ws.search(owner)).contacts[0];const {createProspectJobs}=await import('../prospect-jobs.mjs');let calls=0;
 const jobs=createProspectJobs({pool:f.pool,providers:{readiness:{enrichment:true},enrich:async()=>{calls++;return {contact:{first_name:'Jamie',last_name:'Rivera',company:'Unrelated Employer',email:'old@example.com'},checked_at:new Date().toISOString()};}},config:{dailyBudgetMicros:100000,prices:{enrich:1000}},pacingMs:{pdl:0}});
 const job=await jobs.enqueue(owner,{action:'enrich',ids:[contact.id],max_cost_micros:1000,idempotency_key:'historical-enrichment'});await jobs.tick();
 assert.equal((await f.route(contact.id)).contact.email,'');assert.equal(calls,1);
 assert.equal((await jobs.jobs(owner,job.id)).tasks[0].status,'skipped');
 const review=(await f.lab.historicalIdentityReviews(owner)).reviews[0];assert.equal(review.operation,'update_contact');
 const result=await f.lab.resolveHistoricalIdentity(owner,review.id,approve);assert.equal(result.id,contact.id);
 assert.equal((await f.route(contact.id)).contact.email,'old@example.com');assert.equal((await f.ws.search(owner)).total,1);assert.equal(calls,1);
}));

test('manual corrections hold historical identifiers and stale approvals never overwrite later edits',()=>fixture(async f=>{
 await changedThenDeleted(f);await f.ws.importCSV(owner,{csv:'First Name,Last Name,Company,Email\nTaylor,Other,Unrelated Employer,taylor@example.com'});
 const id=(await f.ws.search(owner)).contacts[0].id;
 const before=(await f.route(id)).contact;
 const held=await f.route(id,'PATCH',{fields:{email:'old@example.com'},revision:before.edit_revision,reason:'Reviewing reassigned address'});
 assert.equal(held.held_for_historical_review,true);assert.equal((await f.route(id)).contact.email,'taylor@example.com');
 const review=(await f.lab.historicalIdentityReviews(owner)).reviews[0];
 await f.route(id,'PATCH',{fields:{title:'Updated title'},revision:before.edit_revision,reason:'Current role confirmed'});
 await assert.rejects(f.lab.resolveHistoricalIdentity(owner,review.id,approve),{status:409});
 assert.equal((await f.route(id)).contact.title,'Updated title');assert.equal((await f.route(id)).contact.email,'taylor@example.com');
}));

test('ordinary identity review transitions persist the historical hold instead of rolling it back',()=>fixture(async f=>{
 await changedThenDeleted(f);
 const lead={id:'incoming',first_name:'Jamie',last_name:'Rivera',company:'Old Employer',email:'old@example.com'};
 await f.db.query("INSERT INTO lab_identity_reviews(id,user_id,kind,fingerprint,candidate,key_hashes,match_ids,reason) VALUES('ordinary','owner','unresolved','synthetic',$1::jsonb,'{}','{}','Synthetic unresolved arrival')",[JSON.stringify({lead})]);
 const result=await f.lab.resolveIdentityReview(owner,'ordinary',{decision:'save_new'});
 assert.equal(result.held_for_historical_review,true);assert.equal((await f.lab.historicalIdentityReviews(owner)).total,1);assert.equal((await f.lab.list(owner)).leads.length,0);
 assert.equal((await f.db.query("SELECT status FROM lab_identity_reviews WHERE id='ordinary'")).rows[0].status,'discarded');
}));

test('shared editors cannot inspect owner historical matches or resolve their holds',()=>fixture(async f=>{
 await changedThenDeleted(f);const list=await f.ws.createList(owner,{name:'Shared'});
 await f.db.query("INSERT INTO prospect_list_shares(list_id,recipient_uid,recipient_email,owner_email,role) VALUES($1,$2,$3,$4,'editor')",[list.id,other.uid,other.email,owner.email]);
 const result=await f.ws.route(new Request('https://example.com/api/prospect/lists/'+list.id+'/import',{method:'POST',body:JSON.stringify({csv})}),other);
 assert.equal(result.added,0);assert.equal(result.rows[0].historical_review_id,undefined);assert.doesNotMatch(result.rows[0].message,/prior identifier|historical|deleted/i);
 assert.equal((await f.lab.historicalIdentityReviews(other)).total,0);
 const id=(await f.lab.historicalIdentityReviews(owner)).reviews[0].id;
 await assert.rejects(f.lab.resolveHistoricalIdentity(other,id,approve),{status:404});
 await f.lab.resolveHistoricalIdentity(owner,id,approve);assert.equal((await f.ws.search(owner,{list_id:list.id})).total,1);
}));

test('deleting an update target clears its hold even when the original record had no strong identifiers',()=>fixture(async f=>{
 await changedThenDeleted(f);await f.ws.importCSV(owner,{csv:'First Name,Last Name,Company\nTaylor,Other,Unrelated Employer'});
 const id=(await f.ws.search(owner)).contacts[0].id,before=(await f.route(id)).contact;
 await f.route(id,'PATCH',{fields:{email:'old@example.com'},revision:before.edit_revision,reason:'Unverified incoming address'});
 let reviews=await f.lab.historicalIdentityReviews(owner);assert.equal(reviews.total,1);assert.equal(reviews.reviews[0].existing_record.id,id);assert.equal(reviews.reviews[0].existing_record.name,'Taylor Other');
 const reviewId=reviews.reviews[0].id;
 await f.route(id,'DELETE');
 reviews=await f.lab.historicalIdentityReviews(owner);assert.equal(reviews.total,0);
 const row=(await f.db.query('SELECT candidate,payload,resolution,status FROM prospect_historical_reviews WHERE id=$1',[reviewId])).rows[0];
 assert.deepEqual(row.candidate,{});assert.deepEqual(row.payload,{});assert.equal(JSON.stringify(row).includes('Taylor'),false);
}));

test('verified admin deletion grants only that record historical namespace; unrelated users gain no access',()=>fixture(async f=>{
 await f.lab.importCSV(owner,{csv});const leadId=(await f.lab.list(owner)).leads[0].lead.id;
 // A synthetic historical change whose original committed-import evidence must survive.
 await f.db.query("UPDATE discovery_leads SET payload=(payload::jsonb || '{\"email\":\"new@example.com\",\"company\":\"New Employer\"}'::jsonb)::text WHERE id=$1",[leadId]);
 const remove=user=>f.lab.route(new Request('https://example.com/api/lab/leads/'+leadId,{method:'DELETE',body:JSON.stringify({additional_holders:[other.uid]})}),user);
 await assert.rejects(remove(other),{status:404});
 assert.equal((await f.db.query('SELECT count(*)::int AS n FROM prospect_historical_identifiers')).rows[0].n,0);
 const admin={uid:'admin',email:'admin@example.com'};
 await f.db.query("INSERT INTO discovery_users(user_id,email,full_name,role) VALUES('admin','admin@example.com','Synthetic admin','admin')");
 await remove(admin);
 const grants=(await f.db.query('SELECT DISTINCT user_id,token_owner_id FROM prospect_historical_identifiers ORDER BY user_id')).rows;
 assert.deepEqual(grants,[{user_id:'admin',token_owner_id:'owner'},{user_id:'owner',token_owner_id:'owner'}]);
 assert.equal((await f.ws.importCSV(admin,{csv,source:'Admin old arrival'})).conflicts,1);
 assert.equal((await f.ws.importCSV(owner,{csv,source:'Owner old arrival'})).conflicts,1);
 assert.equal((await f.ws.importCSV(other,{csv,source:'Unrelated arrival'})).added,1);
 const adminReviews=await f.lab.historicalIdentityReviews(admin);
 assert.equal(adminReviews.total,1);assert.equal(JSON.stringify(adminReviews).includes('token_owner'),false);assert.equal(JSON.stringify(adminReviews).includes('new@example.com'),false);
 await assert.rejects(f.lab.resolveHistoricalIdentity(other,adminReviews.reviews[0].id,approve),{status:404});
 const ownReview=(await f.lab.historicalIdentityReviews(owner)).reviews[0];
 await assert.rejects(f.lab.resolveHistoricalIdentity(admin,ownReview.id,approve),{status:404},'admin cannot decide another owner private hold');
 await f.lab.resolveHistoricalIdentity(admin,adminReviews.reviews[0].id,approve);assert.equal((await f.ws.search(admin)).total,1);
}));

test('native concurrent repeated arrivals create one hold and replay the same report',{skip:!process.env.POSTGRES_TEST_URL,timeout:20000},()=>fixture(async f=>{
 await changedThenDeleted(f);
 const pg=(await import('pg')).default,schema=(await f.db.query('SELECT current_schema() AS name')).rows[0].name;
 const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,options:`-c search_path=${schema} -c statement_timeout=10000`,max:3,connectionTimeoutMillis:5000});
 try{const ws=createProspectWorkspace({pool});const results=await Promise.all([ws.importCSV(owner,{csv,source:'Concurrent arrival'}),ws.importCSV(owner,{csv,source:'Concurrent arrival'})]);
  assert.equal(results[0].id,results[1].id);assert.equal(results.filter(r=>r.replayed).length,1);
  assert.equal((await f.lab.historicalIdentityReviews(owner)).total,1);assert.equal((await f.ws.search(owner)).total,0);
 }finally{await pool.end();}
}));

test('native deletion while enrichment waits prevents late results or historical holds resurrecting the target',{skip:!process.env.POSTGRES_TEST_URL,timeout:20000},()=>fixture(async f=>{
 await changedThenDeleted(f);await f.ws.importCSV(owner,{csv:'First Name,Last Name,Company,LinkedIn URL\nJamie,Rivera,Unrelated Employer,https://linkedin.com/in/late-synthetic'});
 const id=(await f.ws.search(owner)).contacts[0].id,pg=(await import('pg')).default,schema=(await f.db.query('SELECT current_schema() AS name')).rows[0].name;
 const pool=new pg.Pool({connectionString:process.env.POSTGRES_TEST_URL,options:`-c search_path=${schema} -c statement_timeout=10000`,max:3,connectionTimeoutMillis:5000});
 let ticking,timer,release;const response=new Promise(resolve=>{release=resolve});let started;const providerStarted=new Promise(resolve=>{started=resolve});
 try{const {createProspectJobs}=await import('../prospect-jobs.mjs');const jobs=createProspectJobs({pool,providers:{readiness:{enrichment:true},enrich:async()=>{started();return response;}},config:{dailyBudgetMicros:100000,prices:{enrich:1000}},pacingMs:{pdl:0}});
  const job=await jobs.enqueue(owner,{action:'enrich',ids:[id],max_cost_micros:1000,idempotency_key:'native-late-enrichment'});
  ticking=jobs.tick();ticking.catch(()=>{});await Promise.race([providerStarted,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic provider did not start')),5000)})]);clearTimeout(timer);
  const ws=createProspectWorkspace({pool});await ws.route(new Request('https://example.com/api/prospect/contacts/'+id,{method:'DELETE'}),owner);
  release({contact:{first_name:'Jamie',last_name:'Rivera',company:'Unrelated Employer',email:'old@example.com'},checked_at:new Date().toISOString()});await ticking;
  assert.equal((await f.ws.search(owner)).total,0);assert.equal((await f.lab.historicalIdentityReviews(owner)).total,0);
  assert.equal((await jobs.jobs(owner,job.id)).tasks[0].status,'skipped');
 }finally{clearTimeout(timer);release({not_found:true});if(ticking)await ticking.catch(()=>{});await pool.end();}
}));

test('authorized cross-owner merge preserves original historical namespace without granting unrelated access',()=>fixture(async f=>{
 await f.lab.importCSV(owner,{csv});const arrival=(await f.lab.list(owner)).leads[0].lead.id;
 await f.db.query("UPDATE discovery_leads SET payload=(payload::jsonb || '{\"email\":\"changed@example.com\",\"company\":\"Changed Employer\"}'::jsonb)::text WHERE id=$1",[arrival]);
 await f.lab.importCSV(other,{csv:csv.replace('Old Employer','Current Employer').replace('old@example.com','current@example.com')});const target=(await f.lab.list(other)).leads[0].lead.id;
 const admin={uid:'admin',email:'admin@example.com'};
 await f.db.query("INSERT INTO discovery_users(user_id,email,full_name,role) VALUES('admin','admin@example.com','Synthetic admin','advisor')");
 await f.db.query("INSERT INTO lab_identity_reviews(id,user_id,kind,fingerprint,candidate,key_hashes,lead_id,match_ids,reason) VALUES('merge-review','admin','probable','synthetic-cross-owner','{}','{}',$1,$2::text[],'Synthetic reviewed merge')",[arrival,[target]]);
 await assert.rejects(f.lab.resolveIdentityReview(admin,'merge-review',{decision:'same',target_id:target}),{status:403});
 assert.ok((await f.db.query('SELECT key_hash FROM prospect_identity_evidence WHERE user_id=$1 AND record_id=$2',[owner.uid,arrival])).rows.length);
 await f.db.query("UPDATE discovery_users SET role='admin' WHERE user_id='admin'");
 await f.lab.resolveIdentityReview(admin,'merge-review',{decision:'same',target_id:target});
 assert.equal((await f.db.query('SELECT id FROM discovery_leads WHERE id=$1',[arrival])).rows.length,0);
 const evidence=(await f.db.query('SELECT DISTINCT user_id,token_owner_id FROM prospect_identity_evidence WHERE record_id=$1',[target])).rows;
 assert.ok(evidence.some(r=>r.user_id===other.uid&&r.token_owner_id===owner.uid));
 await f.lab.route(new Request('https://example.com/api/lab/leads/'+target,{method:'DELETE'}),other);
 assert.equal((await f.ws.importCSV(other,{csv,source:'Former merged identity'})).conflicts,1);
 assert.equal((await f.ws.importCSV({uid:'unrelated'},{csv})).added,1);
}));
