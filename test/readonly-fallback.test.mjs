import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {validateStagingDatabaseUrl,createStagingDatabase} from './helpers/staging-database.mjs';
import {spawnSync} from 'node:child_process';
import {readOnlyFallback} from '../readonly-fallback.mjs';
import {createSyntheticStaging} from './helpers/staging-app.mjs';
import {createResearchLab} from '../research-lab.mjs';

test('degradation flag validates exact values and worker exits before database/provider activity',()=>{
 assert.equal(readOnlyFallback(''),false);assert.equal(readOnlyFallback('true'),true);assert.equal(readOnlyFallback('false'),false);
 for(const x of ['TRUE','1','yes',null])assert.throws(()=>readOnlyFallback(x));
 const run=spawnSync(process.execPath,['research-worker.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PROSPECTPILOT_READ_ONLY:'true',PGHOST:'invalid.example.test',PGPASSWORD:'synthetic-unused'},encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr);assert.equal(run.stderr,'');assert.match(run.stdout,/"executed":false/);
});

test('read-only HTTP fallback preserves advice decisions, isolation and data without dispatching mutations', {timeout:60000},async()=>{
 const s=await createSyntheticStaging({readOnly:true});let restore=()=>{};
 try{
  const {request,database,identities}=s;
  const lab=createResearchLab({pool:database.pool,sources:{readiness:{}}});
  await lab.importCSV(identities.advisor,{csv:'First Name,Last Name,Company,Email\nJordan,Fixture,Synthetic,jordan@example.test'});
  const id=(await lab.list(identities.advisor)).leads[0].lead.id;
  const d=await lab.detail(identities.advisor,id);
  for(const [field,value] of Object.entries({planning_decision:{origin:'inbound_request',topic:'retirement_income',identity_confirmed:true,prospect_confirmed:true},residence:{country:'US',scope:'residence',state:'NY'},contact:{channel:'email',address:'jordan@example.test',identity_confirmed:true,outreach_basis:'person_requested'}}))
   await lab.review(identities.advisor,id,{field,value,verdict:'confirmed',source:'Synthetic fixture',note:'Fictional disclosure',observed_at:new Date().toISOString(),identity_signature:d.quality.identity_signature});
  const before=(await database.pool.query('SELECT * FROM lab_qualification')).rows;
  const original=database.pool.query.bind(database.pool),originalConnect=database.pool.connect;const queries=[];
  database.pool.connect=async()=>{throw Error('Fallback must not open a mutation transaction');};
  database.pool.query=async(sql,...args)=>{queries.push(sql);assert.match(sql.trim(),/^SELECT\b/i,'read-only fallback attempted a database mutation');assert.doesNotMatch(sql,/FOR UPDATE|FOR SHARE/i);return original(sql,...args);};
  restore=()=>{database.pool.query=original;database.pool.connect=originalConnect;};
  const login=async name=>{const r=await request('/auth/session',{method:'POST',body:{idToken:'synthetic-id-'+name}});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const cookie=await login('advisor'),other=await login('other'),recycled=await login('recycled');
  assert.equal((await request('/api/fallback/worklist')).status,401);
  const home=await request('/lab',{cookie});assert.equal(home.status,200);assert.match(await home.text(),/read-only mode/);
  const work=await (await request('/api/fallback/worklist',{cookie})).json();assert.equal(work.total,1);assert.equal(work.items[0].quality.status,'verified');assert.equal(work.items[0].action.label,'Respond to the advice request');assert.equal(work.items[0].action.contact,null);
  const detail=await request('/api/fallback/brief/'+id,{cookie});assert.equal(detail.status,200);const brief=await detail.json();assert.equal(brief.action.label,'Respond to the advice request');assert.equal(brief.draft,null);assert.equal(brief.action.contact,null);
  assert.equal((await (await request('/api/fallback/worklist',{cookie:other})).json()).total,0);
  assert.equal((await request('/api/fallback/brief/'+id,{cookie:other})).status,404);
  assert.equal((await (await request('/api/fallback/worklist',{cookie:recycled})).json()).total,0);
  assert.equal((await request('/api/fallback/brief/'+id,{cookie:recycled})).status,404);
  for(const [path,method] of [['/api/lab/leads/'+id,'GET'],['/api/lab/leads/'+id+'/review','POST'],['/api/lab/leads/'+id+'/activity','POST'],['/api/prospect/contacts','GET'],['/api/prospect/networking','POST'],['/api/prospect/jobs','POST'],['/api/research/auto','POST'],['/api/prospect/billing','POST'],['/api/lab/export','POST'],['/api/stripe/webhook','POST'],['/team-hub','GET']]){
   assert.equal((await request(path,{cookie,method,body:method==='POST'?{}:undefined})).status,503,path);
  }
  assert.deepEqual((await database.pool.query('SELECT * FROM lab_qualification')).rows,before);
  assert.equal(s.providerCalls.length,0);assert.equal(s.network.attempts.length,0);assert.ok(queries.length>0);
  assert.equal((await request('/logout',{method:'POST',cookie})).status,303);
 }finally{restore();await s.close();}
});


test('native PostgreSQL connection fence rejects accidental writes', {skip:!process.env.POSTGRES_TEST_URL,timeout:15000},async()=>{
 const db=await createStagingDatabase({backend:'postgres'});
 const client=new pg.Client({...validateStagingDatabaseUrl(),options:'-c default_transaction_read_only=on -c search_path='+db.schema});
 try{
  await db.query('CREATE TABLE fence_fixture(value text)');
  await db.query("INSERT INTO fence_fixture VALUES('unchanged')");
  await client.connect();
  assert.equal((await client.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only,'on');
  assert.equal((await client.query('SELECT * FROM fence_fixture')).rows[0].value,'unchanged');
  await assert.rejects(client.query("UPDATE fence_fixture SET value='mutated'"),{code:'25006'});
  await assert.rejects(client.query("INSERT INTO fence_fixture VALUES('mutated')"),{code:'25006'});
  assert.deepEqual((await db.query('SELECT * FROM fence_fixture')).rows,[{value:'unchanged'}]);
 }finally{await client.end();await db.close();}
});
