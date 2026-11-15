import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {normalizeNetworkingCapture} from '../networking-capture.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createHandler} from '../handler.mjs';
import {loginDestination} from '../login-destination.mjs';
const user={uid:'owner',email:'owner@example.net'},other={uid:'other',email:'other@example.net'};
const input=(changes={})=>({request_key:'synthetic-request-0001',person:{first_name:'Jordan',last_name:'Example',company:'Fictional Company',email:'jordan@example.net'},kind:'in_person',context:'Synthetic conference',occurred_on:'2026-09-01',note:'Fictional interaction only.',...changes});
async function fixture(run){
 const db=new PGlite();
 await migrate({connect:async()=>({query:async(sql,values)=>sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values),release(){}}),end:async()=>{}});
 const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>pool.query(...args),release(){}})};
 const app=createProspectWorkspace({pool});
 try{await run(app,db,pool);}finally{await db.close();}
}
test('networking validation rejects inferred permissions, names alone, forged ownership, and invalid dates',()=>{
 const now=new Date('2026-09-10T12:00:00Z');
 const normalized=normalizeNetworkingCapture(input(),now);
 assert.equal(normalized.entry.introduction.status,'unknown');
 for(const bad of [
  input({person:{first_name:'Jordan',last_name:'Example'}}),input({user_id:'other'}),input({contact_id:'other'}),
  input({person:{first_name:'Jordan',last_name:'Example',company:'Example',email_status:'valid'}}),
  input({occurred_on:'2026-02-30'}),input({occurred_on:'2026-09-11'}),input({request_key:'short'}),input({kind:'guessed_relationship'}),
  input({introduction:{status:'granted',scope:'Contact them',evidence:'They met',confirmed_on:'2026-09-01'}}),
  input({kind:'warm_introduction',referrer:{name:'Sam'}}),
  input({kind:'warm_introduction',referrer:{name:'Sam',context:'Synthetic org'},introduction:{status:'granted'}}),
  input({introduction:{status:'unknown',evidence:'Unconfirmed permission'}}),input({note:'a'.repeat(2001)})
 ])assert.throws(()=>normalizeNetworkingCapture(bad,now),{status:422});
});
test('quick capture creates one unverified contact, keeps private context, and safely replays',()=>fixture(async(app,db)=>{
 const first=await app.captureNetworking(user,input());assert.equal(first.added,1);assert.ok(first.capture.id);
 const replay=await app.captureNetworking(user,input());assert.equal(replay.replayed,true);assert.equal(replay.capture.id,first.capture.id);
 await assert.rejects(app.captureNetworking(user,input({note:'Changed details'})),{status:409});
 const contacts=(await app.search(user)).contacts;assert.equal(contacts.length,1);assert.equal(contacts[0].email_status,'unverified');assert.notEqual(contacts[0].suppressed,true);
 assert.ok(!JSON.stringify(contacts[0]).includes('Fictional interaction only.'));
 assert.equal((await app.networkingHistory(user)).captures[0].payload.context,'Synthetic conference');
 assert.equal((await app.networkingHistory(other)).captures.length,0);
 for(const table of ['discovery_leads','lab_observations','advisor_activities','prospect_list_members'])assert.equal((await db.query('SELECT count(*)::int AS count FROM '+table)).rows[0].count,0,table+' stays unchanged');
 assert.equal((await app.exportCSV(user,{ids:[contacts[0].id]})).status,200);
 await app.captureNetworking(other,input());assert.notEqual((await app.networkingHistory(other)).captures[0].contact_id,first.capture.contact_id);
}));
test('referral permission records never clear suppression, verification, or old evidence',()=>fixture(async(app,db)=>{
 const first=await app.captureNetworking(user,input()),id=first.capture.contact_id;
 await db.query("UPDATE prospect_contacts SET payload=payload||$1::jsonb WHERE id=$2",[JSON.stringify({suppressed:true,email_status:'valid',email_verification:{email:'jordan@example.net',checked_at:new Date().toISOString()},phone_restrictions:{mobile:true}}),id]);
 const introduced=input({request_key:'synthetic-request-0002',kind:'warm_introduction',referrer:{name:'Sam Sample',context:'Fictional partner, conference host'},introduction:{status:'granted',scope:'Sam agreed to ask Jordan about an introduction to this advisor.',evidence:'Synthetic written statement, no permission for direct contact.',confirmed_on:'2026-09-01'}});
 const next=await app.captureNetworking(user,introduced);assert.equal(next.duplicates,1);assert.equal(next.capture.contact_id,id);
 const stored=(await db.query('SELECT payload FROM prospect_contacts WHERE id=$1',[id])).rows[0].payload;
 assert.equal(stored.suppressed,true);assert.equal(stored.email_status,'valid');assert.equal(stored.phone_restrictions.mobile,true);
 assert.ok(!JSON.stringify(stored).includes('Sam Sample'));assert.equal((await app.networkingHistory(user)).captures.length,2);
 assert.equal((await app.networkingHistory(user)).captures.find(row=>row.id===next.capture.id).payload.introduction.status,'granted');
 assert.equal((await app.exportCSV(user,{ids:[id]})).headers.get('X-Excluded-Suppressed'),'1');
}));
test('identity conflicts and forgotten people cannot gain a networking record',()=>fixture(async(app,db)=>{
 const first=await app.captureNetworking(user,input()),id=first.capture.contact_id;
 const conflict=await app.captureNetworking(user,input({request_key:'synthetic-request-0002',person:{first_name:'Namesake',last_name:'Different',company:'Other Company',email:'jordan@example.net'}}));
 assert.equal(conflict.conflicts,1);assert.equal(conflict.capture,undefined);assert.equal((await app.networkingHistory(user)).captures.length,1);
 await app.route(new Request('https://example.net/api/prospect/contacts/'+id,{method:'DELETE'}),user);
 assert.equal((await db.query('SELECT * FROM prospect_networking_captures')).rows.length,0);
 await assert.rejects(app.captureNetworking(user,input()),{status:409,message:'This connection is no longer saved. Refresh recent captures before starting a new capture.'});
 const again=await app.captureNetworking(user,input({request_key:'synthetic-request-0003'}));assert.equal(again.rejected,1);assert.equal(again.capture,undefined);
 assert.equal((await app.search(user)).total,0);
}));

test('matching captures keep shared contact fields and provenance unchanged while retaining supplied details privately',()=>fixture(async(app,db)=>{
 await app.importCSV(user,{source:'Synthetic original source',csv:'First Name,Last Name,Company,Email\nJordan,Example,Fictional Company,jordan@example.net'});
 const id=(await app.search(user)).contacts[0].id,list=await app.createList(user,{name:'Synthetic shared list'});
 await app.membership(user,list.id,{ids:[id]});
 await db.query("INSERT INTO prospect_list_shares(list_id,recipient_uid,recipient_email,owner_email,role) VALUES($1,$2,$3,$4,'viewer')",[list.id,other.uid,other.email,user.email]);
 const before=(await db.query('SELECT payload,updated_at FROM prospect_contacts WHERE id=$1',[id])).rows[0];
 const captured=await app.captureNetworking(user,input({person:{...input().person,title:'New private title',city:'Private city',phone:'+12125550199'},kind:'warm_introduction',referrer:{name:'Sam Sample',context:'Private referrer context'}}));
 assert.equal(captured.capture.contact_id,id);assert.equal(captured.contact_unchanged,true);assert.equal(captured.duplicates,1);
 assert.deepEqual((await db.query('SELECT payload,updated_at FROM prospect_contacts WHERE id=$1',[id])).rows[0],before);
 const shared=await app.route(new Request('https://example.net/api/prospect/lists/'+list.id+'/contacts/'+id),other);
 for(const privateValue of ['Private city','New private title','+12125550199','Networking: Warm introduction','Sam Sample','Synthetic conference'])assert.ok(!JSON.stringify(shared).includes(privateValue),privateValue+' stays private');
 const saved=(await app.networkingHistory(user)).captures[0].payload;
 assert.equal(saved.person.city,'Private city');assert.equal(saved.person.title,'New private title');assert.equal(saved.referrer.name,'Sam Sample');
 assert.equal((await app.networkingHistory(other)).captures.length,0);
 assert.equal((await db.query('SELECT count(*)::int AS count FROM prospect_list_members WHERE list_id=$1',[list.id])).rows[0].count,1);
 for(const row of captured.rows){assert.equal(Object.hasOwn(row,'name'),false);assert.equal(Object.hasOwn(row,'issues'),false);}
 await app.route(new Request('https://example.net/api/prospect/contacts/'+id,{method:'DELETE'}),user);
 assert.equal((await db.query('SELECT * FROM prospect_networking_captures')).rows.length,0);
 const remainingImports=JSON.stringify((await db.query('SELECT result FROM prospect_imports WHERE user_id=$1',[user.uid])).rows);
 for(const privateValue of ['Jordan Example','Private city','New private title','Sam Sample','Fictional interaction only.'])assert.ok(!remainingImports.includes(privateValue),privateValue+' is not retained in import reports after deletion');
}));
test('interaction and contact are saved atomically, and ledger reads cannot cross list scopes',()=>fixture(async(app,db,pool)=>{
 const broken=createProspectWorkspace({pool:{...pool,connect:async()=>({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO prospect_networking_captures'))throw Error('Synthetic ledger failure');return db.query(sql,args);},release(){}})}});
 await assert.rejects(broken.captureNetworking(user,input()),/Synthetic ledger failure/);
 assert.equal((await db.query('SELECT * FROM prospect_contacts')).rows.length,0);assert.equal((await db.query('SELECT * FROM prospect_imports')).rows.length,0);
 const scoped=createProspectWorkspace({pool,scope:{actor:'other',id:'some-list'}});
 await assert.rejects(scoped.captureNetworking(user,input()),{status:403});await assert.rejects(scoped.networkingHistory(user),{status:403});
 await assert.rejects(app.captureNetworking({},input()),{status:401});await assert.rejects(app.networkingHistory({}),{status:401});
}));
test('networking routes require verified authentication, exact origin and safe login return',async()=>{
 const origin='https://prospectpilot.io',seen=[];
 const handler=createHandler({auth:{verifySessionCookie:async cookie=>cookie==='verified'?{...user,email_verified:true,firebase:{sign_in_provider:'password'}}:{...user,email_verified:false}},origins:[origin],prospect:{route:async(req,claims)=>{seen.push(claims.uid);return {ok:true};}},networkingPage:'capture-page',networkingScript:'capture-script',networkingStyle:'capture-style'});
 const request=(path,{cookie='',method='GET',site=origin}={})=>new Request(origin+path,{method,headers:{...(cookie?{cookie:'__session='+cookie}:{}),origin:site}});
 for(const [path,body] of [['/networking','capture-page'],['/networking-client.js','capture-script'],['/networking.css','capture-style']]){
  assert.equal((await handler(request(path))).status,303);assert.equal((await handler(request(path,{cookie:'unverified'}))).status,303);
  const response=await handler(request(path,{cookie:'verified'}));assert.equal(await response.text(),body);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 }
 for(const method of ['GET','POST'])assert.equal((await handler(request('/api/prospect/networking',{method}))).status,401);
 assert.equal((await handler(request('/api/prospect/networking',{method:'POST',cookie:'verified',site:'https://attacker.example'}))).status,403);assert.equal(seen.length,0);
 assert.equal((await handler(request('/api/prospect/networking',{method:'POST',cookie:'verified'}))).status,200);assert.deepEqual(seen,['owner']);
 assert.equal(loginDestination('/networking?untrusted=1'),'/networking');assert.equal(loginDestination('//attacker.example/networking'),'/lab');
});
test('networking assets are packaged, contact navigation exposes capture, and browser uses safe text rendering',()=>{
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
 for(const file of ['networking-capture.mjs','networking.html','networking-client.js','networking.css']){assert.ok(read('Dockerfile').includes(file));assert.ok(read('.dockerignore').includes('!'+file));}
 assert.match(read('prospect.html'),/href="\/networking"/);assert.match(read('networking.html'),/Notes stay private/);assert.match(read('networking.html'),/Nothing is sent/);
 assert.doesNotMatch(read('networking-client.js'),/innerHTML|localStorage|sessionStorage|mailto:|tel:/);
 assert.match(read('networking-client.js'),/if\(pending\|\|!form.reportValidity\(\)\)return/);assert.match(read('networking-client.js'),/event.persisted/);
 const ids=[...read('networking.html').matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
});
