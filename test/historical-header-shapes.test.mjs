// Historical workbook HEADERS only, verified 2026-11-17. All values below are invented.
// No original prospect rows, provider requests, plan balances or contact permissions.
import test,{before,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {normalizeContact,parseContactCSV,phoneReadiness} from '../prospect-data-quality.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
before(()=>mock.method(globalThis,'fetch',async()=>{throw Error('Synthetic fixtures forbid network access');}));
after(()=>mock.restoreAll());
const general=['Full Name','Title','Company','Location','State','City','LinkedIn URL','401(k) Rollover Signal'];
const execHeaders=['First Name','Last Name','Job Title','Management Level','Company Name','Country','Email Address','Mobile Phone','Direct Phone Number','Job Start Date','First Work Year','Number of Companies','LinkedIn Contact Profile URL','ZoomInfo Contact ID','Has Email','Has Mobile Phone','Mobile Phone Do Not Call','Direct Phone Do Not Call'];
const base={'First Name':'Synthetic','Last Name':'Example','Job Title':'Coordinator','Management Level':'Individual Contributor','Company Name':'Small Fixture Business','Country':'US','Email Address':'synthetic@example.test','Mobile Phone':'2125550199','Direct Phone Number':'2125550198','Job Start Date':'2024-06-01','First Work Year':'2001','Number of Companies':'3','LinkedIn Contact Profile URL':'https://www.linkedin.com/in/synthetic-fixture-person','ZoomInfo Contact ID':'999000111','Has Email':'true','Has Mobile Phone':'true'};
const csv=(headers,rows)=>[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
async function fixture(fn){const db=new PGlite();try{for(const name of ['008-prospect-workspace','020-list-sharing','017-forget','034-historical-identities'])await db.exec(readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8'));const app=createProspectWorkspace({pool:{query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})}});await fn(app);}finally{await db.close();}}
const user={uid:'synthetic-historical-headers'};
test('general historical full-name shape is explicitly rejected, not guessed or silently split',()=>{
 const input=csv(general,[{'Full Name':'Synthetic Example',Title:'Coordinator',Company:'Small Fixture Business',Location:'Fictional locality',State:'NY',City:'Exampleville','LinkedIn URL':'https://www.linkedin.com/in/synthetic-fixture-person','401(k) Rollover Signal':'Former employer might imply an old workplace plan; unverified inference'}]);
 assert.throws(()=>parseContactCSV(input),{status:422,message:'Full Name needs review: add separately reviewed First Name and Last Name columns; names are not split automatically.'});
});
test('manual separate-name adaptation does not promote rollover inference or missing DNC to evidence',()=>{
 const headers=['First Name','Last Name',...general.filter(h=>h!=='Full Name')];
 const row={'First Name':'Synthetic','Last Name':'Example',Title:'Coordinator',Company:'Small Fixture Business',Location:'Exampleville, NY',State:'NY',City:'Exampleville','401(k) Rollover Signal':'Possible old workplace plan: unverified'};
 const parsed=parseContactCSV(csv(headers,[row]));assert.deepEqual(parsed.ignored_columns,[]);
 const c=normalizeContact(row,'Synthetic header fixture',{importing:true});assert.equal(c.phone,'');assert.equal(c.mobile_phone,'');assert.deepEqual(c.phone_restrictions,{direct:null,mobile:null});assert.equal(c.signal,undefined);assert.equal(c.phone_status,'missing');assert.deepEqual(c.imported_notes,[{kind:'location',text:'Exampleville, NY',status:'unverified'},{kind:'rollover_context',text:'Possible old workplace plan: unverified',status:'unverified'}]);
});
test('executive historical shape maps supported fields but explicitly lists four ignored enrichment columns',()=>{
 const parsed=parseContactCSV(csv(execHeaders,[base]));assert.deepEqual(parsed.ignored_columns,['First Work Year','Number of Companies','Has Email','Has Mobile Phone']);
 const c=normalizeContact(base,'Synthetic header fixture',{importing:true});assert.equal(c.title,'Coordinator');assert.equal(c.seniority,'Individual Contributor');assert.equal(c.zoominfo.contact_id,'999000111');assert.equal(c.zoominfo.job_start_date,'2024-06-01');assert.equal(c.email_status,'unverified');assert.equal(c.phone_status,'unverified');assert.deepEqual(c.phone_restrictions,{direct:null,mobile:null});
 const missing=normalizeContact({...base,'Email Address':'','Mobile Phone':'','Direct Phone Number':''},'Synthetic flags-only fixture',{importing:true});assert.equal(missing.email,'');assert.equal(missing.phone,'');assert.equal(missing.email_status,'missing');assert.equal(missing.phone_status,'missing');
});
test('exact executive headers preserve blank/unknown and independent direct/mobile DNC through actual import/export',()=>fixture(async app=>{
 for(const [i,d] of ['', 'false', 'true','unknown'].entries())for(const [j,m] of ['', 'false', 'true','unknown'].entries()){
  const row={...base,'Last Name':`Example${'ABCD'[i]}${'ABCD'[j]}`,'Email Address':`synthetic-${i}-${j}@example.test`,'ZoomInfo Contact ID':String(999000000+i*10+j),'LinkedIn Contact Profile URL':`https://www.linkedin.com/in/synthetic-fixture-${i}-${j}`,'Mobile Phone Do Not Call':m,'Direct Phone Do Not Call':d};
  const result=await app.importCSV(user,{source:`Synthetic matrix ${i}-${j}`,csv:csv(execHeaders,[row])});assert.equal(result.added,1);
  const c=(await app.search(user,{q:row['Email Address']})).contacts[0];
  assert.deepEqual(c.phone_restrictions,{direct:d==='true'?true:d==='false'?false:null,mobile:m==='true'?true:m==='false'?false:null});
  const output=await(await app.exportCSV(user,{ids:[c.id]})).text();assert.equal(output.includes('+12125550198'),d!=='true');assert.equal(output.includes('+12125550199'),m!=='true');assert.equal(c.phone_status,'unverified');
 }
}));
test('exact executive headers cannot replay mobile fallback into a callable DNC number',()=>fixture(async app=>{
 await app.importCSV(user,{source:'Synthetic mobile-only',csv:csv(execHeaders,[{...base,'Direct Phone Number':'','Mobile Phone Do Not Call':'false','Direct Phone Do Not Call':''}])});
 await app.importCSV(user,{source:'Synthetic same-number direct restricted',csv:csv(execHeaders,[{...base,'Direct Phone Number':'2125550199','Mobile Phone Do Not Call':'false','Direct Phone Do Not Call':'true'}])});
 const c=(await app.search(user)).contacts[0];assert.equal(c.phone_restrictions.direct,true);assert.equal(c.phone_restrictions.mobile,false);
 const exported=await(await app.exportCSV(user,{ids:[c.id]})).text();assert.doesNotMatch(exported,/\+12125550199/);assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
}));

test('reviewed names retain original full name and source-attributed unverified context without guessed location',()=>fixture(async app=>{
 const headers=['First Name','Last Name',...general];
 const row={'First Name':'Synthetic','Last Name':'Example','Full Name':'Synthetic Example, Jr.',Title:'Coordinator',Company:'Small Fixture Business',Location:'Anywhere Metro Area','401(k) Rollover Signal':'An old job might mean a plan. Synthetic unverified suggestion.'};
 const preview=await app.importCSV(user,{source:'Synthetic legacy workbook',csv:csv(headers,[row])},{preview:true});assert.equal(preview.added,1);assert.equal((await app.search(user)).total,0);
 await app.importCSV(user,{source:'Synthetic legacy workbook',csv:csv(headers,[row])});
 const c=(await app.search(user)).contacts[0];assert.equal(c.first_name,'Synthetic');assert.equal(c.last_name,'Example');assert.equal(c.city,'');assert.equal(c.state,'');assert.equal(c.country,'');assert.equal(c.deliveries,undefined);
 assert.equal(c.imported_notes[0].text,'Synthetic Example, Jr.');assert.equal(c.imported_notes[2].status,'unverified');assert.equal(c.source_history[0].source,'Synthetic legacy workbook');assert.deepEqual(c.source_history[0].imported_notes,c.imported_notes);assert.ok(c.quality.issues.some(i=>i.code==='unverified_import_note'));
 await app.importCSV(user,{source:'Synthetic second observation',csv:csv(headers,[{...row,'401(k) Rollover Signal':'A different unverified claim.'}])});
 const updated=(await app.search(user)).contacts[0];assert.equal(updated.imported_notes[2].text,row['401(k) Rollover Signal']);assert.equal(updated.source_history.at(-1).imported_notes[2].text,'A different unverified claim.');assert.deepEqual(updated.phone_restrictions,{direct:null,mobile:null});
}));
test('ambiguous names and oversized imported context fail explicitly without partial acceptance',()=>{
 for(const name of ['Synthetic','Example, Synthetic','Synthetic van Example','Synthetic Example Jr.'])assert.throws(()=>normalizeContact({'Full Name':name},'Synthetic',{importing:true}),{status:422});
 assert.throws(()=>normalizeContact({...base,'401(k) Rollover Signal':'x'.repeat(1001)},'Synthetic',{importing:true}),{status:422});
 assert.throws(()=>normalizeContact({...base,'Location':'bad\u0001context'},'Synthetic',{importing:true}),{status:422});
});

test('later note kinds are retained with their own provenance even after routine history pruning',()=>fixture(async app=>{
 const headers=[...execHeaders,'Full Name','401(k) Rollover Signal'];
 await app.importCSV(user,{source:'Synthetic first name context',csv:csv(headers,[{...base,'Full Name':'Synthetic Example'}])});
 await app.importCSV(user,{source:'Synthetic later rollover context',csv:csv(headers,[{...base,'401(k) Rollover Signal':'Unverified old workplace suggestion'}])});
 for(let i=0;i<22;i++)await app.importCSV(user,{source:`Synthetic routine ${i}`,csv:csv(execHeaders,[base])});
 const c=(await app.search(user)).contacts[0],note=c.imported_notes.find(n=>n.kind==='rollover_context');assert.equal(note.source,'Synthetic later rollover context');assert.equal(note.row,2);assert.ok(note.import_id);assert.ok(note.imported_at);assert.equal(note.observed_at,null);assert.equal(note.status,'unverified');assert.ok(c.quality.issues.some(i=>i.code==='unverified_import_note'));assert.equal(c.source_history.some(e=>e.source==='Synthetic later rollover context'),false);
}));
