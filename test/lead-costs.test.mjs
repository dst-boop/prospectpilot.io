import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProspectJobs} from '../prospect-jobs.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {leadCosts,leadCostWindow,leadCostCSV,LEAD_COST_COLUMNS,creditUsageKey,readZoomInfoCreditCost} from '../lead-costs.mjs';
import {reportArgs,report} from '../scripts/lead-costs/report.mjs';
import {leadCostContent} from '../prospect-jobs-client.js';

// Cost per lead per advisor over time. Leads and spend are ledgers the
// database writes itself, so a deletion or a re-import cannot rewrite history.
const MIGRATIONS=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
const advisor={uid:'advisor-a',email:'a@example.com'},colleague={uid:'advisor-b',email:'b@example.com'};
const now=new Date('2026-10-15T16:00:00Z');
const daily=(rows,day='2026-10-02')=>'"First Name","Last Name","Company Name","Email Address","ZoomInfo Contact ID","Why Now","Delivery Date","Enrichment Credits"\n'+
 rows.map(([first,last,id,credits])=>`"${first}","${last}","Example Co","${first.toLowerCase()}@example.com","${id}","Left company","${day}","${credits}"`).join('\n');

async function fixture(fn,{files=MIGRATIONS,providers:extra={}}={}){
 const db=new PGlite();
 try{
  for(const file of files)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const providers={readiness:{search:true,enrichment:true},
   search:async filters=>({contacts:[1,2].map(n=>({first_name:'Found'+n,last_name:'Person',company:'Example Co',title:'Director',email:`found${n}@example.com`,provider_id:'p'+n})),retrieved:2,total:2}),
   enrich:async contact=>({contact:{...contact,title:'Vice President'},checked_at:new Date().toISOString()}),...extra};
  const jobs=createProspectJobs({pool,providers,config:{dailyBudgetMicros:100000000,prices:{search:2000,enrich:50000}},pacingMs:{pdl:0}});
  const ws=createProspectWorkspace({pool,jobs});
  const call=(user,path)=>ws.route(new Request('https://prospectpilot.io/api/prospect/'+path),user);
  await fn({db,pool,jobs,ws,call});
 }finally{await db.close();}
}
const one=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];

test('every new contact is a recorded lead, by source; duplicates are not new leads',()=>fixture(async({db,ws})=>{
 await ws.importCSV(advisor,{csv:'First Name,Last Name,Company,Email\nJamie,Rivera,Example Co,jamie@example.com\nRobin,Lee,Example Co,robin@example.com'});
 await ws.importCSV(advisor,{csv:'First Name,Last Name,Company,Email\nJamie,Rivera,Example Co,jamie@example.com',source:'Second file'});
 const list=await ws.createList(advisor,{name:'Daily leads'});
 await ws.importCSV(advisor,{csv:daily([['Avery','Sample','101',1]]),format:'zoominfo',list_id:list.id});
 await ws.importCSV(advisor,{csv:daily([['Casey','Neg','-3',0]]),format:'zoominfo'});
 const rows=(await db.query("SELECT source,count(*)::int AS n FROM lead_acquisitions WHERE user_id=$1 GROUP BY 1 ORDER BY 1",[advisor.uid])).rows;
 assert.deepEqual(rows,[{source:'csv_import',n:2},{source:'daily_leads',n:1},{source:'zoominfo_import',n:1}]);
 // A preview writes nothing.
 await ws.importCSV(advisor,{csv:'First Name,Last Name,Company,Email\nNew,Person,Example Co,new@example.com'},{preview:true});
 assert.equal((await one(db,'SELECT count(*)::int AS n FROM lead_acquisitions')).n,4);
}));

test('ZoomInfo credits from a delivery are recorded once per person and day, and valued only when a rate is set',()=>fixture(async({db,ws})=>{
 const a=await ws.createList(advisor,{name:'Delivery'}),b=await ws.createList(advisor,{name:'Copy'});
 const csv=daily([['Avery','Sample','101',1],['Blair','Test','102',1],['Casey','Neg','-3',0]]);
 const first=await ws.importCSV(advisor,{csv,format:'zoominfo',list_id:a.id});
 assert.equal(first.zoominfo_credits,2);
 await ws.importCSV(advisor,{csv,format:'zoominfo',list_id:b.id});
 const usage=(await db.query('SELECT units,usage_date::text AS day,lead_id IS NOT NULL AS linked FROM prospect_external_usage WHERE user_id=$1',[advisor.uid])).rows;
 assert.deepEqual(usage,[{units:1,day:'2026-10-02',linked:true},{units:1,day:'2026-10-02',linked:true}],'the second list did not count the delivery again');
 const unpriced=await leadCosts(db,{period:'month',from:'2026-10-01',to:'2026-10-31'},{userId:advisor.uid,creditMicros:null,now});
 const oct=unpriced.users[0].rows[0];
 assert.equal(oct.spend.zoominfo_credits,2);assert.equal(oct.spend.zoominfo_micros,null);assert.equal(oct.spend.total_micros,0);
 assert.match(unpriced.notes.join(' '),/counted but not priced/);
 const priced=(await leadCosts(db,{period:'month',from:'2026-10-01',to:'2026-10-31'},{userId:advisor.uid,creditMicros:400000,now})).users[0].rows[0];
 assert.equal(priced.spend.zoominfo_micros,800000);assert.equal(priced.spend.total_micros,800000);
 assert.equal(priced.leads.total,3);assert.equal(priced.cost_per_lead_micros,266667);assert.equal(priced.contacts_cost_per_lead_micros,266667);
 assert.equal(creditUsageKey('u','101','2026-10-02','i',2),(await one(db,"SELECT encode(sha256(convert_to('zoominfo-credit|u|101|2026-10-02','UTF8')),'hex') AS k")).k,'JS and SQL keys agree');
 assert.notEqual(creditUsageKey('u','','2026-10-02','i',2),creditUsageKey('u','','2026-10-02','i',3));
}));

test('a charge records what was bought, what a search returned, and the lead it was spent on',()=>fixture(async({db,jobs,ws})=>{
 const search=await jobs.enqueue(advisor,{action:'search',filters:{company:'Example Co'},size:5,max_cost_micros:10000,idempotency_key:'search-one'});
 while(await jobs.tick());
 const charge=await one(db,'SELECT c.action,units,unit_price_micros,reserved_micros,delivered_units,lead_id FROM prospect_charges c JOIN prospect_tasks t ON t.id=c.task_id WHERE t.job_id=$1',[search.id]);
 assert.deepEqual({...charge,reserved_micros:Number(charge.reserved_micros),unit_price_micros:Number(charge.unit_price_micros)},{action:'search',units:5,unit_price_micros:2000,reserved_micros:10000,delivered_units:2,lead_id:null});
 assert.equal((await one(db,"SELECT count(*)::int AS n FROM lead_acquisitions WHERE source='provider_search' AND job_id=$1",[search.id])).n,2);
 const id=(await ws.search(advisor)).contacts.find(c=>c.first_name==='Found1').id;
 await jobs.enqueue(advisor,{action:'enrich',ids:[id],max_cost_micros:50000,idempotency_key:'enrich-one'});while(await jobs.tick());
 const enrich=await one(db,"SELECT c.lead_id,a.contact_id FROM prospect_charges c JOIN lead_acquisitions a ON a.id=c.lead_id WHERE c.action='enrich'");
 assert.equal(enrich.contact_id,id);
 const oct=(await leadCosts(db,{period:'month',from:'2026-10-01',to:'2026-10-31'},{userId:advisor.uid,creditMicros:null})).users[0];
 const row=oct.rows.at(-1);
 assert.equal(row.spend.lookups_micros,60000);assert.equal(row.spend.lookups_provider_estimate_micros,54000,'two of five search records came back');
 assert.deepEqual(row.spend.by_action.search,{count:1,reserved_micros:10000,units:5,delivered_units:2});
 assert.equal(row.spend.lookups_on_known_leads,1);assert.equal(row.leads.by_source.provider_search,2);assert.equal(row.cost_per_lead_micros,30000);
}));

test('deleting a person keeps their lead and its spend in the history, without them',()=>fixture(async({db,jobs,ws,call})=>{
 await ws.importCSV(advisor,{csv:'First Name,Last Name,Company,Email,LinkedIn URL\nJamie,Rivera,Example Co,jamie@example.com,https://www.linkedin.com/in/jamie-rivera'});
 const id=(await ws.search(advisor)).contacts[0].id;
 await jobs.enqueue(advisor,{action:'enrich',ids:[id],max_cost_micros:50000,idempotency_key:'enrich-forget'});while(await jobs.tick());
 const before=await call(advisor,'lead-costs?period=day&tz=UTC');
 await ws.route(new Request('https://prospectpilot.io/api/prospect/contacts/'+encodeURIComponent(id),{method:'DELETE'}),advisor);
 assert.equal((await one(db,'SELECT count(*)::int AS n FROM prospect_contacts')).n,0);
 const lead=await one(db,'SELECT contact_id,source FROM lead_acquisitions');
 assert.deepEqual(lead,{contact_id:null,source:'csv_import'},'the link to the person is gone; the lead stays counted');
 assert.ok((await one(db,'SELECT lead_id FROM prospect_charges')).lead_id,'the spend still belongs to that lead');
 assert.deepEqual(await call(advisor,'lead-costs?period=day&tz=UTC'),before);
}));

test('cost per lead by period in the advisor\'s time zone, with trends only on enough leads, and only their own',()=>fixture(async({db,call})=>{
 const lead=(uid,at,n=1)=>db.query("INSERT INTO lead_acquisitions(user_id,channel,source,acquired_at) SELECT $1,'contacts','csv_import',$2::timestamptz FROM generate_series(1,$3)",[uid,at,n]);
 const spend=async(uid,at,micros,i)=>{
  await db.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES($1,$2,'verify',$1,'h',$3)",['j'+i,uid,micros]);
  await db.query("INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,payload,status) VALUES($1,$1,$2,'verify','hunter','{}','completed')",['j'+i,uid]);
  await db.query('INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros,reserved_at) VALUES($1,$2,$3,$4,$5)',['j'+i,uid,'hunter',micros,at]);
 };
 // 01:00 UTC on 1 September is still 31 August in New York.
 await lead(advisor.uid,'2026-09-01T01:00:00Z',3);await spend(advisor.uid,'2026-09-01T01:00:00Z',300000,1);
 await lead(advisor.uid,'2026-09-15T12:00:00Z',10);await spend(advisor.uid,'2026-09-20T12:00:00Z',1000000,2);
 await lead(advisor.uid,'2026-10-05T12:00:00Z',20);await spend(advisor.uid,'2026-10-06T12:00:00Z',1500000,3);
 await lead(colleague.uid,'2026-10-05T12:00:00Z',50);await spend(colleague.uid,'2026-10-05T12:00:00Z',9000000,4);
 const report=await call(advisor,'lead-costs?period=month&from=2026-08-01&to=2026-10-31&tz=America%2FNew_York');
 assert.deepEqual(report.users.map(u=>u.user_id),[advisor.uid],'only the signed-in advisor');
 const [aug,sep,oct]=report.users[0].rows;
 assert.deepEqual([aug.period_start,aug.leads.total,aug.spend.total_micros,aug.cost_per_lead_micros,aug.low_sample],['2026-08-01',3,300000,100000,true]);
 assert.deepEqual([sep.leads.total,sep.cost_per_lead_micros,sep.change_pct],[10,100000,null],'no trend against a period with too few leads');
 assert.deepEqual([oct.leads.total,oct.cost_per_lead_micros,oct.change_pct],[20,75000,-25]);
 assert.deepEqual([report.users[0].totals.leads.total,report.users[0].totals.spend.total_micros,report.users[0].totals.cost_per_lead_micros],[33,2800000,84848]);
 const utc=(await call(advisor,'lead-costs?period=month&from=2026-08-01&to=2026-10-31&tz=UTC')).users[0].rows;
 assert.deepEqual(utc.map(r=>r.leads.total),[0,13,20]);
 // A month with nothing still shows, so the trend has no gaps.
 const empty=await call(colleague,'lead-costs?period=week&from=2026-09-01&to=2026-09-30&tz=UTC');
 assert.equal(empty.users[0].rows.length,5);assert.ok(empty.users[0].rows.every(r=>r.leads.total===0&&r.cost_per_lead_micros===null));
 // Every advisor, for the operator.
 const all=await leadCosts(db,{period:'month',from:'2026-10-01',to:'2026-10-31',tz:'UTC'},{userId:null,creditMicros:null});
 assert.deepEqual(all.users.map(u=>[u.user_id,u.rows[0].cost_per_lead_micros]),[[advisor.uid,75000],[colleague.uid,180000]]);
 const csv=leadCostCSV(all).trim().split('\n');
 assert.equal(csv[0],LEAD_COST_COLUMNS.join(','));assert.equal(csv.length,3);
 assert.match(csv[2],/^advisor-b,2026-10-01,50,50,0,50,0,0,0,0,1,9\.0000,9\.0000,0\.0000,0,,9\.0000,0\.1800,0\.1800,,,false$/);
 assert.equal(await report_(db),leadCostCSV(all));
 for(const bad of ['period=year','tz=Mars%2FBase','from=2026-02-30','from=2026-10-01&to=2026-09-01','period=day&from=2020-01-01&to=2026-01-01'])
  await assert.rejects(call(advisor,'lead-costs?'+bad),{status:422},bad);
}));
const report_=db=>report(db,['--period','month','--from','2026-10-01','--to','2026-10-31','--tz','UTC']);

test('Research Lab discovery spend and the new people it found are their own channel',()=>fixture(async({db})=>{
 await db.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,created_at) VALUES('run','advisor-a','a@example.com','discovery','k','2026-10-03T12:00:00Z'),('imp','advisor-a','a@example.com','import','k2','2026-10-03T12:00:00Z')");
 for(const id of ['l1','l2','l3'])await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES($1,'wealth-management','advisor-a','a@example.com','{}')",[id]);
 await db.query("INSERT INTO lab_run_leads(run_id,lead_id,is_new,source) VALUES('run','l1',true,'s'),('run','l2',false,'s'),('imp','l3',true,'csv')");
 await db.query("UPDATE lab_run_leads SET is_new=true WHERE lead_id='l2'");
 await db.query("INSERT INTO lab_costs(id,run_id,user_id,category,amount_micros,basis) VALUES('c1','run','advisor-a','provider',600000,'configured_estimate')");
 const oct=(await leadCosts(db,{period:'month',from:'2026-10-01',to:'2026-10-31',tz:'UTC'},{userId:advisor.uid,creditMicros:null})).users[0].rows[0];
 assert.deepEqual([oct.leads.research_lab,oct.leads.contacts,oct.spend.research_lab_micros,oct.research_lab_cost_per_lead_micros],[2,0,600000,300000],'an import run finds no new leads');
 await db.query("DELETE FROM discovery_leads WHERE id='l1'");
 assert.equal((await leadCosts(db,{period:'month',from:'2026-10-01',to:'2026-10-31',tz:'UTC'},{userId:advisor.uid,creditMicros:null})).users[0].rows[0].leads.research_lab,2);
}));

test('the migrations describe what was already there',async()=>{
 const before=MIGRATIONS.filter(f=>!/02[789]-/.test(f)),after=MIGRATIONS.filter(f=>/02[789]-/.test(f));
 const db=new PGlite();
 try{
  for(const file of before)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  await db.query(`INSERT INTO prospect_contacts(id,user_id,payload,created_at) VALUES
   ('c1','advisor-a','{"source_kind":"provider","source_history":[{"job_id":"j1"}]}','2026-08-10T12:00:00Z'),
   ('c2','advisor-a','{"source_kind":"zoominfo_csv","zoominfo":{"contact_id":"101"},"deliveries":{"list":{"signal":{"delivered_on":"2026-08-11","credits":1}}}}','2026-08-11T12:00:00Z')`);
  await db.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('j1','advisor-a','search','k','h',6000),('j2','advisor-a','enrich','k2','h',5000)");
  await db.query(`INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,contact_id,payload,status,result) VALUES
   ('t1','j1','advisor-a','search','pdl',NULL,'{"filters":{"size":3},"quote":6000}','completed','{"retrieved":1}'),
   ('t2','j2','advisor-a','enrich','pdl','c2','{"quote":5000}','completed','{}')`);
  await db.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('t1','advisor-a','pdl',6000),('t2','advisor-a','pdl',5000)");
  for(const file of after)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  assert.deepEqual((await db.query("SELECT contact_id,source,acquired_at::text AS at FROM lead_acquisitions ORDER BY contact_id")).rows.map(r=>[r.contact_id,r.source]),[['c1','provider_search'],['c2','daily_leads']]);
  const charges=(await db.query('SELECT task_id,action,units,unit_price_micros::int AS unit,delivered_units,lead_id IS NOT NULL AS linked FROM prospect_charges ORDER BY task_id')).rows;
  assert.deepEqual(charges,[{task_id:'t1',action:'search',units:3,unit:2000,delivered_units:1,linked:false},{task_id:'t2',action:'enrich',units:1,unit:5000,delivered_units:null,linked:true}]);
  assert.deepEqual((await db.query('SELECT units,usage_date::text AS day,usage_key FROM prospect_external_usage')).rows,[{units:1,day:'2026-08-11',usage_key:creditUsageKey('advisor-a','101','2026-08-11')}]);
  // Running them again changes nothing.
  for(const file of after)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  assert.equal((await one(db,'SELECT count(*)::int AS n FROM lead_acquisitions')).n,2);
 }finally{await db.close();}
});

test('report windows, settings and the panel',()=>{
 assert.deepEqual(leadCostWindow({},now).periods,['2026-05-01','2026-06-01','2026-07-01','2026-08-01','2026-09-01','2026-10-01']);
 assert.equal(leadCostWindow({period:'week'},now).periods[0],'2026-07-27');assert.equal(leadCostWindow({period:'week'},now).periods.length,12);
 assert.equal(leadCostWindow({period:'day',tz:'Pacific/Kiritimati'},new Date('2026-10-15T23:00:00Z')).to,'2026-10-16');
 assert.equal(leadCostWindow({period:'month',from:'2026-09-17',to:'2026-10-02'}).from,'2026-09-01');
 assert.equal(readZoomInfoCreditCost({}),null);assert.equal(readZoomInfoCreditCost({PROSPECT_ZOOMINFO_CREDIT_MICROS:'350000'}),350000);
 assert.throws(()=>readZoomInfoCreditCost({PROSPECT_ZOOMINFO_CREDIT_MICROS:'-1'}),/Invalid/);
 assert.deepEqual(reportArgs(['--period','week','--tz','UTC']),{period:'week',tz:'UTC'});assert.throws(()=>reportArgs(['--user','x']),/Usage/);
 const row=(day,leads,total,cpl,change,low)=>({period_start:day,leads:{total:leads},spend:{total_micros:total,zoominfo_credits:0},cost_per_lead_micros:cpl,change_pct:change,low_sample:low});
 const html=leadCostContent({period:'month',notes:['<b>note</b>'],users:[{rows:[row('2026-09-01',4,400000,100000,null,true),row('2026-10-01',20,1500000,75000,-25,false)]}]});
 assert.match(html,/<td>Oct 2026<\/td><td>20<\/td><td>\$1\.50<\/td><td>\$0\.08<\/td><td>-25%<\/td>[\s\S]*<td>Sep 2026<\/td><td>4<\/td>/,'newest first');
 assert.match(html,/\(few leads\)/);assert.match(html,/&lt;b&gt;note/);assert.doesNotMatch(html,/ZoomInfo credits/);
 assert.equal(leadCostContent({users:[]}),'');
});
