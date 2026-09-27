import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createHandler} from '../handler.mjs';
const origin='https://prospectpilot.io';
const users=Object.fromEntries(['owner','editor','viewer','outsider'].map(uid=>[uid,{uid,email:uid+'@example.test',email_verified:true,firebase:{sign_in_provider:'password'}}]));
const csv=name=>'First Name,Last Name,Company,Email\n'+name+',Example,Fixture,'+name.toLowerCase()+'@example.test';
async function fixture(fn){
 const db=new PGlite();
 try{
  for(const migration of ['008-prospect-workspace','017-forget','020-list-sharing'])await db.exec(readFileSync(new URL('../migrations/'+migration+'.sql',import.meta.url),'utf8'));
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const app=createProspectWorkspace({pool,resolveRecipient:async email=>{const u=Object.values(users).find(u=>u.email===email);return u&&{...u,emailVerified:true};},checkDomain:async()=>null});
  const handler=createHandler({auth:{verifySessionCookie:async uid=>users[uid]},ownerEmail:users.owner.email,origins:[origin],prospect:app});
  const call=async(who,path,method='GET',body,site=origin)=>{
   const response=await handler(new Request(origin+'/api/prospect/'+path,{method,headers:{cookie:'__session='+who,origin:site,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
   const content=response.headers.get('content-type')?.includes('text/csv')?await response.text():await response.json();return {status:response.status,data:content};
  };
  const list=await app.createList(users.owner,{name:'Shared fixture'}),privateList=await app.createList(users.owner,{name:'Private fixture'});
  await app.importCSV(users.owner,{csv:csv('Shared'),list_id:list.id});await app.importCSV(users.owner,{csv:csv('Private'),list_id:privateList.id});await app.importCSV(users.outsider,{csv:csv('Outside')});
  const shared=(await app.search(users.owner,{list_id:list.id})).contacts[0],hidden=(await app.search(users.owner,{list_id:privateList.id})).contacts[0],outside=(await app.search(users.outsider)).contacts[0];
  const base='lists/'+list.id;
  for(const role of ['editor','viewer'])assert.equal((await call('owner',base+'/shares','POST',{email:users[role].email,role})).status,200);
  await fn({db,app,call,list,privateList,shared,hidden,outside,base});
 }finally{await db.close();}
}

test('authenticated sharing preserves the owner/editor/viewer role matrix and hides outsiders',()=>fixture(async({call,app,base,list,privateList,shared,hidden,outside})=>{
 for(const role of ['owner','editor','viewer']){
  const listed=await call(role,'lists');assert.equal(listed.status,200);const l=listed.data.lists.find(l=>l.id===list.id);assert.equal(l.role,role);
  if(role!=='owner'){assert.equal(listed.data.lists.length,1);assert.equal(l.shared_by,users.owner.email);assert.equal((await call(role,'contacts')).data.total,0);}
  assert.equal((await call(role,'contacts?list_id='+list.id)).data.total,1);
  const search=await call(role,base+'/contacts?list_id='+privateList.id);assert.equal(search.status,200);assert.equal(search.data.total,1);assert.equal(search.data.contacts[0].id,shared.id);
  const detail=await call(role,base+'/contacts/'+shared.id);assert.equal(detail.status,200);assert.equal(detail.data.lists.length,1);assert.equal(detail.data.lists[0].id,list.id);
  assert.equal((await call(role,base+'/export','POST',{ids:[shared.id]})).status,200);
  for(const id of [hidden.id,outside.id]){
   assert.equal((await call(role,base+'/contacts/'+id)).status,404);
   assert.equal((await call(role,base+'/contacts/'+id,'PATCH',{suppressed:true})).status,role==='viewer'?403:404);
   assert.equal((await call(role,base+'/export','POST',{ids:[shared.id,id]})).status,404);
  }
 }
 assert.deepEqual((await call('outsider','lists')).data.lists,[]);
 for(const path of [base+'/contacts',base+'/contacts/'+shared.id,base+'/shares','lists/'+privateList.id+'/contacts'])assert.equal((await call('outsider',path)).status,404);
 for(const role of ['editor','viewer','outsider']){
  const denied=role==='outsider'?404:403;
  for(const [path,method,body] of [[base,'PATCH',{name:'Stolen'}],[base,'DELETE'],[base+'/shares','GET'],[base+'/shares','POST',{email:users.outsider.email,role:'editor'}],[base+'/shares/viewer','DELETE']])assert.equal((await call(role,path,method,body)).status,denied,role+' '+method+' '+path);
  for(const [path,method,body] of [['contacts/'+shared.id,'GET'],['contacts/'+shared.id,'PATCH',{suppressed:true}],['contacts/'+shared.id,'DELETE'],['export','POST',{ids:[shared.id]}],['imports/guessed','GET']])assert.equal((await call(role,path,method,body)).status,404);
 }
 assert.equal((await call('owner',base+'/shares')).data.shares.length,2);
 assert.equal((await call('owner',base,'PATCH',{name:'Renamed'})).status,200);
 // Same email with another UID confers no access, nor does an owner-like body.
 users.impostor={...users.viewer,uid:'impostor'};
 try{assert.equal((await call('impostor',base+'/contacts')).status,404);}finally{delete users.impostor;}
 assert.equal((await call('outsider',base+'/import','POST',{csv:csv('Injected'),user_id:'owner'})).status,404);
 assert.equal((await app.search(users.owner,{list_id:privateList.id})).contacts[0].id,hidden.id);
}));

test('editors change only list data; viewers cannot mutate, import, prepare, or change membership',()=>fixture(async({call,app,base,shared,hidden,privateList,list})=>{
 const mutations=[['contacts/'+shared.id,'PATCH',{suppressed:true}],['contacts/'+shared.id+'/prepare','POST',{revision:'bad'}],['import','POST',{csv:csv('Added')}],['import/preview','POST',{csv:csv('Added')}],['members','POST',{ids:[shared.id]}],['members','DELETE',{ids:[shared.id]}]];
 for(const [path,method,body] of mutations)assert.equal((await call('viewer',base+'/'+path,method,body)).status,403,path);
 assert.equal((await call('editor',base+'/contacts/'+shared.id,'DELETE')).status,404);
 assert.equal((await call('editor',base+'/contacts/'+shared.id+'/profile-image','POST',{})).status,404);
 let detail=(await call('editor',base+'/contacts/'+shared.id)).data.contact;
 assert.equal((await call('editor',base+'/contacts/'+shared.id,'PATCH',{fields:{title:'Director'},revision:detail.edit_revision,reason:'Reviewed fixture'})).status,200);
 assert.equal((await call('owner','contacts/'+shared.id)).data.contact.title,'Director');
 assert.equal((await call('editor',base+'/contacts/'+shared.id,'PATCH',{fields:{title:'Stale'},revision:detail.edit_revision,reason:'Stale fixture'})).status,409);
 detail=(await call('editor',base+'/contacts/'+shared.id)).data.contact;
 assert.equal((await call('editor',base+'/contacts/'+shared.id+'/prepare','POST',{revision:detail.edit_revision})).status,200);
 assert.equal((await call('editor',base+'/contacts/'+shared.id,'PATCH',{suppressed:true})).status,200);
 assert.ok(!(await call('viewer',base+'/export','POST',{ids:[shared.id]})).data.includes('shared@example.test'));
 assert.equal((await call('editor',base+'/members','POST',{ids:[hidden.id]})).status,404);
 const preview=await call('editor',base+'/import/preview','POST',{csv:csv('Added'),list_id:privateList.id});assert.equal(preview.status,200);assert.equal(preview.data.added,1);
 assert.equal((await app.search(users.owner,{list_id:list.id})).total,1);
 const imported=await call('editor','import','POST',{csv:csv('Added'),list_id:list.id});assert.equal(imported.status,200);assert.equal(imported.data.added,1);
 assert.equal((await call('editor',base+'/import','POST',{csv:csv('Added')})).data.replayed,true);
 assert.equal((await app.search(users.owner,{list_id:privateList.id})).total,1);
 assert.equal((await app.search(users.editor)).total,0);
 // A private matching record is neither exposed nor duplicated/unsuppressed.
 await call('owner','contacts/'+hidden.id,'PATCH',{suppressed:true});
 const blocked=await call('editor',base+'/import','POST',{csv:csv('Private')});assert.equal(blocked.data.rejected,1);assert.equal(blocked.data.added,0);assert.ok(!JSON.stringify(blocked.data).includes(hidden.id));
 assert.equal((await app.search(users.owner)).total,3);
 assert.equal((await call('owner','contacts/'+hidden.id)).data.contact.suppressed,true);
 assert.equal((await call('editor',base+'/members','DELETE',{ids:[shared.id]})).status,200);
 assert.equal((await call('editor',base+'/contacts/'+shared.id)).status,404);
 assert.equal((await call('owner','contacts/'+shared.id)).status,200);
}));

test('revocation, downgrade, leaving, and owner deletion remove access and scoped saved searches',()=>fixture(async({call,db,base,shared,list})=>{
 for(const role of ['editor','viewer'])assert.equal((await call(role,'saved-searches','POST',{name:'Shared scope',filters:{list_id:list.id}})).status,200);
 assert.equal((await call('owner',base+'/shares','POST',{email:users.editor.email,role:'viewer'})).status,200);
 assert.equal((await call('editor',base+'/contacts/'+shared.id,'PATCH',{suppressed:true})).status,403);
 assert.equal((await call('owner',base+'/shares/editor','DELETE')).status,200);
 assert.equal((await call('editor',base+'/contacts')).status,404);assert.equal((await call('editor','saved-searches')).data.searches.length,0);
 assert.equal((await call('viewer',base+'/shares/me','DELETE')).status,200);
 assert.equal((await call('viewer',base+'/contacts')).status,404);assert.equal((await call('viewer','saved-searches')).data.searches.length,0);
 assert.equal((await call('owner',base+'/shares/me','DELETE')).status,422);
 for(const role of ['editor','viewer']){
  await call('owner',base+'/shares','POST',{email:users[role].email,role});
  await call(role,'saved-searches','POST',{name:'Again',filters:{list_id:list.id}});
 }
 assert.equal((await call('owner',base,'DELETE')).status,200);
 assert.equal((await db.query('SELECT * FROM prospect_list_shares')).rows.length,0);
 for(const role of ['editor','viewer']){
  assert.equal((await call(role,'lists')).data.lists.length,0);assert.equal((await call(role,base+'/contacts')).status,404);assert.equal((await call(role,'saved-searches')).data.searches.length,0);
 }
 assert.equal((await call('owner','contacts/'+shared.id)).status,200);
}));

test('sharing validation, unverified sessions, CSRF, and database role constraints fail closed',()=>fixture(async({call,db,base,list})=>{
 for(const input of [{email:users.editor.email,role:'owner'},{email:users.editor.email,role:'admin'},{email:users.owner.email,role:'editor'},{email:'missing@example.test',role:'viewer'},{email:'bad',role:'viewer'},{email:users.editor.email,role:'viewer',user_id:'outsider'}])assert.equal((await call('owner',base+'/shares','POST',input)).status,422);
 assert.equal((await call('owner',base+'/shares','POST',{email:users.editor.email.toUpperCase(),role:'editor'})).status,200);
 assert.equal((await call('owner',base+'/shares','POST',{email:users.editor.email,role:'viewer'},'https://attacker.test')).status,403);
 users.unverified={...users.editor,email_verified:false};
 try{assert.equal((await call('unverified',base+'/contacts')).status,401);}finally{delete users.unverified;}
 assert.equal((await call('missing',base+'/contacts')).status,401);
 await assert.rejects(db.query("INSERT INTO prospect_list_shares(list_id,recipient_uid,recipient_email,owner_email,role) VALUES($1,'invalid','invalid@example.test','owner@example.test','owner')",[list.id]),e=>e.code==='23514');
}));
