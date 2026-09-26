import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {normalizeContact,parseContactCSV,phoneReadiness,preparationStep} from '../prospect-data-quality.mjs';
const user={uid:'zoominfo-owner'},other={uid:'other'};
async function fixture(fn){const db=new PGlite();try{await db.exec(readFileSync(new URL('../migrations/008-prospect-workspace.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../migrations/017-forget.sql',import.meta.url),'utf8'));const app=createProspectWorkspace({pool:{query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})}});await fn(app,db);}finally{await db.close();}}
const header='First Name,Last Name,Company Name,ZoomInfo Contact ID,ZoomInfo Company ID,Contact Accuracy Score,Contact Accuracy Grade,Job Start Date,Valid Date,Last Updated Date,Direct Phone Number,Mobile phone,Direct Phone Do Not Call,Mobile Phone Do Not Call,Website,Previous Company Name';
const line='Avery,Example,Example Co,-12345,67890,91,A+,"June 01, 2024",2026-01-01,2026-02-01,2125550100 ext 3,2125550199,false,true,https://example.com,Former Co';
const input={csv:header+'\n'+line,format:'zoominfo'};
test('ZoomInfo import retains invalid phone, stable IDs, provider claims and independent route restrictions',()=>fixture(async(app)=>{
 const preview=await app.importCSV(user,input,{preview:true});assert.equal(preview.added,1);assert.equal(preview.rejected,0);assert.ok(preview.rows[0].issues.some(i=>i.code==='phone_review'));assert.equal((await app.search(user)).total,0);
 assert.equal((await app.importCSV(user,input)).added,1);let c=(await app.search(user)).contacts[0];
 assert.equal(c.zoominfo.contact_id,'-12345');assert.equal(c.zoominfo.company_id,'67890');assert.equal(c.zoominfo.accuracy_score,91);assert.equal(c.zoominfo.job_start_date,'2024-06-01');assert.equal(c.zoominfo.validated_at,'2026-01-01');assert.equal(c.zoominfo.updated_at,'2026-02-01');assert.equal(c.source_observed_at,null);assert.equal(c.company_domain,'example.com');
 assert.equal(c.phone_import.direct.raw,'2125550100 ext 3');assert.equal(c.phone_import.direct.status,'needs_review');assert.equal(c.mobile_phone,'+12125550199');assert.equal(c.phone_origin,'mobile');assert.equal(c.phone_status,'unverified');assert.equal(c.phone_restrictions.direct,false);assert.equal(c.phone_restrictions.mobile,true);assert.equal(c.source_history[0].zoominfo.accuracy_score,91);
 for(const filter of ['phone_review','do_not_call','job_change']){assert.equal((await app.search(user,{quality_issue:filter})).total,1);assert.equal((await app.search(other,{quality_issue:filter})).total,0);}
 const exported=parseContactCSV(await(await app.exportCSV(user,{ids:[c.id]})).text());const row=Object.fromEntries(exported.headers.map((h,i)=>[h,exported.records[0].cells[i]]));assert.equal(row.phone,'');assert.equal(row.mobile_phone,'');assert.equal(row.zoominfo_mobile_do_not_call,'true');assert.equal(row.zoominfo_accuracy_score,'91');assert.ok(!Object.values(row).includes('2125550100 ext 3'));
 await app.importCSV(user,{...input,source:'New export',csv:input.csv.replace(',false,true,',',false,false,').replace(',91,A+',',95,A+')});c=(await app.search(user)).contacts[0];assert.equal(c.phone_restrictions.mobile,true);assert.equal(c.zoominfo.accuracy_score,91);assert.equal(c.source_history.at(-1).zoominfo.accuracy_score,95);
 assert.equal((await app.importCSV(user,input)).replayed,true);
}));
test('bad phone fields retain the contact, but strict corrections still reject invalid numbers',()=>fixture(async app=>{
 const csv='First Name,Last Name,Company,Phone,Mobile phone,Country\nAna,Example,Sample,+442079460000,invalid,United Kingdom\nLee,Example,Sample,,,US';
 const r=await app.importCSV(user,{csv});assert.equal(r.added,2);assert.equal(r.rejected,0);
 const c=(await app.search(user,{q:'Ana'})).contacts[0];assert.equal(c.phone,'');assert.equal(c.mobile_phone,'');assert.equal(c.phone_import.direct.raw,'+442079460000');assert.equal(c.quality.next_review.code,'phone_review');
 const url='https://example.com/api/prospect/contacts/'+c.id;let detail=(await app.route(new Request(url),user)).contact;
 await assert.rejects(app.route(new Request(url,{method:'PATCH',body:JSON.stringify({fields:{phone:'broken'},reason:'Invalid test',revision:detail.edit_revision})}),user),{status:422});
 await app.route(new Request(url,{method:'PATCH',body:JSON.stringify({fields:{phone:'+12125550123',mobile_phone:'+12125550124'},reason:'Reviewed supplied business routes',revision:detail.edit_revision})}),user);
 detail=(await app.route(new Request(url),user)).contact;assert.equal(detail.phone_import.direct.status,'reviewed');assert.equal(detail.phone_import.direct.raw,'+442079460000');assert.equal(detail.source_history[0].phone_import.direct.status,'needs_review');assert.equal((await app.search(user,{quality_issue:'phone_review'})).total,0);
}));
test('invalid metadata is flagged without claiming a score, date or unrestricted route',()=>{
 const c=normalizeContact({'First Name':'A','Last Name':'Example','Company':'Sample','Contact Accuracy Score':'999','Valid Date':'February 30, 2025','Direct Phone Do Not Call':'maybe'},'fixture',{importing:true});assert.equal(c.zoominfo.accuracy_score,undefined);assert.equal(c.zoominfo.validated_at,undefined);assert.equal(c.phone_restrictions.direct,null);assert.equal(c.import_warnings.length,3);
});
test('same phone in both channels cannot bypass a direct restriction',()=>{
 const c={phone:'+12125550123',mobile_phone:'+12125550123',phone_restrictions:{direct:true,mobile:false}};assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
 assert.equal(preparationStep({...c,suppressed:true}).code,'suppressed');assert.equal(preparationStep({zoominfo:{previous_company:'Former'}}).code,'job_change');
});
test('an unsupported restricted direct number does not block a distinct unrestricted mobile fallback',()=>{
 const c=normalizeContact({'First Name':'Avery','Last Name':'Example','Company':'Example Co','Direct Phone Number':'2125550100 ext 3','Mobile Phone':'2125550199','Direct Phone Do Not Call':'true','Mobile Phone Do Not Call':'false'},'fixture',{importing:true});
 assert.equal(c.phone_origin,'mobile');assert.equal(phoneReadiness(c).primary_blocked,false);assert.equal(phoneReadiness(c).mobile_blocked,false);
});
test('first provider ID association cannot silently merge a weak namesake match',()=>fixture(async app=>{
 const csv='First Name,Last Name,Company\nAvery,Example,Example Co';await app.importCSV(user,{csv});
 const result=await app.importCSV(user,{csv:'First Name,Last Name,Company,ZoomInfo Contact ID\nAvery,Example,Example Co,12345'});
 assert.equal(result.conflicts,1);assert.equal((await app.search(user)).contacts[0].zoominfo.contact_id,undefined);
}));
test('ZoomInfo identity collisions are preserved for review and compact rows retain next-review conflicts',()=>fixture(async app=>{
 await app.importCSV(user,input);const result=await app.importCSV(user,{...input,csv:input.csv.replace('-12345','-99999')});assert.equal(result.conflicts,1);assert.equal((await app.search(user)).total,1);
 const named='First Name,Last Name,Company,Email,Title\nSam,Sample,Example,sam@example.com,Director';await app.importCSV(user,{csv:named});await app.importCSV(user,{csv:named.replace('Director','VP'),source:'Another source'});
 const compact=(await app.search(user,{q:'Sam',compact:'true'})).contacts[0];assert.equal(compact.source_history,undefined);assert.equal(compact.quality.next_review.code,'source_conflict');
}));
