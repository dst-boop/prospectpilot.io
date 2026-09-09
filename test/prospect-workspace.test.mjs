import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createHandler} from '../handler.mjs';
const user={uid:'one'},other={uid:'two'};
test('saved searches reject unavailable lists and retain valid quality and suppression filters',()=>fixture(async app=>{
 const own=await app.createList(user,{name:'Owned'}),foreign=await app.createList(other,{name:'Other list'});
 const save=filters=>app.route(new Request('https://example.com/api/prospect/saved-searches',{method:'POST',body:JSON.stringify({name:'Review',filters})}),user);
 for(const list_id of [foreign.id,'missing-list'])await assert.rejects(save({list_id}),{status:404});
 const before=await app.route(new Request('https://example.com/api/prospect/saved-searches'),user);assert.equal(before.searches.length,0);
 const saved=await save({list_id:own.id,quality_issue:'shared_mailbox',suppressed:'false'});
 assert.equal(saved.filters.list_id,own.id);assert.equal(saved.filters.quality_issue,'shared_mailbox');assert.equal(saved.filters.suppressed,'false');
}));
const csv='First Name,Last Name,Company,Title,Email,Phone,Country,State,City,Industry,Seniority\nJamie,Rivera,Example Manufacturing,Operations Director,jamie@example.com,2125551234,US,NY,Albany,Manufacturing,Director';
test('public signups use isolated workspaces through the authenticated transport',()=>fixture(async app=>{
 const origin='https://prospectpilot.io';const handler=createHandler({auth:{verifySessionCookie:async uid=>({uid,email:uid+'@example.net',email_verified:true,firebase:{sign_in_provider:uid==='alice'?'google.com':'password'}})},ownerEmail:'admin@example.net',origins:[origin],prospect:app});
 const call=(uid,path,method='GET',body)=>handler(new Request(origin+'/api/prospect/'+path,{method,headers:{cookie:'__session='+uid,origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await call('alice','import','POST',{csv})).status,200);
 const alice=await (await call('alice','contacts')).json(),bob=await (await call('bob','contacts')).json();assert.equal(alice.total,1);assert.equal(bob.total,0);
 const id=alice.contacts[0].id;assert.equal((await call('bob','contacts/'+id)).status,404);assert.equal((await call('bob','contacts/'+id,'PATCH',{suppressed:true})).status,404);assert.equal((await call('bob','export','POST',{ids:[id]})).status,404);
 assert.equal((await call('bob','import','POST',{csv})).status,200);const own=await (await call('bob','contacts')).json();assert.equal(own.total,1);assert.notEqual(own.contacts[0].id,id);
}));
test('ZoomInfo CSV profile maps professional fields without API access or verification claims',()=>fixture(async app=>{
 const input={format:'zoominfo',csv:'Contact First Name,Contact Last Name,Company Name,Job Title,Contact Email,Direct Phone Number,LinkedIn Contact Profile URL,Contact Country,Contact State,Contact City,Company Website,Primary Industry,Management Level,Email Status,Company Country,Mobile Phone\nJamie,Rivera,Example,Director,jamie@example.com,N/A,https://www.linkedin.com/in/jamie-rivera,US,NY,Albany,https://example.com/,Manufacturing,Director,valid,Canada,2125559876'};
 const result=await app.importCSV(user,input);assert.equal(result.added,1);const contact=(await app.search(user)).contacts[0];
 assert.equal(contact.source,'ZoomInfo CSV export');assert.equal(contact.source_kind,'zoominfo_csv');assert.equal(contact.company_domain,'example.com');assert.equal(contact.country,'US');assert.equal(contact.phone,'');assert.equal(contact.email_status,'unverified');assert.equal(contact.seniority,'Director');
 assert.equal((await app.importCSV(user,input)).replayed,true);assert.equal((await app.search(other)).total,0);
 await assert.rejects(app.importCSV(user,{...input,format:'unknown'}),{status:422});
}));
test('contact details and suppression are owner scoped and cannot edit identity or verification',()=>fixture(async(app)=>{
 const list=await app.createList(user,{name:'Team'});await app.importCSV(user,{csv,list_id:list.id});
 const id=(await app.search(user)).contacts[0].id;
 const call=(method,who=user,body)=>app.route(new Request('https://example.com/api/prospect/contacts/'+id,{method,...(body?{body:JSON.stringify(body)}:{})}),who);
 const detail=await call('GET');assert.equal(detail.contact.email,'jamie@example.com');assert.equal(detail.lists[0].id,list.id);
 await assert.rejects(call('GET',other),{status:404});await assert.rejects(call('PATCH',other,{suppressed:true}),{status:404});
 await assert.rejects(call('PATCH',user,{suppressed:'true'}),{status:422});await assert.rejects(call('PATCH',user,{suppressed:true,email_status:'valid'}),{status:422});
 await call('PATCH',user,{suppressed:true});assert.equal((await call('GET')).contact.suppressed,true);
 assert.ok(!(await (await app.exportCSV(user,{ids:[id]})).text()).includes('jamie@example.com'));
 await call('PATCH',user,{suppressed:false});assert.equal((await call('GET')).contact.email_status,'unverified');assert.match(await (await app.exportCSV(user,{ids:[id]})).text(),/jamie@example.com/);
}));
test('verification expires before filtering and exporting, with owner isolation',()=>fixture(async(app,db)=>{
 await app.importCSV(user,{csv});await app.importCSV(other,{csv});
 const set=async(verification)=>db.query(`UPDATE prospect_contacts SET payload=payload || $1::jsonb`,[JSON.stringify({email_status:'valid',email_verification:verification})]);
 await set({email:'jamie@example.com',checked_at:new Date(Date.now()-86400000).toISOString()});
 assert.equal((await app.search(user,{email_status:'valid'})).total,1);
 for(const verification of [{email:'jamie@example.com',checked_at:new Date(Date.now()-31*86400000).toISOString()},{email:'wrong@example.com',checked_at:new Date().toISOString()},{email:'jamie@example.com',checked_at:new Date(Date.now()+86400000).toISOString()},{}]){
  await set(verification);assert.equal((await app.search(user,{email_status:'valid'})).total,0);
  assert.equal((await db.query("SELECT payload->>'email_status' AS status FROM prospect_contacts WHERE user_id=$1",[other.uid])).rows[0].status,'valid');
 }
 await set({});const id=(await db.query('SELECT id FROM prospect_contacts WHERE user_id=$1',[user.uid])).rows[0].id;
 assert.match(await (await app.exportCSV(user,{ids:[id]})).text(),/unverified/);
}));
test('list rename and deletion preserve contacts and remove stale saved-search scopes',()=>fixture(async(app)=>{
 const call=(path,method,who=user,body)=>app.route(new Request('https://example.com/api/prospect/'+path,{method,...(body?{body:JSON.stringify(body)}:{})}),who);
 const list=await app.createList(user,{name:'First'});await app.importCSV(user,{csv,list_id:list.id});
 const saved=await call('saved-searches','POST',user,{name:'Scoped',filters:{list_id:list.id,title:'Director'}});
 await assert.rejects(call('lists/'+list.id,'PATCH',other,{name:'Stolen'}),{status:404});
 assert.equal((await call('lists/'+list.id,'PATCH',user,{name:'Renamed'})).name,'Renamed');
 await assert.rejects(call('lists/'+list.id,'DELETE',other),{status:404});
 await call('lists/'+list.id,'DELETE');assert.equal((await app.search(user)).total,1);assert.equal((await app.lists(user)).lists.length,0);
 const filters=(await call('saved-searches','GET')).searches[0].filters;assert.equal(filters.list_id,undefined);assert.equal(filters.title,'Director');
 await assert.rejects(call('saved-searches/'+saved.id,'DELETE',other),{status:404});await call('saved-searches/'+saved.id,'DELETE');assert.equal((await call('saved-searches','GET')).searches.length,0);
}));
async function fixture(fn){const db=new PGlite();try{await db.exec(readFileSync(new URL('../migrations/008-prospect-workspace.sql',import.meta.url),'utf8'));const app=createProspectWorkspace({pool:{query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})}});await fn(app,db);}finally{await db.close();}}
test('contact import, search, pagination, lists and export are owner-scoped',()=>fixture(async app=>{
 const list=await app.createList(user,{name:'Operations'});assert.equal((await app.importCSV(user,{csv,source:'Authorized CSV',list_id:list.id})).added,1);
 const result=await app.search(user,{title:'director',industry:'manufacturing',has_phone:'true',list_id:list.id});assert.equal(result.total,1);const id=result.contacts[0].id;assert.equal(result.contacts[0].email_status,'unverified');
 assert.equal((await app.search(other)).total,0);assert.equal((await app.lists(other)).lists.length,0);await assert.rejects(app.search(other,{list_id:list.id}),{status:404});await assert.rejects(app.membership(other,list.id,{ids:[id]}),{status:404});await assert.rejects(app.exportCSV(other,{ids:[id]}),{status:404});
 assert.equal((await app.search(user,{offset:50})).total,1);assert.equal((await app.search(user,{offset:50})).contacts.length,0);
 await app.membership(user,list.id,{ids:[id]},true);assert.equal((await app.search(user,{list_id:list.id})).total,0);assert.equal((await app.search(user)).total,1);
 await app.membership(user,list.id,{ids:[id]});await app.membership(user,list.id,{ids:[id]});assert.equal((await app.lists(user)).lists[0].contacts,1);
 assert.match(await (await app.exportCSV(user,{ids:[id]})).text(),/jamie@example.com/);
}));
test('idempotency, suppression, false verification and conflicting identifiers fail safely',()=>fixture(async(app,db)=>{
 assert.equal((await app.importCSV(user,{csv})).added,1);assert.equal((await app.importCSV(user,{csv})).replayed,true);
 assert.equal((await app.importCSV(user,{csv:csv+'\n'})).duplicates,1);
 assert.equal((await app.importCSV(user,{csv:csv.replace('jamie@example.com','j.amie@example.com')})).conflicts,1);
 const claims='First Name,Last Name,Company,Email,Email Status,Suppressed\nJamie,Rivera,Example Manufacturing,jamie@example.com,valid,true';
 await app.importCSV(user,{csv:claims});const c=(await app.search(user)).contacts[0];assert.equal(c.email_status,'unverified');assert.equal(c.suppressed,true);
 await app.importCSV(user,{csv:claims.replace('true','false')});assert.equal((await app.search(user)).contacts[0].suppressed,true);
 const exported=await app.exportCSV(user,{ids:[c.id]});assert.equal(exported.headers.get('X-Excluded-Suppressed'),'1');assert.ok(!(await exported.text()).includes('jamie@example.com'));
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM prospect_contacts')).rows[0].n),1);
}));
test('filters bind values, malformed imports are reported, and saved searches isolate users',()=>fixture(async app=>{
 await app.importCSV(user,{csv});assert.equal((await app.search(user,{q:"' OR 1=1 --"})).total,0);
 await assert.rejects(app.search(user,{limit:-1}),{status:422});await assert.rejects(app.importCSV(user,{csv:'First Name,FirstName,Last Name\nA,A,B'}),{status:422});
 const bad=await app.importCSV(user,{csv:csv.replace('jamie@example.com','not-an-email')});assert.equal(bad.rejected,1);assert.equal(bad.errors[0].row,2);
 const call=(method,who,body)=>app.route(new Request('https://example.com/api/prospect/saved-searches',{method,...(body?{body:JSON.stringify(body)}:{})}),who);
 await call('POST',user,{name:'Directors',filters:{title:'Director',unexpected:'discard'}});const searches=await call('GET',user);assert.equal(searches.searches.length,1);assert.equal(searches.searches[0].filters.unexpected,undefined);assert.equal((await call('GET',other)).searches.length,0);
}));
