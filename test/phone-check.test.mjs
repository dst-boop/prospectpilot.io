import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createProspectJobs} from '../prospect-jobs.mjs';
import {createProspectProviders,phoneCheckRecord} from '../prospect-providers.mjs';

// The WhitePages/Trestle phone check, ported from Lead Qualifier: one paid
// lookup per number, recorded (misses included) so it is never bought twice
// without the operator asking, and reduced to what it is for — is the line
// real, what kind, and is it this person's. No stubbed call reaches a network.
const user={uid:'u1',email:'u1@example.com'},other={uid:'u2',email:'u2@example.com'};
const csv='First Name,Last Name,Company,Email,Phone\nJamie,Rivera,Example Manufacturing,jamie@example.com,(212) 555-0199';
const trestle=(o={})=>({id:'Phone.1',phone_number:'2125550199',is_valid:true,line_type:'Mobile',carrier:'Verizon',is_prepaid:false,
  belongs_to:[{name:'Jamie Q Rivera',firstname:'Jamie',lastname:'Rivera',age_range:'60-64',type:'Person'}],
  current_addresses:[{street_line_1:'1 Main St',city:'Rye',state_code:'NY'}],...o});

async function fixture(fn,{answer=trestle(),price=1500}={}){
  const db=new PGlite();try{
    for(const name of ['008-prospect-workspace','009-prospect-jobs','011-email-domain-check','017-forget','018-phone-check'])await db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const sent=[];let reply=answer;
    const fetcher=async(url,options)=>{sent.push({url:String(url),headers:options.headers});return typeof reply==='function'?reply():Response.json(reply);};
    const providers=createProspectProviders({trestleKey:'trestle-secret',fetcher});
    const jobs=createProspectJobs({pool,providers,config:{dailyBudgetMicros:100000,prices:{check_phone:price}},pacingMs:{trestle:0}});
    const app=createProspectWorkspace({pool,jobs});
    await app.importCSV(user,{csv});const id=(await app.search(user)).contacts[0].id;
    const contact=async()=>(await db.query('SELECT payload FROM prospect_contacts WHERE id=$1',[id])).rows[0].payload;
    let n=0;const run=async(input={})=>{const job=await jobs.enqueue(user,{action:'check_phone',ids:[id],max_cost_micros:price,idempotency_key:'phone-check-'+(++n),...input});while(await jobs.tick());return (await jobs.jobs(user,job.id)).tasks[0];};
    await fn({db,app,jobs,id,contact,run,sent,setReply:r=>{reply=r;}});
  }finally{await db.close();}
}

test('a phone check records the line and the owner verdict, and keeps nothing about the person beyond that',()=>fixture(async({contact,run,sent,jobs})=>{
  const task=await run();
  assert.equal(task.status,'completed');assert.match(task.result.message,/listed under this contact/);
  assert.equal(sent.length,1);
  assert.equal(new URL(sent[0].url).pathname,'/3.1/phone');assert.equal(new URL(sent[0].url).searchParams.get('phone'),'2125550199');
  assert.equal(sent[0].headers['x-api-key'],'trestle-secret');assert.ok(!sent[0].url.includes('secret'),'the key never rides in the URL');
  const c=await contact();
  assert.equal(c.phone_status,'owner_matched');
  assert.deepEqual({...c.phone_check,checked_at:undefined,for:undefined},{phone:'+12125550199',found:true,valid:true,line_type:'Mobile',carrier:'Verizon',prepaid:false,name_match:true,first_name_match:true,provider:'trestle',checked_at:undefined,for:undefined});
  const stored=JSON.stringify(c);
  assert.ok(!/60-64|Main St|Rye|Jamie Q/.test(stored),'age range, address and the returned name are not stored');
  assert.equal((await jobs.summary(user)).reserved_today_micros,1500,'the lookup is charged to the budget');
}));

test('a recorded check is not bought again; a re-check is explicit and priced',()=>fixture(async({run,sent,jobs})=>{
  await run();
  const again=await run();
  assert.equal(again.status,'skipped');assert.match(again.result.message,/not bought again/);
  assert.equal(sent.length,1);assert.equal((await jobs.summary(user)).reserved_today_micros,1500,'the skip costs nothing');
  const recheck=await run({recheck:true});
  assert.equal(recheck.status,'completed');assert.equal(sent.length,2);assert.equal((await jobs.summary(user)).reserved_today_micros,3000);
  await assert.rejects(jobs.enqueue(user,{action:'verify',ids:['x'],recheck:true,max_cost_micros:0,idempotency_key:'bad-recheck'}),{status:422},'re-check is only a phone-check option');
}));

test('a miss is recorded as an answer too',()=>fixture(async({contact,run,sent,setReply})=>{
  setReply(()=>new Response(null,{status:404}));
  const task=await run();
  assert.equal(task.status,'completed');assert.match(task.result.message,/miss is recorded/);
  const c=await contact();assert.equal(c.phone_check.found,false);assert.equal(c.phone_status,'unverified');
  assert.equal((await run()).status,'skipped');assert.equal(sent.length,1);
}));

test('a number listed under someone else is marked wrong person, and their name is not kept',()=>fixture(async({app,id,contact,run})=>{
  await run();
  const c=await contact();assert.equal(c.phone_status,'wrong_person');assert.equal(c.phone_check.name_match,false);
  assert.ok(!JSON.stringify(c).includes('Morgan'));
  const out=await (await app.exportCSV(user,{ids:[id]})).text();
  assert.ok(!/555-?0199|5550199/.test(out),'a wrong-person number is not exported for dialling');assert.match(out,/wrong_person/);
},{answer:trestle({belongs_to:[{name:'Morgan Lee',firstname:'Morgan',lastname:'Lee'}]})}));

test('a dead line is invalid; editing the phone retires the old answer',()=>fixture(async({app,id,contact,run,sent})=>{
  await run();
  assert.equal((await contact()).phone_status,'invalid');
  const detail=(await app.route(new Request('https://prospectpilot.io/api/prospect/contacts/'+id),user)).contact;
  await app.route(new Request('https://prospectpilot.io/api/prospect/contacts/'+id,{method:'PATCH',body:JSON.stringify({fields:{...Object.fromEntries(['first_name','last_name','company','email'].map(k=>[k,detail[k]])),phone:'+12125550100'},reason:'Advisor confirmed a new number.',revision:detail.edit_revision})}),user);
  const c=await contact();assert.equal(c.phone_check,undefined);assert.equal(c.phone_status,'unverified');
  await run();assert.equal(sent.length,2,'the new number gets its own check');
},{answer:trestle({is_valid:false,phone_number:''})}));

test('a number that cannot be a US line is refused before any request; a suppressed contact is skipped',()=>fixture(async({db,id,run,sent,jobs})=>{
  await db.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{phone}','\"+15550100\"') WHERE id=$1",[id]);
  const refused=await run();assert.equal(refused.status,'skipped');assert.match(refused.result.message,/No cost was reserved/);assert.equal(sent.length,0,'nothing was sent for an impossible number');
  assert.equal((await jobs.summary(user)).reserved_today_micros,0,'and nothing was charged to the budget');
  await db.query("UPDATE prospect_contacts SET payload=jsonb_set(jsonb_set(payload,'{phone}','\"+12125550199\"'),'{suppressed}','true') WHERE id=$1",[id]);
  assert.equal((await run()).status,'skipped');assert.equal(sent.length,0);
}));

test('another user cannot check my contact',()=>fixture(async({jobs,id})=>{
  await assert.rejects(jobs.enqueue(other,{action:'check_phone',ids:[id],max_cost_micros:1500,idempotency_key:'someone-else'}),{status:404});
}));

test('the parser reads both response shapes and matches maiden and married names',()=>{
  const contact={first_name:'Dana',last_name:'Whitfield'};
  const pro={results:[{name:'Dana Marsh',aliases:['Dana Whitfield'],phones:[{number:'2065550101',type:'Mobile',score:90,carrier:'T-Mobile'}]},
    {name:'Old Holder',phones:[{number:'2065550101',type:'Mobile',score:10}]}]};
  assert.deepEqual(phoneCheckRecord(pro,'2065550101',contact),{valid:true,line_type:'Mobile',carrier:'T-Mobile',prepaid:null,name_match:true,first_name_match:true});
  assert.deepEqual(phoneCheckRecord({results:[{name:'X',phones:[{number:'2065550999'}]}]},'2065550101',contact),{not_found:true},'a record not listing the number is not an answer');
  assert.equal(phoneCheckRecord({is_valid:true,line_type:'Landline',belongs_to:[]},'2065550101',contact).name_match,null,'no owner returned is unknown, not a mismatch');
  assert.equal(phoneCheckRecord({is_valid:true,belongs_to:{name:'Pat Whitfield'}},'2065550101',contact).first_name_match,false,'same surname, different first name: likely household, not them');
  assert.throws(()=>phoneCheckRecord({phone_number:'2065550000',is_valid:true},'2065550101',contact),{status:502});
});

test('without a key the phone check is not offered',()=>{
  const p=createProspectProviders({});assert.equal(p.readiness.phone_check,false);
  return assert.rejects(p.checkPhone({phone:'+12125550199',first_name:'A',last_name:'B'}),{status:503});
});
