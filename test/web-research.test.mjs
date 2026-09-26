import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createWebResearch} from '../web-research.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createProspectJobs} from '../prospect-jobs.mjs';

// Claude web research, ported from Lead Qualifier. The Claude client is a
// stub: no request leaves the test, and nothing is billed.
const contact={first_name:'Jamie',last_name:'Rivera',company:'Example Manufacturing',title:'Director',city:'Albany',state:'NY'};
const page='https://example-manufacturing.com/leadership';
const reply=(answer,{searched=[page],stop='end_turn'}={})=>({stop_reason:stop,model:'claude-opus-5',usage:{server_tool_use:{web_search_requests:1}},content:[
  {type:'server_tool_use',id:'s1',name:'web_search',input:{query:'x'}},
  {type:'web_search_tool_result',tool_use_id:'s1',content:searched.map(url=>({type:'web_search_result',url,title:'t'}))},
  {type:'text',text:JSON.stringify(answer)}]});
const stub=(...responses)=>{const calls=[];return {calls,beta:{messages:{create:async params=>{calls.push(structuredClone(params));return responses.shift();}}}};};
const good={found:true,summary:'Leadership page lists her.',findings:[
  {field:'title',value:'Director of Operations',quote:'Jamie Rivera, Director of Operations',url:page},
  {field:'education',value:'Cornell',quote:'a Cornell graduate',url:'https://invented.example/bio'},
  {field:'other',value:'donor',quote:'gave to a campaign',url:'https://www.fec.gov/data/receipts'},
  {field:'tenure',value:'',quote:'',url:page}]};

test('findings must cite a page the search returned; invented, blocked and unquoted ones are dropped',async()=>{
  const client=stub(reply(good,{searched:[page,'https://www.fec.gov/data/receipts']}));
  const out=await createWebResearch({client}).research(contact);
  assert.deepEqual(out.findings.map(f=>f.value),['Director of Operations']);
  assert.equal(out.dropped,3);assert.equal(out.found,true);assert.equal(out.provider,'anthropic');
  const req=client.calls[0];
  assert.equal(req.model,'claude-opus-5');
  assert.equal(req.tools[0].type,'web_search_20260209');
  assert.ok(req.tools[0].blocked_domains.includes('fec.gov')&&req.tools[0].blocked_domains.includes('linkedin.com'));
  assert.equal(req.fallbacks,'default');assert.ok(req.betas.includes('server-side-fallback-2026-07-01'));
  assert.match(req.system,/Never infer or state wealth/);
  assert.match(req.messages[0].content,/Name: Jamie Rivera\nEmployer: Example Manufacturing/);
});

test('a paused search is resumed with the paused turn, not a new message',async()=>{
  const paused={stop_reason:'pause_turn',content:[{type:'server_tool_use',id:'s1',name:'web_search',input:{}}]};
  const client=stub(paused,reply(good));
  await createWebResearch({client}).research(contact);
  assert.equal(client.calls.length,2);
  assert.equal(client.calls[1].messages.length,2);assert.equal(client.calls[1].messages[1].role,'assistant');
});

test('refusals, unreadable answers, missing identity and a missing key fail loudly',async()=>{
  await assert.rejects(createWebResearch({client:stub({stop_reason:'refusal',content:[]})}).research(contact),{status:502});
  await assert.rejects(createWebResearch({client:stub({stop_reason:'end_turn',content:[{type:'text',text:'not json'}]})}).research(contact),{status:502});
  await assert.rejects(createWebResearch({client:stub()}).research({...contact,company:''}),{status:422});
  await assert.rejects(createWebResearch({client:stub()}).research({...contact,suppressed:true}),{status:422});
  const off=createWebResearch({});assert.equal(off.ready,false);await assert.rejects(off.research(contact),{status:503});
});

async function fixture(fn,answers){
  const db=new PGlite();try{
    for(const name of ['008-prospect-workspace','009-prospect-jobs','011-email-domain-check','017-forget','018-phone-check','019-web-research'])await db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
    const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    const client=stub(...answers),web=createWebResearch({client});
    const providers={readiness:{web_research:true},webResearch:web.research};
    const jobs=createProspectJobs({pool,providers,config:{dailyBudgetMicros:100000,prices:{web_research:50000}},pacingMs:{anthropic:0}});
    const app=createProspectWorkspace({pool,jobs});const user={uid:'u',email:'u@example.com'};
    await app.importCSV(user,{csv:'First Name,Last Name,Company,Title,City,State,Email\nJamie,Rivera,Example Manufacturing,Director,Albany,NY,jamie@example.com'});
    const id=(await app.search(user)).contacts[0].id;
    const read=async()=>(await db.query('SELECT payload FROM prospect_contacts WHERE id=$1',[id])).rows[0].payload;
    let n=0;const run=async(extra={})=>{const job=await jobs.enqueue(user,{action:'web_research',ids:[id],max_cost_micros:50000,idempotency_key:'web-research-'+(++n),...extra});while(await jobs.tick());return (await jobs.jobs(user,job.id)).tasks[0];};
    await fn({app,jobs,user,id,read,run,client});
  }finally{await db.close();}
}

test('a web research job stores sourced findings unreviewed and changes nothing on the contact',()=>fixture(async({read,run,jobs,user})=>{
  const before=await read();const task=await run();
  assert.equal(task.status,'completed');assert.match(task.result.message,/1 sourced finding to review/);
  const after=await read();
  assert.equal(after.title,before.title,'the finding did not overwrite the title');
  assert.equal(after.web_research.reviewed,false);assert.equal(after.web_research.findings[0].url,page);
  assert.equal((await jobs.summary(user)).reserved_today_micros,50000);
},[reply(good)]));

test('a recorded search is not bought again; a miss counts as an answer; re-check is explicit',()=>fixture(async({read,run,client,jobs,user})=>{
  const first=await run();assert.match(first.result.message,/found nothing/);
  assert.equal((await read()).web_research.found,false);
  const again=await run();assert.equal(again.status,'skipped');assert.equal(client.calls.length,1);
  assert.equal((await jobs.summary(user)).reserved_today_micros,50000,'the skip reserved nothing');
  const recheck=await run({recheck:true});assert.equal(recheck.status,'completed');assert.equal(client.calls.length,2);
},[reply({found:false,summary:'Nothing matched.',findings:[]}),reply(good)]));

test('changing who the contact is retires the old research',()=>fixture(async({app,user,id,read,run})=>{
  await run();
  const d=(await app.route(new Request('https://prospectpilot.io/api/prospect/contacts/'+id),user)).contact;
  await app.route(new Request('https://prospectpilot.io/api/prospect/contacts/'+id,{method:'PATCH',body:JSON.stringify({fields:{...Object.fromEntries(['first_name','last_name','title','city','state','email'].map(k=>[k,d[k]])),company:'Other Works'},reason:'Changed employer.',revision:d.edit_revision})}),user);
  assert.equal((await read()).web_research,undefined);
},[reply(good)]));
