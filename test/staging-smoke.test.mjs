import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {Resolver} from 'node:dns/promises';
import {createSyntheticStaging} from './helpers/staging-app.mjs';

test('synthetic staging exercises signed-in HTTP networking and lead pipeline with zero external calls', {timeout:60000}, async t=>{
  const originalFetch=globalThis.fetch;
  const staging=await createSyntheticStaging();
  const {request,database,network}=staging;
  try {
    t.diagnostic(`Database backend: ${database.backend}; unique schema: ${database.schema||'in-memory instance'}`);
    const json=async(path,options={})=>{
      const response=await request(path,options),body=await response.json();
      assert.equal(response.status,200,JSON.stringify({path,body}));return body;
    };
    // A real production-handler sign-in boundary, with only its Firebase adapter replaced.
    assert.equal((await request('/api/prospect/contacts')).status,401);
    const redirect=await request('/networking');assert.equal(redirect.status,303);assert.equal(redirect.headers.get('location'),'/login?next=%2Fnetworking');
    assert.equal((await request('/auth/session',{method:'POST',body:{idToken:'invalid'}})).status,401);
    assert.equal((await request('/auth/session',{method:'POST',site:'https://foreign.example',body:{idToken:'synthetic-id-advisor'}})).status,403);
    const signIn=async name=>{
      const response=await request('/auth/session',{method:'POST',body:{idToken:'synthetic-id-'+name}});
      assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');
      assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/);return cookie.split(';')[0];
    };
    const cookie=await signIn('advisor'),other=await signIn('other');
    assert.equal((await json('/api/prospect/me',{cookie})).uid,'synthetic-advisor');
    for(const path of ['/','/lab','/prospect','/networking','/lab-client.js','/lab.css','/prospect-client.js','/prospect-jobs-client.js','/prospect.css','/networking-client.js','/networking.css']){
      const response=await request(path,{cookie});assert.equal(response.status,200,path);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok((await response.text()).length>100,path);
    }
    assert.equal((await request('/api/prospect/contacts',{headers:{'oai-authenticated-user-id':'synthetic-advisor'}})).status,401);
    assert.equal((await request('/api/prospect/networking',{method:'POST',cookie,site:'',body:{}})).status,403);
    assert.equal((await request('/api/prospect/networking',{method:'POST',cookie,headers:{'x-forwarded-host':'foreign.example'},body:{}})).status,403);
    assert.equal((await request('/api/prospect/billing',{cookie})).status,404);
    assert.equal((await request('/team-hub',{cookie})).status,503);

    const capture={request_key:'synthetic-networking-0001',kind:'in_person',person:{first_name:'Jordan',last_name:'Fixture',company:'Synthetic Manufacturing',email:'jordan@example.com'},context:'Fictional networking event',occurred_on:new Date().toISOString().slice(0,10),note:'PRIVATE SYNTHETIC NOTE. No consent or suitability inferred.'};
    const captured=await json('/api/prospect/networking',{method:'POST',cookie,body:capture});
    assert.equal(captured.added,1);const contactId=captured.capture.contact_id;
    const replay=await json('/api/prospect/networking',{method:'POST',cookie,body:capture});assert.equal(replay.replayed,true);assert.equal(replay.capture.id,captured.capture.id);
    assert.equal((await request('/api/prospect/networking',{method:'POST',cookie,body:{...capture,note:'different'}})).status,409);
    assert.equal((await request('/api/prospect/networking',{method:'POST',cookie,body:{...capture,user_id:'synthetic-other'}})).status,422);
    assert.equal((await json('/api/prospect/networking',{cookie:other})).captures.length,0);
    assert.equal((await json('/api/prospect/networking',{cookie})).captures.length,1);
    const contacts=await json('/api/prospect/contacts',{cookie});assert.equal(contacts.total,1);assert.equal(contacts.contacts[0].email_status,'unverified');assert.ok(!JSON.stringify(contacts).includes(capture.note));
    assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM discovery_leads')).rows[0].n,0,'capture alone never qualifies a lead');
    assert.equal((await request('/api/prospect/contacts/'+contactId,{cookie:other})).status,404);
    assert.equal((await request('/api/prospect/export',{method:'POST',cookie:other,body:{ids:[contactId]}})).status,404);

    // Explicit handoff into the actual advisor Research Lab, preserving private notes.
    const handoff=await json('/api/lab/contact-import',{method:'POST',cookie,body:{ids:[contactId]}});
    assert.equal(handoff.lead_ids.length,1);const leadId=handoff.lead_ids[0];
    const detail=await json('/api/lab/leads/'+leadId,{cookie});
    assert.notEqual(detail.quality.status,'verified');assert.ok(!JSON.stringify(detail).includes(capture.note));
    await json('/api/lab/leads/'+leadId+'/review',{method:'POST',cookie,body:{field:'age',value:{min:62,max:62},verdict:'confirmed',source:'Synthetic fixture only',note:'Fictional age evidence',observed_at:new Date().toISOString(),identity_signature:detail.quality.identity_signature}});
    const reviewed=await json('/api/lab/leads/'+leadId,{cookie});assert.notEqual(reviewed.quality.status,'verified','one reviewed field cannot qualify a lead');
    const unqualifiedExport=await request('/api/lab/export',{method:'POST',cookie,body:{ids:[leadId],verified_only:true}});
    assert.equal(unqualifiedExport.status,200);assert.ok(!(await unqualifiedExport.text()).includes('Jordan'));
    const evidence={residence:{country:'US',scope:'residence',state:'NY'},planning_decision:{origin:'accepted_introduction',topic:'retirement_income',identity_confirmed:true,prospect_confirmed:true},contact:{channel:'email',address:'jordan@example.com',identity_confirmed:true,outreach_basis:'person_requested'}};
    for(const [field,value] of Object.entries(evidence))await json('/api/lab/leads/'+leadId+'/review',{method:'POST',cookie,body:{field,value,verdict:'confirmed',source:'Synthetic evidence only',note:'Fictional fixture, not a real disclosure or document.',observed_at:new Date().toISOString(),identity_signature:detail.quality.identity_signature}});
    const qualified=await json('/api/lab/leads/'+leadId,{cookie});assert.equal(qualified.quality.status,'verified');
    assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM lab_observations WHERE lead_id=$1 AND user_id=$2',[leadId,'synthetic-advisor'])).rows[0].n,4);
    const qualifiedExport=await request('/api/lab/export',{method:'POST',cookie,body:{ids:[leadId],verified_only:true}});
    assert.equal(qualifiedExport.status,200);const leadCSV=await qualifiedExport.text();assert.match(leadCSV,/Jordan/);assert.ok(!leadCSV.includes(capture.note));
    assert.equal((await request('/api/lab/export',{method:'POST',cookie:other,body:{ids:[leadId],verified_only:true}})).status,404);
    const worklist=await json('/api/lab/worklist?view=all',{cookie});assert.equal(worklist.total,1);assert.equal(worklist.items[0].lead.id,leadId);assert.equal(worklist.items[0].action.label,'Follow up on the accepted introduction');
    assert.equal((await json('/api/lab/worklist?view=all',{cookie:other})).total,0);
    assert.equal((await request('/api/lab/leads/'+leadId,{cookie:other})).status,404);

    // Complete the advisor loop through real HTTP handlers, with synthetic identity/data only.
    const activityPath='/api/lab/leads/'+leadId+'/activity';
    const activityDetail=await json(activityPath,{cookie});
    const nextAt=new Date(Date.now()+86400000).toISOString();
    const followUp={outcome:'follow_up',note:'Synthetic prospect asked for a discussion tomorrow.',next_at:nextAt,signature:activityDetail.action.signature,idempotency_key:'pilot-followup-1'};
    await json(activityPath,{method:'POST',cookie,body:followUp});
    assert.equal((await json(activityPath,{method:'POST',cookie,body:followUp})).replayed,true);
    const afterFollowUp=await json(activityPath,{cookie});
    const savedLead=(await json('/api/lab/leads/'+leadId,{cookie})).lead;
    assert.equal(savedLead.follow_up_status,'Follow-up');
    assert.equal(savedLead.follow_up_date,nextAt);
    assert.equal(afterFollowUp.action.bucket,'scheduled');
    assert.equal(afterFollowUp.activities.length,1);
    assert.equal((await request(activityPath,{method:'POST',cookie:other,body:followUp})).status,404);
    assert.equal((await request(activityPath,{method:'POST',cookie,body:{...followUp,idempotency_key:'pilot-stale'}})).status,409);

    // Same durable jobs, task state machine, lists and export; adapters and cost are synthetic.
    const list=await json('/api/prospect/lists',{method:'POST',cookie,body:{name:'Synthetic provider journey'}});
    const search={action:'search',filters:{company:'Synthetic Manufacturing'},size:1,list_id:list.id,idempotency_key:'synthetic-search-0001',max_cost_micros:0};
    const queued=await json('/api/prospect/jobs',{method:'POST',cookie,body:search});
    assert.equal((await json('/api/prospect/jobs',{method:'POST',cookie,body:search})).id,queued.id);
    assert.equal(await staging.jobs.tick(),true);
    assert.equal((await json('/api/prospect/jobs/'+queued.id,{cookie})).tasks[0].status,'completed');
    const found=(await json('/api/prospect/contacts?list_id='+list.id,{cookie})).contacts[0];
    for(const action of ['enrich','verify']){
      const job=await json('/api/prospect/jobs',{method:'POST',cookie,body:{action,ids:[found.id],idempotency_key:'synthetic-'+action+'-0001',max_cost_micros:0}});
      assert.equal(await staging.jobs.tick(),true);const task=(await json('/api/prospect/jobs/'+job.id,{cookie})).tasks[0];assert.equal(task.status,'completed',JSON.stringify(task));
    }
    const preparation=await json('/api/prospect/contacts/'+found.id,{cookie});
    await json('/api/prospect/contacts/'+found.id+'/prepare',{method:'POST',cookie,body:{revision:preparation.contact.edit_revision}});
    assert.deepEqual(staging.providerCalls,['search','enrich','verify','check_domain']);
    assert.equal((await json('/api/prospect/providers',{cookie})).reserved_today_micros,0);
    const exported=await request('/api/prospect/export',{method:'POST',cookie,body:{ids:[found.id,contactId]}});
    assert.equal(exported.status,200);assert.match(exported.headers.get('content-type'),/text\/csv/);
    const csv=await exported.text();assert.match(csv,/Avery/);assert.match(csv,/"avery@example.com","valid"/);assert.ok(!csv.includes(capture.note));
    assert.equal((await request('/api/prospect/jobs/'+queued.id,{cookie:other})).status,404);
    assert.equal((await json('/api/prospect/contacts',{cookie:other})).total,0);
    assert.equal(network.attempts.length,0,'the complete journey attempts no external connections');
    await assert.rejects(fetch('https://example.com/blocked'),/blocked outbound/);
    assert.throws(()=>net.connect({host:'203.0.113.10',port:443}),/blocked outbound/);
    await assert.rejects(new Resolver().resolveMx('example.com'),/blocked DNS/);
    staging.revoke(cookie);assert.equal((await request('/api/prospect/contacts',{cookie})).status,401);
    t.diagnostic('Signed-in routes, networking replay/privacy, lead handoff/review/worklist, provider job/list/export, tenant isolation and zero-cost checks passed. Real Firebase and deployment remain untested.');
  } finally {await staging.close();await staging.close();assert.equal(globalThis.fetch,originalFetch);}
});
