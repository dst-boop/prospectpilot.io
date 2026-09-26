import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';

// "Delete this person": one action removes the person everywhere this user
// holds them, leaves a do-not-call block and the spend ledger without them, and
// keeps them from coming back through an import or a research run.
const MIGRATIONS=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
const now=new Date('2026-09-12T15:00:00Z');
const owner={uid:'owner',email:'owner@example.com'},other={uid:'other',email:'other@example.com'};
const csv='First Name,Last Name,Company,Title,Email,Phone,Country\nJamie,Rivera,Example Manufacturing,Director,jamie@example.com,+12125550199,US';
const labCSV='First Name,Last Name,Company,Title,Email,Estimated Age Range,Country\nJamie,Rivera,Example Manufacturing,Director,jamie@example.com,62,US';

async function fixture(){
  const db=new PGlite();
  for(const file of MIGRATIONS)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const lab=createResearchLab({pool,now:()=>now,sources:{readiness:{}}}),ws=createProspectWorkspace({pool});
  const call=(app,user,method,path)=>app.route(new Request('https://prospectpilot.io'+path,{method}),user);
  return {db,lab,ws,call};
}
const count=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0].n;

test('deleting a contact removes the linked lead and its history, and keeps only what must survive',async()=>{
  const {db,lab,ws,call}=await fixture();try{
    await ws.importCSV(owner,{csv});await ws.importCSV(other,{csv});
    const id=(await ws.search(owner)).contacts[0].id,theirs=(await ws.search(other)).contacts[0].id;
    await lab.importContacts(owner,{ids:[id]});
    const leadId=(await db.query('SELECT lead_id FROM advisor_contact_links WHERE contact_id=$1',[id])).rows[0].lead_id;
    // Provider work about them: one finished and charged, one still queued.
    await db.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('job','owner','enrich','k','h',100)");
    await db.query(`INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,contact_id,payload,status,result) VALUES
      ('done','job','owner','enrich','zoominfo',$1,'{"email":"jamie@example.com"}','completed','{"phone":"+12125550199"}'),
      ('queued','job','owner','verify','zerobounce',$1,'{"email":"jamie@example.com"}','pending','{}')`,[id]);
    await db.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('done','owner','zoominfo',40)");
    await db.query("INSERT INTO research_jobs(id,lead_id,user_id,user_email) VALUES('rj',$1,'owner','owner@example.com')",[leadId]);
    await db.query("INSERT INTO lead_call_records(id,user_id,lead_id,week_start,outcome,notes,created_at) VALUES('cr','owner',$1,'2026-09-07','no_answer','Jamie said call back','x')",[leadId]);
    await db.query("INSERT INTO lead_call_blocks(phone,lead_id,user_id,reason,created_at) VALUES('+12125550199',$1,'owner','Asked not to be called','x')",[leadId]);
    await db.query("INSERT INTO discovery_audit(team,actor_user_id,actor_email,action,record_type,record_id,detail) VALUES('wealth-management','owner','owner@example.com','review','lead',$1,'Jamie Rivera confirmed age')",[leadId]);

    await assert.rejects(call(ws,other,'DELETE','/api/prospect/contacts/'+id),{status:404},'another user cannot delete my contact');
    await assert.rejects(call(lab,other,'DELETE','/api/lab/leads/'+leadId),{status:404},'nor my lead');

    const result=await call(ws,owner,'DELETE','/api/prospect/contacts/'+id);
    assert.deepEqual(result,{deleted:true,contacts:1,leads:1});
    assert.equal(await count(db,'SELECT count(*)::int AS n FROM prospect_contacts WHERE id=$1',[id]),0);
    assert.equal(await count(db,'SELECT count(*)::int AS n FROM discovery_leads WHERE id=$1',[leadId]),0);
    for(const table of ['lab_observations','lab_qualification','advisor_contact_links','research_jobs','lead_call_records'])
      assert.equal(await count(db,`SELECT count(*)::int AS n FROM ${table} WHERE lead_id=$1`,[leadId]),0,table);
    const tasks=Object.fromEntries((await db.query('SELECT id,status,payload,result,contact_id FROM prospect_tasks')).rows.map(r=>[r.id,r]));
    assert.deepEqual([tasks.done.payload,tasks.done.result,tasks.done.status,tasks.done.contact_id],[{},{},'completed',null],'finished work loses the person, keeps its row');
    assert.equal(tasks.queued.status,'skipped','queued work about them is cancelled');
    assert.equal(await count(db,"SELECT reserved_micros::int AS n FROM prospect_charges WHERE task_id='done'"),40,'the spend stays in the ledger');
    const block=(await db.query('SELECT * FROM lead_call_blocks')).rows[0];
    assert.deepEqual([block.phone,block.lead_id,block.reason],['+12125550199','','Asked not to be called'],'the do-not-call block survives without the lead');
    const audit=(await db.query('SELECT action,detail FROM discovery_audit WHERE record_id=$1 ORDER BY id',[leadId])).rows;
    assert.ok(audit.every(r=>r.detail===''),'audit rows keep no details about them');
    assert.ok(audit.some(r=>r.action==='forget'));
    const reports=JSON.stringify((await db.query("SELECT result FROM prospect_imports WHERE user_id='owner'")).rows);
    assert.equal(reports.includes('Jamie Rivera'),false,'import reports no longer name them');
    assert.ok(JSON.parse(reports)[0].result.rows.length>0,'but the report keeps its rows');
    const stones=(await db.query("SELECT key_hash FROM prospect_forgotten WHERE user_id='owner'")).rows;
    assert.ok(stones.length>0);
    assert.ok(stones.every(r=>/^[0-9a-f]{64}$/.test(r.key_hash)),'tombstones are hashes, never the identifiers');
    assert.equal((await db.query('SELECT * FROM prospect_forgotten')).rows.some(r=>JSON.stringify(r).includes('jamie')),false);
    assert.equal(await count(db,'SELECT count(*)::int AS n FROM prospect_contacts WHERE id=$1',[theirs]),1,'another user\'s copy is theirs to keep');

    // They do not come back.
    const again=await ws.importCSV(owner,{csv,source:'Second export'});
    assert.equal(again.added,0);assert.equal(again.rejected,1);
    assert.match(again.errors[0].message,/deleted at your request/);
    const labAgain=await lab.importCSV(owner,{csv:labCSV});
    assert.equal((await lab.list(owner)).leads.length,0,labAgain);
    // The other user is not affected by my tombstones.
    assert.equal((await ws.importCSV(other,{csv,source:'Second export'})).rejected,0);
    await assert.rejects(call(ws,owner,'DELETE','/api/prospect/contacts/'+id),{status:404},'a second delete finds nothing');
  }finally{await db.close();}
});

test('deleting a Research Lab lead removes the linked directory contact too',async()=>{
  const {db,lab,ws,call}=await fixture();try{
    await ws.importCSV(owner,{csv});const id=(await ws.search(owner)).contacts[0].id;
    await lab.importContacts(owner,{ids:[id]});
    const leadId=(await db.query('SELECT lead_id FROM advisor_contact_links WHERE contact_id=$1',[id])).rows[0].lead_id;
    assert.deepEqual(await call(lab,owner,'DELETE','/api/lab/leads/'+encodeURIComponent(leadId)),{deleted:true,contacts:1,leads:1});
    assert.equal(await count(db,'SELECT count(*)::int AS n FROM prospect_contacts'),0);
    assert.equal(await count(db,'SELECT count(*)::int AS n FROM discovery_leads'),0);
  }finally{await db.close();}
});

test('an admin deleting someone else\'s lead tombstones it for the owner as well',async()=>{
  const {db,lab,call}=await fixture();try{
    await lab.importCSV(owner,{csv:labCSV});const leadId=(await lab.list(owner)).leads[0].lead.id;
    const admin={uid:'admin',email:'admin@example.com'};
    await db.query("INSERT INTO discovery_users(user_id,email,full_name,role) VALUES('admin','admin@example.com','Admin','admin')");
    assert.equal((await call(lab,admin,'DELETE','/api/lab/leads/'+encodeURIComponent(leadId))).leads,1);
    await lab.importCSV(owner,{csv:labCSV+'\n'});
    assert.equal((await lab.list(owner)).leads.length,0,'the owner\'s next import does not bring them back');
  }finally{await db.close();}
});

test('deleting needs a person, and an unknown lead is a 404',async()=>{
  const {db,lab,call}=await fixture();try{
    await assert.rejects(call(lab,owner,'DELETE','/api/lab/leads/nope'),{status:404});
  }finally{await db.close();}
});
