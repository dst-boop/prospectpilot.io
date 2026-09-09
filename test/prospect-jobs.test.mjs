import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {createProspectJobs} from '../prospect-jobs.mjs';import {createProspectWorkspace} from '../prospect-workspace.mjs';
const user={uid:'owner'},other={uid:'stranger'};
test('invalid provider observation times cannot become verification evidence',()=>fixture(async({app,jobs,providers})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});const c=(await app.search(user)).contacts[0];
 providers.readiness.domain_check=true;
 for(const [index,checked_at] of [undefined,'not-a-date','2999-01-01T00:00:00.000Z'].entries()){
  providers.verifyEmail=async()=>({email:c.email,status:'valid',provider:'hunter',checked_at});
  providers.checkDomain=async()=>({email:c.email,domain:'example.com',status:'mx_present',checked_at});
  for(const action of ['verify','check_domain']){
   const job=await jobs.enqueue(user,{action,ids:[c.id],max_cost_micros:1000,idempotency_key:`bad-time-${action}-${index}`});await jobs.tick();
   assert.equal((await jobs.jobs(user,job.id)).tasks[0].status,'needs_attention');
  }
 }
 const after=(await app.search(user)).contacts[0];assert.equal(after.email_status,'unverified');assert.equal(after.email_verification,undefined);assert.equal(after.email_domain_check,undefined);
}));
test('paid searches reject unsupported or malformed filters before creating jobs or reservations',()=>fixture(async({jobs,calls})=>{
 for(const filters of [{source:'ZoomInfo'},{quality_issue:'shared_mailbox'},{suppressed:'false'},{email_status:'valid'},{q:'Jamie'},{list_id:'a-list'},{job_titel:'Director'},{first_name:'Jamie'}]){
  await assert.rejects(jobs.enqueue(user,{action:'search',filters:{company:'Example',...filters},size:1,max_cost_micros:1000,idempotency_key:'unsupported-filter'}),{status:422});
 }
 for(const filters of [null,[],true,'company=Example'])await assert.rejects(jobs.enqueue(user,{action:'search',filters,size:1,max_cost_micros:1000,idempotency_key:'malformed-filter'}),{status:422});
 assert.equal((await jobs.jobs(user)).jobs.length,0);assert.equal((await jobs.summary(user)).reserved_today_micros,0);assert.equal(calls(),0);
}));
const record={first_name:'Jamie',last_name:'Rivera',company:'Example',title:'Director',email:'jamie@example.com',linkedin_url:'https://www.linkedin.com/in/jamie-rivera',phone:'+12125551234',provider_id:'p1'};
test('legacy malformed emails cannot reserve funds or trigger email-based provider jobs',()=>fixture(async({db,app,jobs,calls})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});
 const contact=(await app.search(user)).contacts[0];
 await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{email}',$1::jsonb) WHERE id=$2",[JSON.stringify('a'.repeat(65)+'@example.com'),contact.id]);
 for(const action of ['verify','enrich']){
  const job=await jobs.enqueue(user,{action,ids:[contact.id],max_cost_micros:2000,idempotency_key:'legacy-invalid-'+action});await jobs.tick();
  const task=(await jobs.jobs(user,job.id)).tasks[0];assert.equal(task.status,'skipped');assert.match(task.result.message,/invalid email/i);
 }
 assert.equal(calls(),0);assert.equal((await jobs.summary(user)).reserved_today_micros,0);
}));
test('delayed verification preserves newer domain failure evidence without restoring a valid badge',()=>fixture(async({db,app,jobs,providers})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});
 const contact=(await app.search(user)).contacts[0],checked_at=new Date(Date.now()-60000).toISOString();
 providers.verifyEmail=async()=>{
  const domainCheck={domain:'example.com',status:'null_mx',checked_at:new Date().toISOString(),provider:'dns'};
  await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{email_domain_check}',$1::jsonb) WHERE id=$2",[JSON.stringify(domainCheck),contact.id]);
  return {email:contact.email,status:'valid',provider:'hunter',checked_at};
 };
 const job=await jobs.enqueue(user,{action:'verify',ids:[contact.id],max_cost_micros:1000,idempotency_key:'delayed-verification'});await jobs.tick();
 const after=(await app.search(user)).contacts[0];
 assert.equal(after.email_status,'unverified');assert.equal(after.email_verification.checked_at,checked_at);assert.equal(after.email_domain_check.status,'null_mx');
 assert.equal((await jobs.jobs(user,job.id)).tasks[0].status,'completed');
 assert.match((await jobs.jobs(user,job.id)).tasks[0].result.message,/newer domain check/);
 assert.match(await (await app.exportCSV(user,{ids:[contact.id]})).text(),/"jamie@example.com","unverified"/);
}));
test('imported contacts can be enriched, verified and exported without overwriting known fields',()=>fixture(async({app,jobs,calls})=>{
 const list=await app.createList(user,{name:'Enrichment journey'});
 await app.importCSV(user,{csv:'First Name,Last Name,Company,Title,Email\nJamie,Rivera,Example,Operations Lead,jamie@example.com',source:'Authorized fixture',list_id:list.id});
 const before=(await app.search(user,{list_id:list.id})).contacts[0];assert.equal(before.phone_status,'missing');
 const enrich=await jobs.enqueue(user,{action:'enrich',ids:[before.id],max_cost_micros:2000,idempotency_key:'enrich-journey'});
 await jobs.tick();assert.equal((await jobs.jobs(user,enrich.id)).tasks[0].status,'completed');
 const after=(await app.search(user,{list_id:list.id})).contacts[0];assert.equal(after.id,before.id);assert.equal(after.email,before.email);assert.equal(after.title,'Operations Lead');assert.equal(after.phone,record.phone);assert.equal(after.phone_status,'unverified');assert.equal(after.linkedin_url,record.linkedin_url);assert.equal(after.enrichment.provider,'pdl');assert.equal(after.email_status,'unverified');
 await jobs.enqueue(user,{action:'verify',ids:[before.id],max_cost_micros:1000,idempotency_key:'verify-journey'});await jobs.tick();
 const csv=await (await app.exportCSV(user,{ids:[before.id]})).text();assert.match(csv,/Operations Lead/);assert.match(csv,/"jamie@example.com","valid"/);assert.match(csv,/12125551234/);assert.equal(calls(),2);assert.equal((await jobs.summary(user)).reserved_today_micros,3000);
}));
async function fixture(fn,overrides={}){const db=new PGlite();try{for(const name of ['008-prospect-workspace','009-prospect-jobs','011-email-domain-check'])await db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};let calls=0;const providers={readiness:{search:true,enrichment:true,email_verification:true},search:async()=>{calls++;return {contacts:[record],retrieved:1,total:1,scroll_token:'page-2'};},enrich:async()=>{calls++;return {contact:record,checked_at:new Date().toISOString()};},verifyEmail:async c=>{calls++;return {email:c.email,status:'valid',provider_status:'valid',provider:'hunter',checked_at:new Date().toISOString()};},...overrides};const config={dailyBudgetMicros:100000,prices:{search:1000,enrich:2000,verify:1000}};const jobs=createProspectJobs({pool,providers,config,pacingMs:{pdl:0,hunter:0,dns:0}});const app=createProspectWorkspace({pool,jobs});await fn({db,app,jobs,providers,config,calls:()=>calls});}finally{await db.close();}}
test('provider search to list to verification to export works with recorded cost and isolation',()=>fixture(async({app,jobs,calls})=>{
 const list=await app.createList(user,{name:'Prospects'});const input={action:'search',filters:{company:'Example'},size:10,list_id:list.id,idempotency_key:'search-001',max_cost_micros:10000};const job=await jobs.enqueue(user,input);assert.equal((await jobs.enqueue(user,input)).id,job.id);assert.equal(await jobs.tick(),true);assert.equal(calls(),1);
 const c=(await app.search(user,{list_id:list.id})).contacts[0];assert.equal(c.source_kind,'provider');assert.equal(c.email_status,'unverified');assert.equal(c.source_history[0].source,'People Data Labs');assert.equal(c.source_observed_at,null);assert.equal(c.field_sources.email.kind,'provider');
 const verify=await jobs.enqueue(user,{action:'verify',ids:[c.id],max_cost_micros:1000,idempotency_key:'verify-001'});await jobs.tick();assert.equal((await app.search(user)).contacts[0].email_status,'valid');assert.equal((await jobs.jobs(user,verify.id)).tasks[0].status,'completed');assert.equal((await jobs.summary(user)).reserved_today_micros,11000);
 assert.match(await (await app.exportCSV(user,{ids:[c.id]})).text(),/valid/);await assert.rejects(jobs.jobs(other,job.id),{status:404});await assert.rejects(jobs.enqueue(other,{action:'verify',ids:[c.id],max_cost_micros:1000,idempotency_key:'verify-002'}),{status:404});assert.equal((await jobs.jobs(other)).jobs.length,0);
}));
test('provider rejection counts and enrichment field sources remain visible',()=>fixture(async({app,jobs,providers})=>{
 providers.search=async()=>({contacts:[record],retrieved:3,rejected:2,total:3});
 const search=await jobs.enqueue(user,{action:'search',filters:{company:'Example'},size:3,idempotency_key:'quality-search',max_cost_micros:3000});await jobs.tick();
 const result=(await jobs.jobs(user,search.id)).tasks[0].result;assert.equal(result.rejected,2);assert.equal(result.added,1);
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nTaylor,Sample,taylor@example.com'});const c=(await app.search(user,{q:'Taylor'})).contacts[0];
 providers.enrich=async()=>({contact:{first_name:'Taylor',last_name:'Sample',email:c.email,company:'Sample Business'},checked_at:new Date().toISOString(),match_likelihood:9});
 await jobs.enqueue(user,{action:'enrich',ids:[c.id],idempotency_key:'quality-enrich',max_cost_micros:2000});await jobs.tick();
 const enriched=(await app.search(user,{q:'Taylor'})).contacts[0];assert.equal(enriched.field_sources.company.kind,'provider');assert.equal(enriched.field_sources.email.kind,'import');assert.equal(enriched.source_observed_at,null);assert.equal(enriched.enrichment.match_likelihood,9);
}));

test('provider search does not attach a weak namesake match to a list or source history',()=>fixture(async({app,jobs,providers})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Company\nJamie,Rivera,Example'});
 const original=(await app.search(user)).contacts[0],list=await app.createList(user,{name:'Provider candidates'});
 const request={action:'search',filters:{company:'Example'},size:1,list_id:list.id,max_cost_micros:1000};
 const weak=await jobs.enqueue(user,{...request,idempotency_key:'weak-namesake'});await jobs.tick();
 const rejected=(await jobs.jobs(user,weak.id)).tasks[0].result;
 assert.equal(rejected.conflicts,1);assert.equal(rejected.duplicates,0);assert.deepEqual(rejected.contact_ids,[]);
 assert.equal((await app.search(user,{list_id:list.id})).total,0);
 assert.deepEqual((await app.search(user)).contacts[0].source_history,original.source_history);
 // An exact repeat of the same identifier-free record is still a duplicate.
 providers.search=async()=>({contacts:[{first_name:'Jamie',last_name:'Rivera',company:'Example'}],retrieved:1,total:1});
 const repeat=await jobs.enqueue(user,{...request,idempotency_key:'exact-weak-repeat'});await jobs.tick();
 assert.equal((await jobs.jobs(user,repeat.id)).tasks[0].result.duplicates,1);
 assert.equal((await app.search(user,{list_id:list.id})).contacts[0].id,original.id);
}));
test('daily caps and explicit ceilings prevent requests, active tasks deduplicate, changed requests conflict',()=>fixture(async({app,jobs,config,calls})=>{
 await assert.rejects(jobs.enqueue(user,{action:'search',filters:{company:'Example'},size:10,max_cost_micros:9999,idempotency_key:'too-small-1'}),{status:422});
 config.dailyBudgetMicros=500;const denied=await jobs.enqueue(user,{action:'search',filters:{company:'Example'},size:1,max_cost_micros:1000,idempotency_key:'budget-001'});await jobs.tick();assert.equal(calls(),0);assert.equal((await jobs.jobs(user,denied.id)).tasks[0].status,'skipped');
 config.dailyBudgetMicros=100000;const input={action:'search',filters:{company:'Example'},size:1,max_cost_micros:1000,idempotency_key:'budget-002'};await jobs.enqueue(user,input);await jobs.tick();await assert.rejects(jobs.enqueue(user,{...input,size:2}),{status:409});const c=(await app.search(user)).contacts[0];const batch={action:'verify',ids:[c.id],max_cost_micros:1000,idempotency_key:'verify-001'};await jobs.enqueue(user,batch);const dup=await jobs.enqueue(user,{...batch,idempotency_key:'verify-002'});assert.equal((await jobs.jobs(user,dup.id)).tasks[0].status,'skipped');await jobs.tick();assert.equal(calls(),2);
}));
test('pending verification polls reuse one reservation; lost worker requests are not retried',()=>fixture(async({db,app,jobs,providers})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});const c=(await app.search(user)).contacts[0];let n=0;providers.verifyEmail=async()=>++n===1?{pending:true}:{email:c.email,status:'catch_all',provider:'hunter',checked_at:new Date().toISOString()};
 const job=await jobs.enqueue(user,{action:'verify',ids:[c.id],max_cost_micros:1000,idempotency_key:'pending-001'});await jobs.tick();assert.equal((await jobs.jobs(user,job.id)).tasks[0].status,'waiting');await db.exec("UPDATE prospect_tasks SET next_attempt_at=now()-interval '1 second'");await jobs.tick();assert.equal((await app.search(user)).contacts[0].email_status,'catch_all');assert.equal((await jobs.summary(user)).reserved_today_micros,1000);
 const interrupted=await jobs.enqueue(user,{action:'verify',ids:[c.id],max_cost_micros:1000,idempotency_key:'lost-worker-1'});await db.query("UPDATE prospect_tasks SET status='running',lease_until=now()-interval '1 second' WHERE job_id=$1",[interrupted.id]);await jobs.tick();assert.equal(n,2);assert.equal((await jobs.jobs(user,interrupted.id)).tasks[0].status,'needs_attention');
}));
test('suppression and identity changes during a request prevent stale result application',()=>fixture(async({db,app,jobs,providers})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});const c=(await app.search(user)).contacts[0];providers.verifyEmail=async()=>{await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}','true') WHERE id=$1",[c.id]);return {email:c.email,status:'valid',provider:'hunter',checked_at:new Date().toISOString()};};
 const job=await jobs.enqueue(user,{action:'verify',ids:[c.id],max_cost_micros:1000,idempotency_key:'change-001'});await jobs.tick();assert.equal((await jobs.jobs(user,job.id)).tasks[0].status,'skipped');assert.equal((await app.search(user)).contacts[0].email_status,'unverified');
}));
test('provider failures retain reserved costs without automatic retry or error-secret exposure',()=>fixture(async({jobs,providers})=>{
 providers.search=async()=>{throw Error('secret credential');};const job=await jobs.enqueue(user,{action:'search',filters:{company:'Example'},size:1,max_cost_micros:1000,idempotency_key:'failure-001'});await jobs.tick();assert.equal(await jobs.tick(),false);const result=await jobs.jobs(user,job.id);assert.equal(result.tasks[0].status,'needs_attention');assert.ok(!JSON.stringify(result).includes('secret credential'));assert.equal((await jobs.summary(user)).reserved_today_micros,1000);
}));
test('repeat valid verification skips provider cost but expired checks can run again',()=>fixture(async({db,app,jobs,calls})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});const contact=(await app.search(user)).contacts[0];
 for(const key of ['first-valid','repeat-valid']){const job=await jobs.enqueue(user,{action:'verify',ids:[contact.id],max_cost_micros:1000,idempotency_key:key});await jobs.tick();if(key==='repeat-valid')assert.equal((await jobs.jobs(user,job.id)).tasks[0].status,'skipped');}
 assert.equal(calls(),1);assert.equal((await jobs.summary(user)).reserved_today_micros,1000);
 await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{email_verification,checked_at}',$1::jsonb) WHERE id=$2",[JSON.stringify(new Date(Date.now()-31*86400000).toISOString()),contact.id]);
 await jobs.enqueue(user,{action:'verify',ids:[contact.id],max_cost_micros:1000,idempotency_key:'expired-valid'});await jobs.tick();assert.equal(calls(),2);
}));
test('domain checks work with zero provider budget and cannot manufacture a valid mailbox',()=>fixture(async({app,jobs,providers,config,calls})=>{
 config.dailyBudgetMicros=0;providers.readiness.domain_check=true;
 providers.checkDomain=async c=>({email:c.email,domain:c.email.split('@')[1],status:'null_mx',checked_at:new Date().toISOString()});
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});const contact=(await app.search(user)).contacts[0];
 const job=await jobs.enqueue(user,{action:'check_domain',ids:[contact.id],max_cost_micros:0,idempotency_key:'domain-check-1'});await jobs.tick();
 assert.equal((await jobs.jobs(user,job.id)).tasks[0].status,'completed');assert.equal((await jobs.summary(user)).reserved_today_micros,0);
 const after=(await app.search(user)).contacts[0];assert.equal(after.email_status,'unverified');assert.equal(after.email_domain_check.status,'null_mx');
 const quality=await app.qualitySummary(user);assert.equal(quality.summary.domain_checks,1);assert.equal(quality.summary.domain_issues,1);assert.equal(quality.coverage[0].domain_issues,1);
 config.dailyBudgetMicros=100000;const verify=await jobs.enqueue(user,{action:'verify',ids:[contact.id],max_cost_micros:1000,idempotency_key:'domain-check-2'});await jobs.tick();
 assert.equal((await jobs.jobs(user,verify.id)).tasks[0].status,'skipped');assert.equal(calls(),0);
}));

test('non-public email domains skip paid verification and email-only enrichment before reserving cost',()=>fixture(async({app,jobs,calls})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Company,Email\nSynthetic,Fixture,Test Co,synthetic@example.invalid'});
 const contact=(await app.search(user)).contacts[0];
 for(const action of ['verify','enrich']){
  const job=await jobs.enqueue(user,{action,ids:[contact.id],max_cost_micros:2000,idempotency_key:'non-public-'+action});
  await jobs.tick();const result=(await jobs.jobs(user,job.id)).tasks[0];assert.equal(result.status,'skipped');assert.match(result.result.message,/non-public/i);
 }
 assert.equal(calls(),0);assert.equal((await jobs.summary(user)).reserved_today_micros,0);
 assert.equal((await app.search(user)).contacts[0].email_status,'unverified');
}));
test('a new definitive domain failure invalidates an older valid badge but retains history',()=>fixture(async({app,db,jobs,providers})=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Email\nJamie,Rivera,jamie@example.com'});const contact=(await app.search(user)).contacts[0];
 const checked_at=new Date(Date.now()-86400000).toISOString(),verification={email:contact.email,checked_at,provider:'hunter'};
 await db.query("UPDATE prospect_contacts SET payload=payload||$1::jsonb WHERE id=$2",[JSON.stringify({email_status:'valid',email_verification:verification}),contact.id]);
 providers.readiness.domain_check=true;providers.checkDomain=async c=>({email:c.email,domain:'example.com',status:'null_mx',checked_at:new Date().toISOString()});
 await jobs.enqueue(user,{action:'check_domain',ids:[contact.id],max_cost_micros:0,idempotency_key:'domain-newer-result'});await jobs.tick();
 const after=(await app.search(user)).contacts[0];assert.equal(after.email_status,'unverified');assert.deepEqual(after.email_verification,verification);
}));
