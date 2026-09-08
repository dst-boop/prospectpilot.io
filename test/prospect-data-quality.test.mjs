import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {normalizeContact,parseContactCSV,contactQuality,sharedMailbox} from '../prospect-data-quality.mjs';
import {createProspectWorkspace,contactIdentities} from '../prospect-workspace.mjs';
const user={uid:'quality-owner'},other={uid:'other'};
const basic='First Name,Last Name,Company,Email,Country,State\nAvery,Example,Sample Co,avery@example.com,United States,New York';
async function fixture(fn){const db=new PGlite();try{await db.exec(readFileSync(new URL('../migrations/008-prospect-workspace.sql',import.meta.url),'utf8'));const app=createProspectWorkspace({pool:{query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})}});await fn(app,db);}finally{await db.close();}}
const raw={first_name:'Avery',last_name:'Example',company:'Sample Co'};

test('strict CSV parsing preserves quoted content and physical line numbers',()=>{
 const parsed=parseContactCSV('\uFEFFFirst Name,Last Name,Company\r\n\r\nAvery,Example,"Sample\r\nCompany"\r\nMorgan,Sample,"A ""Quoted"" Company"');
 assert.equal(parsed.records[0].row,3);assert.equal(parsed.records[0].cells[2],'Sample\nCompany');assert.equal(parsed.records[1].row,5);assert.equal(parsed.records[1].cells[2],'A "Quoted" Company');
 for(const body of ['Avery,Ex"ample,Sample','Avery,Example,"Sample"oops','Avery,Example,"Sample'])assert.throws(()=>parseContactCSV('First Name,Last Name,Company\n'+body),/quot/i);
 assert.throws(()=>parseContactCSV('First Name,Last Name,\nAvery,Example,Sample'),/header/i);
 assert.throws(()=>parseContactCSV('First Name,FirstName,Last Name\nA,A,B'),/Duplicate/);
 assert.equal(parseContactCSV('First Name,Last Name,Company\rAvery,Example,Sample').records.length,1);
});

test('normalization handles provider formats without inventing verification or location',()=>{
 const contact=normalizeContact({...raw,country:' U.S.A. ',state:'new york',company_domain:'https://www.example.com/team?ref=export',email:'N/A',phone:'--',linkedin_url:'linkedin.com/in/avery-example'},'Provider export');
 assert.equal(contact.country,'US');assert.equal(contact.state,'NY');assert.equal(contact.company_domain,'example.com');assert.equal(contact.email,'');assert.equal(contact.phone,'');assert.equal(contact.linkedin_url,'https://www.linkedin.com/in/avery-example');assert.equal(contact.email_status,'missing');
 assert.equal(normalizeContact({...raw,state:'New York'},'Export').country,'');
 assert.equal(normalizeContact({...raw,country:'Canada',state:'New York'},'Export').state,'New York');
 assert.throws(()=>normalizeContact({...raw,suppressed:'maybe'}),/Suppressed/);
 for(const email of ['a..b@example.com','.ab@example.com','ab.@example.com','ab@-example.com'])assert.throws(()=>normalizeContact({...raw,email}),/email/i);
 assert.throws(()=>normalizeContact({...raw,phone:'Call 2125551234'}),/phone/i);
 assert.throws(()=>normalizeContact({...raw,first_name:'A'.repeat(201)}),/exceeds/);
 assert.throws(()=>normalizeContact({...raw,last_name:'\u0000Example'}),/control/);
});

test('shared mailboxes are never individual identity keys and quality flags do not assert accuracy',()=>{
 for(const email of ['team@example.com','hr@example.com','support+us@example.com']){assert.equal(sharedMailbox(email),true);assert.ok(!contactIdentities({...raw,email}).some(key=>key.startsWith('email:')));}
 const quality=contactQuality({...raw,email:'avery@example.invalid',email_status:'unverified',last_seen_at:new Date().toISOString()});
 assert.ok(quality.issues.some(issue=>issue.code==='test_address'));assert.ok(quality.issues.some(issue=>issue.code==='source_date_unknown'));assert.ok(quality.issues.some(issue=>issue.code==='email_not_verified'));
 assert.ok(contactQuality({...raw,source_observed_at:'2020-01-01'}).issues.some(issue=>issue.code==='stale_source'));
});

test('preview simulates duplicates and rejects rows without writing contacts, imports or memberships',()=>fixture(async(app,db)=>{
 const list=await app.createList(user,{name:'Preview'});
 const input={csv:basic+'\nAvery,Example,Sample Co,avery@example.com,US,NY\nMorgan,Sample,Sample Co,invalid,US,NY',list_id:list.id};
 const preview=await app.importCSV(user,input,{preview:true});assert.equal(preview.added,1);assert.equal(preview.duplicates,1);assert.equal(preview.rejected,1);assert.equal(preview.rows[2].row,4);
 for(const table of ['prospect_contacts','prospect_imports','prospect_list_members'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
 const actual=await app.importCSV(user,input);for(const key of ['added','duplicates','conflicts','rejected'])assert.equal(actual[key],preview[key]);
 assert.equal((await app.lists(user)).lists[0].contacts,1);assert.equal((await app.importCSV(user,input)).replayed,true);
 assert.equal((await app.qualitySummary(other)).summary.contacts,0);
}));

test('preview rechecks identities when committing instead of trusting old counts',()=>fixture(async app=>{
 const preview=await app.importCSV(user,{csv:basic},{preview:true});assert.equal(preview.added,1);
 await app.importCSV(user,{csv:basic,source:'Concurrent import'});
 const committed=await app.importCSV(user,{csv:basic});assert.equal(committed.added,0);assert.equal(committed.duplicates,1);
}));

test('source history retains conflicts, field origin and original source observation date',()=>fixture(async(app,db)=>{
 const first=await app.importCSV(user,{csv:basic,source:'Older export',source_observed_at:'2020-01-01',source_url:'https://example.com/team'});
 await app.importCSV(user,{csv:basic.replace('Email,','Title,Email,').replace('Sample Co,avery','Sample Co,Director,avery'),source:'New export',source_observed_at:'2026-01-01'});
 await app.importCSV(user,{csv:basic.replace('Email,','Title,Email,').replace('Sample Co,avery','Sample Co,Manager,avery'),source:'Disagreeing export'});
 const record=(await app.search(user)).contacts[0];assert.equal(record.title,'Director');assert.equal(record.source,'Older export');assert.equal(record.source_observed_at,'2020-01-01');assert.equal(record.source_history.length,3);assert.deepEqual(record.source_history[2].differing_fields,['title']);assert.equal(record.field_sources.title.source,'New export');assert.equal(record.field_sources.email.source,'Older export');
 const summary=await app.qualitySummary(user);assert.equal(summary.sources.length,3);assert.equal(summary.summary.source_older_than_180_days,1);assert.equal(summary.summary.verified_emails,0);
 const url='https://example.com/api/prospect/imports/'+first.id;
 await assert.rejects(app.route(new Request(url),other),{status:404});assert.equal((await app.route(new Request(url),user)).result.added,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM prospect_imports')).rows[0].n,3);
}));

test('namesakes cannot acquire new identifiers through a weak match',()=>fixture(async app=>{
 await app.importCSV(user,{csv:'First Name,Last Name,Company\nAvery,Example,Sample Co'});
 const result=await app.importCSV(user,{csv:'First Name,Last Name,Company,Email\nAvery,Example,Sample Co,avery@example.com'});
 assert.equal(result.conflicts,1);assert.match(result.rows[0].message,/namesakes/);assert.equal((await app.search(user)).contacts[0].email,'');
}));

test('source metadata, physical rejection lines and ignored fields stay explicit',()=>fixture(async app=>{
 await assert.rejects(app.importCSV(user,null),{status:422});
 await assert.rejects(app.importCSV(user,{csv:basic,source_url:'javascript:alert(1)'}),{status:422});
 await assert.rejects(app.importCSV(user,{csv:basic,source_observed_at:'2026-02-30'}),{status:422});
 await assert.rejects(app.importCSV(user,{csv:basic,source_observed_at:'2999-01-01'}),{status:422});
 const result=await app.importCSV(user,{csv:'First Name,Last Name,Company,Email,Email Status\n\nAvery,Example,Sample Co,invalid,valid'});
 assert.equal(result.errors[0].row,3);assert.deepEqual(result.ignored_columns,['Email Status']);
}));
test('legacy US location spellings are searchable and do not duplicate a namesake record',()=>fixture(async(app,db)=>{
 await db.query('INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES($1,$2,$3::jsonb,$4::jsonb)',['legacy',user.uid,JSON.stringify({first_name:'Avery',last_name:'Example',company:'Sample Co',country:'United States',state:'New York',city:'',email:'',email_status:'missing'}),JSON.stringify(['person:avery|example|sample co|united states|new york|'])]);
 assert.equal((await app.search(user,{country:'US',state:'NY'})).total,1);
 const result=await app.importCSV(user,{csv:'First Name,Last Name,Company,Country,State\nAvery,Example,Sample Co,US,NY'});
 assert.equal(result.duplicates,1);assert.equal((await app.search(user)).total,1);
 assert.equal((await app.search(user,{country:'Russia'})).total,0);
}));
test('bulk import remains atomic when a later write batch fails',()=>fixture(async(app,db)=>{
 const list=await app.createList(user,{name:'Atomic import'});let writes=0;
 const query=(sql,values)=>{if(sql.startsWith('INSERT INTO prospect_contacts')&&++writes===2)throw Error('Injected storage failure');return db.query(sql,values);};
 const failing=createProspectWorkspace({pool:{query,connect:async()=>({query,release(){}})}});
 const csv='First Name,Last Name,Company,Email\n'+Array.from({length:125},(_,i)=>`Synthetic,Person${i},Fixture Co,fixture${i}@example.invalid`).join('\n');
 await assert.rejects(failing.importCSV(user,{csv,list_id:list.id}),/Injected storage failure/);
 for(const table of ['prospect_contacts','prospect_imports','prospect_list_members'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
 const result=await app.importCSV(user,{csv,list_id:list.id});assert.equal(result.added,125);assert.equal((await app.lists(user)).lists[0].contacts,125);
}));
