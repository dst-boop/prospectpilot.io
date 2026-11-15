import test, {before, after, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {createFirmPreviewAdapters} from '../firm-preview-boundary.mjs';
import {createTeamLeadHub} from '../team-lead-hub.mjs';

const actor = {uid:'supervisor-a', email:'same@example.test', role:'owner', team:'untrusted'};
const pair = {actor, sourceUid:'departed-a', targetUid:'advisor-a'};
let db, queries, directoryReads;
const query = async (sql, values) => { queries.push(sql); return db.query(sql,values); };
const accounts = {
  'supervisor-a':{disabled:false,emailVerified:true}, 'advisor-a':{disabled:false,emailVerified:true},
  'departed-a':{disabled:true,emailVerified:true}, 'unverified-a':{disabled:false,emailVerified:false},
  'supervisor-b':{disabled:false,emailVerified:true}, 'advisor-b':{disabled:false,emailVerified:true},
  'multi-firm':{disabled:false,emailVerified:true}, 'suspended-a':{disabled:false,emailVerified:true}
};
const resolveAccount = async uid => {directoryReads.push(uid);return {uid,...accounts[uid],email:'hidden@example.test',customClaims:{admin:true},tokensValidAfterTime:'private'};};
const adapters = (extra={}) => createFirmPreviewAdapters({pool:{query},firmId:'firm-a',actor,resolveAccount,...extra});
const owned = [{kind:'contact',id:'contact-a',advisorUid:'departed-a'}, {kind:'list',id:'list-a',advisorUid:'departed-a'}, {kind:'lead',id:'lead-a',advisorUid:'departed-a'}, {kind:'contact',id:'target-a',advisorUid:'advisor-a'}];
before(async () => {
  db = new PGlite();
  await migrate({connect:async()=>({query:async(sql,values)=>sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values),release(){}}),end:async()=>{}});
  await db.exec(readFileSync(new URL('../schema-drafts/firm-preview-boundary.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO firm_workspaces(id,name,status) VALUES ('firm-a','Firm A','active'),('firm-b','Firm B','active');
    INSERT INTO firm_members(firm_id,user_id,label,role,status,approved_by,approval_reference) VALUES
    ('firm-a','supervisor-a','Supervisor A','supervisor','active','fixture-admin','synthetic-approval'),
    ('firm-a','advisor-a','Advisor A','advisor','active','fixture-admin','synthetic-approval'),
    ('firm-a','departed-a','Departed A','advisor','departed','fixture-admin','synthetic-approval'),
    ('firm-a','unverified-a','Unverified A','advisor','active','fixture-admin','synthetic-approval'),
    ('firm-a','suspended-a','Suspended A','advisor','suspended','fixture-admin','synthetic-approval'),
    ('firm-a','multi-firm','Multi Firm','advisor','active','fixture-admin','synthetic-approval'),
    ('firm-b','supervisor-b','Supervisor B','owner','active','fixture-admin','synthetic-approval'),
    ('firm-b','advisor-b','Advisor B','advisor','active','fixture-admin','synthetic-approval'),
    ('firm-b','multi-firm','Multi Firm','advisor','active','fixture-admin','synthetic-approval');
    INSERT INTO prospect_contacts(id,user_id,payload) VALUES ('contact-a','departed-a','{}'),('target-a','advisor-a','{}'),('contact-b','advisor-b','{}'),('private-a','departed-a','{}'),('multi-b','multi-firm','{}');
    INSERT INTO prospect_lists(id,user_id,name) VALUES ('list-a','departed-a','List A'),('list-b','advisor-b','List B');
    INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES ('lead-a','legacy-shared','departed-a','a@example.test','{}'),('lead-b','legacy-shared','advisor-b','b@example.test','{}');
    INSERT INTO firm_contact_assignments(contact_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES
    ('contact-a','firm-a','departed-a','explicit_assignment','synthetic-rights','fixture-admin'),
    ('target-a','firm-a','advisor-a','firm_created','synthetic-rights','fixture-admin'),
    ('contact-b','firm-b','advisor-b','firm_created','synthetic-rights','fixture-admin'),
    ('multi-b','firm-b','multi-firm','firm_created','synthetic-rights','fixture-admin');
    INSERT INTO firm_list_assignments(list_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ('list-a','firm-a','departed-a','firm_created','synthetic-rights','fixture-admin');
    INSERT INTO firm_lead_assignments(lead_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ('lead-a','firm-a','departed-a','firm_created','synthetic-rights','fixture-admin'),('lead-b','firm-b','advisor-b','firm_created','synthetic-rights','fixture-admin');`);
});
after(async()=>{await db.close();});
beforeEach(async()=>{queries=[];directoryReads=[];await db.exec('BEGIN');});
afterEach(async()=>{await db.exec('ROLLBACK');});

test('valid supervisor grants use only stored firm membership and exact pair', async()=>{
  const a=adapters();
  assert.deepEqual(await a.authorizeSupervisor({actor}),{approved:true,scope:'team-lead-hub-preview',actorUid:actor.uid,team:'firm-a'});
  assert.deepEqual(await a.plannerAdapters.authorize(pair),{approved:true,scope:'advisor-reassignment-preview',team:'firm-a',sourceUid:pair.sourceUid,targetUid:pair.targetUid});
  assert.deepEqual(await a.plannerAdapters.resolveAccount(pair.sourceUid),{uid:pair.sourceUid,disabled:true,emailVerified:true});
});
for (const uid of ['advisor-a','departed-a','suspended-a','supervisor-b','unknown']) test('cannot gain supervisor scope from token claims: '+uid, async()=>{
  const who={...actor,uid}; const a=adapters({actor:who});
  await assert.rejects(a.authorizeSupervisor({actor:who}),{status:403});
  await assert.rejects(a.listAdvisors({actor:who,team:'firm-a'}),{status:403});
  assert.deepEqual(directoryReads,[]); assert.ok(queries.every(sql=>!sql.includes('prospect_contacts')));
});
test('owner membership permits preview without relying on email ownership', async()=>{
  const who={uid:'supervisor-b',email:'not-owner@example.test'};
  assert.equal((await adapters({actor:who,firmId:'firm-b'}).authorizeSupervisor({actor:who})).approved,true);
});
test('a suspended firm or membership immediately fails closed',async()=>{
  const a=adapters(); await a.authorizeSupervisor({actor});
  await db.query("UPDATE firm_workspaces SET status='suspended' WHERE id='firm-a'");
  await assert.rejects(a.authorizeSupervisor({actor}),{status:403});
});
test('request-bound actor and firm cannot be replaced',async()=>{
  const a=adapters();
  await assert.rejects(a.authorizeSupervisor({actor:{uid:'supervisor-b'}}),{status:403});
  await assert.rejects(a.listAdvisors({actor,team:'firm-b'}),{status:403});
  assert.equal(queries.length,0);
});
for (const [sourceUid,targetUid] of [['departed-a','advisor-b'],['advisor-b','advisor-a'],['departed-a','departed-a'],['suspended-a','advisor-a'],['advisor-a','departed-a'],['departed-a','suspended-a'],['departed-a','missing']]) test('exact pair policy refuses '+sourceUid+' to '+targetUid,async()=>{
  const a=adapters(); await assert.rejects(a.plannerAdapters.authorize({actor,sourceUid,targetUid}),{status:403});
  await assert.rejects(a.plannerAdapters.resolveAccount(sourceUid),{status:403});assert.deepEqual(directoryReads,[]);
});
test('directory excludes foreign/suspended members and strips Firebase metadata',async()=>{
  const roster=await adapters().listAdvisors({actor,team:'firm-a'});
  assert.deepEqual(roster.map(r=>r.uid),['advisor-a','departed-a','multi-firm','supervisor-a','unverified-a']);
  for(const row of roster)assert.deepEqual(Object.keys(row).sort(),['disabled','emailVerified','label','uid']);
});
test('directory fails closed when a Firebase account is absent or malformed',async()=>{
  for(const result of [null,{uid:'wrong',disabled:false,emailVerified:true},{uid:'advisor-a',disabled:false}])
    await assert.rejects(adapters({resolveAccount:async()=>result}).listAdvisors({actor,team:'firm-a'}),{status:503});
});
test('revocation or roster change during account resolution prevents response',async()=>{
  let changed=false;
  const a=adapters({resolveAccount:async uid=>{if(!changed){changed=true;await db.query("UPDATE firm_members SET status='suspended' WHERE firm_id='firm-a' AND user_id='advisor-a'");}return resolveAccount(uid);}});
  await assert.rejects(a.listAdvisors({actor,team:'firm-a'}),{status:409});
});
test('account reads require a current pair and never permit unrelated UIDs',async()=>{
  const a=adapters();await assert.rejects(a.plannerAdapters.resolveAccount('advisor-a'),{status:403});
  await a.plannerAdapters.authorize(pair);await assert.rejects(a.plannerAdapters.resolveAccount('advisor-b'),{status:403});
  await db.query("UPDATE firm_members SET status='suspended' WHERE firm_id='firm-a' AND user_id='supervisor-a'");
  await assert.rejects(a.plannerAdapters.resolveAccount('advisor-a'),{status:403});assert.deepEqual(directoryReads,[]);
});
test('repeated authorization invalidates the request-bound pair',async()=>{
  const a=adapters();await a.plannerAdapters.authorize(pair);
  await assert.rejects(a.plannerAdapters.authorize(pair),{status:403});
  await assert.rejects(a.plannerAdapters.resolveAccount(pair.targetUid),{status:403});
  await assert.rejects(a.plannerAdapters.authorize(pair),{status:403});
});
test('explicit resource assignments allow only the exact matching legacy owner',async()=>{
  assert.deepEqual(await adapters().assertRecordScope({...pair,records:owned}),{approved:true,scope:'firm-record-preview',team:'firm-a',count:4});
  assert.deepEqual(directoryReads,[]);
});
for(const record of [{kind:'contact',id:'private-a',advisorUid:'departed-a'}, {kind:'contact',id:'contact-b',advisorUid:'departed-a'}, {kind:'lead',id:'lead-b',advisorUid:'departed-a'}, {kind:'contact',id:'contact-a',advisorUid:'advisor-a'}, {kind:'contact',id:'missing',advisorUid:'departed-a'}])test('private, foreign, mismatched or missing resource refused: '+record.id+'/'+record.advisorUid,async()=>{
  await assert.rejects(adapters().assertRecordScope({...pair,records:[record]}),{status:403});
});
test('multi-firm membership never makes another firm inventory visible',async()=>{
  await assert.rejects(adapters().assertRecordScope({...pair,targetUid:'multi-firm',records:[{kind:'contact',id:'multi-b',advisorUid:'multi-firm'}]}),{status:403});
});
test('underlying owner drift refuses stale explicit assignment',async()=>{
  await db.query("UPDATE prospect_contacts SET user_id='advisor-b' WHERE id='contact-a'");
  await assert.rejects(adapters().assertRecordScope({...pair,records:[owned[0]]}),{status:403});
});
test('malformed, oversized and duplicate inventory is bounded before reads',async()=>{
  for(const records of [null,[null],[{...owned[0],kind:'__proto__'}],[{...owned[0],kind:'contact; DROP TABLE firm_members'}],[owned[0],owned[0]],Array(1001).fill(owned[0]),[{kind:'list',id:'list-a',advisorUid:'advisor-a'}]])
    await assert.rejects(adapters().assertRecordScope({...pair,records}),{status:422});
  assert.equal(queries.length,0);
});
test('cross-firm pair refuses before any record lookup',async()=>{
  await assert.rejects(adapters().assertRecordScope({...pair,targetUid:'advisor-b',records:[owned[0]]}),{status:403});
  assert.ok(queries.every(sql=>!sql.includes('firm_contact_assignments')));
});
test('schema rejects cross-firm assignees, unknown records and duplicate firm ownership',async()=>{
  const cases=[['private-a','firm-a','advisor-b'],['unknown-contact','firm-a','advisor-a'],['contact-a','firm-b','advisor-b']];
  for(const values of cases){await db.exec('SAVEPOINT invalid');
    await assert.rejects(db.query("INSERT INTO firm_contact_assignments(contact_id,firm_id,advisor_uid,rights_basis,rights_reference,reviewed_by) VALUES ($1,$2,$3,'firm_created','synthetic-rights','fixture-admin')",values));
    await db.exec('ROLLBACK TO SAVEPOINT invalid');
  }
});
test('new memberships and firms default to suspended without auto-enrollment',async()=>{
  await db.exec("INSERT INTO firm_workspaces(id,name) VALUES ('new-firm','New firm'); INSERT INTO firm_members(firm_id,user_id,label,approved_by,approval_reference) VALUES ('new-firm','new-member','New member','fixture-admin','synthetic-approval')");
  assert.equal((await db.query("SELECT status FROM firm_workspaces WHERE id='new-firm'")).rows[0].status,'suspended');
  assert.deepEqual((await db.query("SELECT role,status FROM firm_members WHERE firm_id='new-firm'")).rows[0],{role:'advisor',status:'suspended'});
});
test('hub context works, but no snapshot/apply adapter means no real inventory can be previewed',async()=>{
  const origin='https://preview.example.test';
  const call=async(path,body)=>createTeamLeadHub(adapters()).route(new Request(origin+path,{method:body?'POST':'GET',headers:{origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),actor);
  const context=await call('/api/team-hub/context');assert.equal(context.status,200);assert.equal((await context.json()).can_execute,false);
  const preview=await call('/api/team-hub/preview',{source_uid:'departed-a',target_uid:'advisor-a'});assert.equal(preview.status,503);
  assert.equal((await call('/api/team-hub/apply',{})).status,404);
  assert.ok(queries.every(sql=>!sql.includes('prospect_contacts')));
});
test('adapter and draft remain outside automatic migrations and production server',()=>{
  const migration=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8'), server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(migration,/firm-preview-boundary|firm_workspaces/);assert.doesNotMatch(server,/createFirmPreviewAdapters|firm-preview-boundary/);
  const source=readFileSync(new URL('../firm-preview-boundary.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE)\b/);
});

test('concurrent repeated authorization poisons an in-flight grant',async()=>{
  let unblock, entered;
  const blocked=new Promise(resolve=>{unblock=resolve;});
  const ready=new Promise(resolve=>{entered=resolve;});
  let first=true;
  const a=adapters({pool:{query:async(sql,values)=>{if(first){first=false;entered();await blocked;}return query(sql,values);}}});
  const pending=a.plannerAdapters.authorize(pair);await ready;
  await assert.rejects(a.plannerAdapters.authorize(pair),{status:403});unblock();
  await assert.rejects(pending,{status:403});
  await assert.rejects(a.plannerAdapters.resolveAccount(pair.targetUid),{status:403});
});
test('failed authorization cannot be retried on the same instance',async()=>{
  const a=adapters();await assert.rejects(a.plannerAdapters.authorize({...pair,targetUid:'advisor-b'}),{status:403});
  await assert.rejects(a.plannerAdapters.authorize(pair),{status:403});
});
test('supervisor revocation during a slow account lookup refuses the result',async()=>{
  const a=adapters({resolveAccount:async uid=>{await db.query("UPDATE firm_members SET status='suspended' WHERE firm_id='firm-a' AND user_id='supervisor-a'");return resolveAccount(uid);}});
  await a.plannerAdapters.authorize(pair);
  await assert.rejects(a.plannerAdapters.resolveAccount(pair.targetUid),{status:403});
});
test('oversized roster refuses before looking up any account',async()=>{
  await db.exec("INSERT INTO firm_members(firm_id,user_id,label,role,status,approved_by,approval_reference) SELECT 'firm-a','extra-'||n,'Extra','advisor','active','fixture-admin','synthetic-approval' FROM generate_series(1,201) n");
  await assert.rejects(adapters().listAdvisors({actor,team:'firm-a'}),{status:413});assert.deepEqual(directoryReads,[]);
});
test('recipient verification and disabled status still block the existing planner',async()=>{
  const {previewAdvisorReassignment}=await import('../advisor-reassignment-preview.mjs');
  for(const result of [{disabled:false,emailVerified:false},{disabled:true,emailVerified:true}]){
    const a=adapters({resolveAccount:async uid=>({uid,...result})});
    await assert.rejects(previewAdvisorReassignment(pair,{...a.plannerAdapters,loadSnapshot:()=>{throw Error('No inventory read is permitted');}}),{status:422});
  }
});
test('missing configuration and unauthenticated actors fail before querying',()=>{
  for(const input of [{},{pool:{query},firmId:''},{pool:{query},firmId:' firm-a '}])assert.throws(()=>createFirmPreviewAdapters(input),{status:503});
  for(const who of [null,{uid:''},{uid:'bad\u0000id'}])assert.throws(()=>adapters({actor:who}),{status:401});
  assert.equal(queries.length,0);
});

test('wrong-actor repeat invalidates the previous pair before rejecting the actor',async()=>{
  const a=adapters();await a.plannerAdapters.authorize(pair);
  await assert.rejects(a.plannerAdapters.authorize({...pair,actor:{uid:'supervisor-b'}}),{status:403});
  await assert.rejects(a.plannerAdapters.resolveAccount(pair.targetUid),{status:403});assert.deepEqual(directoryReads,[]);
});
test('in-flight account reads cannot return after pair invalidation during the final check',async()=>{
  let unblock, entered, blockFinal=false;
  const blocked=new Promise(resolve=>{unblock=resolve;});
  const ready=new Promise(resolve=>{entered=resolve;});
  const a=adapters({pool:{query:async(sql,values)=>{if(blockFinal){blockFinal=false;entered();await blocked;}return query(sql,values);}},
    resolveAccount:async uid=>{const result=await resolveAccount(uid);blockFinal=true;return result;}});
  await a.plannerAdapters.authorize(pair);
  const pending=a.plannerAdapters.resolveAccount(pair.targetUid);await ready;
  await assert.rejects(a.plannerAdapters.authorize(pair),{status:403});unblock();
  await assert.rejects(pending,{status:403});
});
