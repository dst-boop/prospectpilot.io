import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {ownsLead} from '../forget.mjs';

const migrations=readFileSync(new URL('../migrate.mjs',import.meta.url),'utf8').match(/'(generated\/schema\.sql|migrations\/[^']+\.sql)'/g).map(s=>s.slice(1,-1));
const now=new Date('2026-09-28T15:00:00Z');
const owner={uid:'original-uid',email:'recycled@example.test'};
const recycled={uid:'replacement-uid',email:'RECYCLED@example.test'};
const changed={...owner,email:'new-address@example.test'};
const header='First Name,Last Name,Company,Title,Email,LinkedIn URL,City,State,Country\n';
const person=header+'Jamie,Rivera,Synthetic Company,Director,jamie@example.test,https://www.linkedin.com/in/synthetic-jamie,Austin,TX,US';
const second='Pat,Lee,Other Synthetic Company,Controller,pat@example.test,,Albany,NY,US';
const unclear=header+'Pat,Lee,Other Synthetic Company,Treasurer,pat@example.test,https://www.linkedin.com/in/synthetic-jamie,Albany,NY,US';
async function fixture(){
 const db=new PGlite();
 for(const file of migrations)await db.exec(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
 const lab=createResearchLab({pool,now:()=>now,sources:{readiness:{},quote:()=>0}}),ws=createProspectWorkspace({pool});
 const call=(app,user,method,path,body)=>app.route(new Request('https://example.test'+path,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)}),user);
 await lab.importCSV(owner,{csv:person});
 const id=(await lab.list(owner)).leads[0].lead.id;
 return {db,lab,ws,call,id};
}
const stored=async(db,id)=>(await db.query('SELECT * FROM discovery_leads WHERE id=$1',[id])).rows[0];

test('ownership requires the exact nonempty UID and never falls back to email',()=>{
 for(const uid of [null,undefined,'',' ','different-uid'])assert.equal(ownsLead({owner_user_id:uid,owner_email:owner.email},owner.uid),false);
 assert.equal(ownsLead({owner_user_id:owner.uid,owner_email:owner.email},changed.uid),true);
 assert.equal(ownsLead({owner_user_id:''},''),false);
});

test('a recycled email cannot read, assess, export, change activity, merge through import, or delete another UID lead',async()=>{
 const {db,lab,call,id}=await fixture();try{
  const baseline=await stored(db,id),detail=await lab.advisor.detail(owner,id);
  assert.equal((await lab.list(recycled)).total,0);
  assert.equal((await lab.list(recycled,{search:'Jamie',offset:10})).total,0);
  assert.equal((await lab.advisor.worklist(recycled,{view:'all',search:'Jamie'})).total,0);
  assert.equal((await lab.advisor.scoreboard(recycled)).pipeline.records,0);
  for(const suffix of ['', '/activity','/related'])await assert.rejects(call(lab,recycled,'GET','/api/lab/leads/'+id+suffix),{status:404});
  await assert.rejects(lab.review(recycled,id,{field:'contact',identity_signature:(await lab.detail(owner,id)).quality.identity_signature}),{status:404});
  await assert.rejects(lab.advisor.save(recycled,id,{outcome:'do_not_contact',signature:detail.action.signature,idempotency_key:'recycled-dnc',note:'Synthetic unauthorized mutation'}),{status:404});
  await assert.rejects(lab.advisor.exportEnrichment(recycled,{ids:[id]}),{status:404});
  await assert.rejects(call(lab,recycled,'POST','/api/lab/export',{ids:[id]}),{status:404});
  await assert.rejects(call(lab,recycled,'DELETE','/api/lab/leads/'+id),{status:404});
  const imported=await lab.importCSV(recycled,{csv:person.replace('Director','Unauthorized replacement')});
  assert.equal(imported.result.added,0);assert.equal(imported.result.duplicates,1);
  assert.equal((await lab.list(recycled)).total,0);
  const inventory=await lab.enqueue(recycled,{kind:'inventory',idempotency_key:'recycled-inventory'});
  assert.equal(inventory.status,'completed');
  assert.equal((await db.query('SELECT * FROM lab_tasks WHERE run_id=$1',[inventory.id])).rows.length,0);
  assert.deepEqual(await stored(db,id),baseline,'no payload, owner, or timestamp changes');
  for(const table of ['lab_qualification','lab_observations','advisor_activities','prospect_forgotten'])assert.equal((await db.query(`SELECT * FROM ${table} WHERE user_id=$1`,[recycled.uid])).rows.length,0,table);
 }finally{await db.close();}
});

test('suppressed contact handoff and inherited links never suppress or delete a different UID lead',async()=>{
 const {db,lab,ws,call,id}=await fixture();try{
  const baseline=await stored(db,id),payload={first_name:'Jamie',last_name:'Rivera',company:'Synthetic Company',email:'jamie@example.test',suppressed:true};
  await db.query('INSERT INTO prospect_contacts(id,user_id,payload) VALUES($1,$2,$3)',['replacement-contact',recycled.uid,JSON.stringify(payload)]);
  const imported=await lab.importContacts(recycled,{ids:['replacement-contact']});
  assert.equal(imported.restriction_links,0);assert.deepEqual(imported.lead_ids,[]);
  assert.equal((await db.query('SELECT * FROM advisor_contact_links WHERE user_id=$1',[recycled.uid])).rows.length,0);
  assert.notEqual((await lab.detail(owner,id)).lead.suppressed,true);
  // Model a link created before this fix. Deleting the user's directory copy
  // must not traverse it into a record now owned by a different UID.
  await db.query('INSERT INTO advisor_contact_links(contact_id,lead_id,user_id) VALUES($1,$2,$3)',['replacement-contact',id,recycled.uid]);
  await call(ws,recycled,'PATCH','/api/prospect/contacts/replacement-contact',{suppressed:true});
  assert.notEqual((await lab.detail(owner,id)).lead.suppressed,true,'a foreign linked contact cannot suppress the lead');
  assert.equal((await lab.advisor.worklist(owner,{view:'closed'})).total,0,'worklist uses the same boundary');
  await call(ws,recycled,'PATCH','/api/prospect/contacts/replacement-contact',{suppressed:false});
  assert.deepEqual((await lab.importContacts(recycled,{ids:['replacement-contact']})).lead_ids,[],'stale links cannot leak handoff IDs');
  assert.deepEqual(await call(ws,recycled,'DELETE','/api/prospect/contacts/replacement-contact'),{deleted:true,contacts:1,leads:0});
  assert.deepEqual(await stored(db,id),baseline);
  assert.equal((await db.query('SELECT * FROM prospect_forgotten WHERE user_id=$1',[owner.uid])).rows.length,0);
 }finally{await db.close();}
});

test('same UID with changed email keeps access, suppression, deletion and per-UID tombstones',async()=>{
 const {db,lab,call,id}=await fixture();try{
  assert.equal((await lab.detail(changed,id)).lead.id,id);
  assert.equal((await lab.list(changed)).total,1);
  assert.equal((await lab.importCSV(changed,{csv:person.replace('Director','Chief Financial Officer')})).result.duplicates,1);
  assert.ok((await lab.detail(changed,id)).lead.field_values.current_title.some(entry=>entry.value==='Chief Financial Officer'));
  const d=await lab.advisor.detail(changed,id);
  await lab.advisor.save(changed,id,{outcome:'do_not_contact',signature:d.action.signature,idempotency_key:'uid-owned-dnc',note:'Synthetic opt-out.'});
  assert.equal((await lab.advisor.detail(changed,id)).action.bucket,'closed');
  await assert.rejects(lab.advisor.exportEnrichment(changed,{ids:[id]}),{status:422});
  assert.equal((await call(lab,changed,'DELETE','/api/lab/leads/'+id)).leads,1);
  assert.ok((await db.query('SELECT * FROM prospect_forgotten WHERE user_id=$1',[owner.uid])).rows.length>0);
  assert.equal((await lab.importCSV(changed,{csv:person+'\n'})).result.rejected,1);
  assert.equal((await lab.importCSV(recycled,{csv:person})).result.added,1,'tombstones do not follow the recycled email');
 }finally{await db.close();}
});

test('identity review never exposes or merges same-email foreign records, including a reassigned probable arrival',async()=>{
 const {db,lab,id}=await fixture();try{
  await lab.importCSV(owner,{csv:header+second});
  await lab.importCSV(recycled,{csv:unclear});
  const [review]=(await lab.identityReviews(recycled)).reviews;
  assert.deepEqual(review.matches,[]);assert.equal(review.held_elsewhere,2);
  await assert.rejects(lab.resolveIdentityReview(recycled,review.id,{decision:'merge',target_id:id}),{status:403});
  assert.equal((await stored(db,id)).owner_user_id,owner.uid);
  await lab.importCSV(owner,{csv:header+'Jamie,Rivera,Synthetic Company,Private new title,,,Seattle,WA,US'});
  const [probable]=(await lab.identityReviews(owner)).reviews;
  await db.query('UPDATE discovery_leads SET owner_user_id=$1 WHERE id=$2',[recycled.uid,probable.arrival.id]);
  const [hidden]=(await lab.identityReviews(owner)).reviews;
  assert.equal(hidden.arrival.id,null);assert.equal(hidden.arrival.name,'');assert.equal(hidden.arrival.title,'');
  await assert.rejects(lab.resolveIdentityReview(owner,hidden.id,{decision:'same',target_id:id}),{status:403});
 }finally{await db.close();}
});

test('null and empty legacy ownership is not automatically claimed by a matching email; existing admin policy remains',async()=>{
 const {db,lab,call,id}=await fixture();try{
  // Current schema is NOT NULL. Relax only this synthetic fixture to cover
  // imported legacy databases as well as malformed empty owner IDs.
  await db.exec('ALTER TABLE discovery_leads ALTER COLUMN owner_user_id DROP NOT NULL');
  for(const uid of [null,'']){
   await db.query('UPDATE discovery_leads SET owner_user_id=$1 WHERE id=$2',[uid,id]);
   await assert.rejects(lab.detail(owner,id),{status:404});
   await assert.rejects(call(lab,owner,'DELETE','/api/lab/leads/'+id),{status:404});
   await lab.importCSV(owner,{csv:person+'\n'+(uid===null?'':'\n')});
   assert.equal((await stored(db,id)).owner_user_id,uid);
  }
  const admin={uid:'synthetic-admin',email:'admin@example.test'};
  await db.query("INSERT INTO discovery_users(user_id,email,full_name,role) VALUES($1,$2,'Synthetic administrator','admin')",[admin.uid,admin.email]);
  assert.equal((await lab.detail(admin,id)).lead.id,id);
  assert.equal((await call(lab,admin,'DELETE','/api/lab/leads/'+id)).leads,1);
 }finally{await db.close();}
});

test('DNC propagation follows the actual lead owner, including an administrator, never a foreign stale link',async()=>{
 const {db,lab,id}=await fixture();try{
  for(const [contactId,uid] of [['owner-contact',owner.uid],['foreign-contact',recycled.uid]]){
   await db.query('INSERT INTO prospect_contacts(id,user_id,payload) VALUES($1,$2,$3)',[contactId,uid,JSON.stringify({first_name:'Jamie',last_name:'Rivera',email:'jamie@example.test',suppressed:false})]);
   await db.query('INSERT INTO advisor_contact_links(contact_id,lead_id,user_id) VALUES($1,$2,$3)',[contactId,id,uid]);
  }
  const admin={uid:'synthetic-admin',email:'admin@example.test'};
  await db.query("INSERT INTO discovery_users(user_id,email,full_name,role) VALUES($1,$2,'Synthetic administrator','admin')",[admin.uid,admin.email]);
  const d=await lab.advisor.detail(admin,id);
  await lab.advisor.save(admin,id,{outcome:'do_not_contact',signature:d.action.signature,idempotency_key:'admin-dnc',note:'Synthetic opt-out.'});
  const contacts=(await db.query('SELECT id,payload FROM prospect_contacts')).rows;
  assert.equal(contacts.find(c=>c.id==='owner-contact').payload.suppressed,true);
  assert.equal(contacts.find(c=>c.id==='foreign-contact').payload.suppressed,false);
 }finally{await db.close();}
});
