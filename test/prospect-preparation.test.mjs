import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {buildPreparation} from '../prospect-preparation.mjs';
async function fixture(fn){const db=new PGlite();const calls=[];let check=async c=>({email:c.email,domain:c.email.split('@')[1],status:'mx_present',checked_at:new Date().toISOString(),provider:'dns'});try{await db.exec(readFileSync(new URL('../migrations/008-prospect-workspace.sql',import.meta.url),'utf8'));const app=createProspectWorkspace({pool:{query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})},checkDomain:async c=>{calls.push(c);return check(c);}});await fn(app,calls,fn=>check=fn);}finally{await db.close();}}
const user={uid:'one'},foreign={uid:'two'};
async function seed(app){await app.importCSV(user,{csv:'First Name,Last Name,Company,Email,Previous Company Name\nAvery,Example,Sample Co,avery@example.com,Previous Co'});const c=(await app.search(user)).contacts[0];return 'https://example.com/api/prospect/contacts/'+c.id;}
const get=async(app,url)=>(await app.route(new Request(url),user)).contact;
const post=(app,url,revision,who=user)=>app.route(new Request(url+'/prepare',{method:'POST',body:JSON.stringify({revision})}),who);
test('one action checks domain and persists preparation without claiming verification or sending',()=>fixture(async(app,calls)=>{
 const url=await seed(app),before=await get(app,url);await post(app,url,before.edit_revision);const after=await get(app,url);
 assert.equal(calls.length,1);assert.equal(after.email_domain_check.status,'mx_present');assert.equal(after.email_status,'unverified');assert.equal(after.preparation_current,true);assert.equal(after.preparation.sent,false);assert.ok(after.preparation.draft);assert.doesNotMatch(after.preparation.draft.body,/401|Previous Co|move|congrat/i);assert.ok(after.preparation.unresolved.some(x=>x.includes('no independent confirmation')));
 await app.route(new Request(url,{method:'PATCH',body:JSON.stringify({fields:{title:'Updated role'},reason:'Reviewed source',revision:after.edit_revision})}),user);assert.equal((await get(app,url)).preparation_current,false);
}));
test('preparation enforces ownership and suppression before external checks',()=>fixture(async(app,calls)=>{
 const url=await seed(app);let c=await get(app,url);await assert.rejects(post(app,url,c.edit_revision,foreign),{status:404});assert.equal(calls.length,0);
 await app.route(new Request(url,{method:'PATCH',body:'{"suppressed":true}'}),user);c=await get(app,url);await post(app,url,c.edit_revision);c=await get(app,url);assert.equal(calls.length,0);assert.equal(c.preparation.draft,null);assert.equal(c.preparation.status,'suppressed');
}));
test('late domain check cannot overwrite a concurrent suppression or correction',()=>fixture(async(app,calls,setCheck)=>{
 const url=await seed(app),before=await get(app,url);let release;setCheck(()=>new Promise(r=>release=r));const operation=post(app,url,before.edit_revision);while(!release)await new Promise(r=>setTimeout(r,5));
 await app.route(new Request(url,{method:'PATCH',body:'{"suppressed":true}'}),user);release({email:before.email,domain:'example.com',status:'mx_present',checked_at:new Date().toISOString()});await assert.rejects(operation,{status:409});const after=await get(app,url);assert.equal(after.suppressed,true);assert.equal(after.preparation,undefined);assert.equal(after.email_domain_check,undefined);
}));
test('domain failures and conflicts produce honest gaps rather than outreach drafts',()=>{
 const c={first_name:'A',last_name:'Example',email:'a@example.com',source_history:[{proposed_values:{title:'VP'}}]};assert.equal(buildPreparation(c,null).draft,null);assert.equal(buildPreparation({...c,source_history:[]},{status:'null_mx'}).draft,null);assert.ok(buildPreparation(c,null).unresolved.some(x=>x.includes('could not be completed')));
});
