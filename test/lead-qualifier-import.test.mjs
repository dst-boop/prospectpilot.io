import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';

// Lead Qualifier's "Move to ProspectPilot" export (dst-boop/lead-qualifier,
// tests/topp-test.js pins the same headers). The move needs no importer of its
// own, so this pins the contract: the file LQ writes lands here intact.
const csv=['First Name,Last Name,Company,Title,Email,Direct Phone,Mobile Phone,LinkedIn URL,City,State,Country,Management Level,Suppressed,ZoomInfo Contact ID,Contact Accuracy Score,Job Start Date,Direct Phone Do Not Call,Mobile Phone Do Not Call',
 'Ada,Zeta,Boeing,CFO,ada@boeing.com,(206) 555-0100,(206) 555-0101,https://www.linkedin.com/in/ada-zeta,Seattle,WA,US,C Level Exec,no,12345,95,2004-03-01,false,true',
 'Bea,"Young, Jr.",Acme,"VP ""Ops""",b@acme.com,,,,,NY,US,,yes,,,,,'].join('\r\n');

test('a Lead Qualifier export imports with every column mapped, flags and suppression intact',async()=>{
 const db=new PGlite();try{
  for(const f of ['008-prospect-workspace','017-forget'])await db.exec(readFileSync(new URL(`../migrations/${f}.sql`,import.meta.url),'utf8'));
  const app=createProspectWorkspace({pool:{query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})}});
  const user={uid:'u',email:'u@example.com'};
  const result=await app.importCSV(user,{csv,source:'Lead Qualifier'});
  assert.equal(result.added,2,JSON.stringify(result.errors));
  assert.deepEqual(result.ignored_columns,[],'no Lead Qualifier column is dropped on the floor');
  const rows=Object.fromEntries((await db.query('SELECT payload FROM prospect_contacts')).rows.map(r=>[r.payload.first_name,r.payload]));
  const a=rows.Ada,b=rows.Bea;
  assert.equal(a.phone,'+12065550100');assert.equal(a.mobile_phone,'+12065550101');
  assert.equal(a.linkedin_url,'https://www.linkedin.com/in/ada-zeta');
  assert.equal(a.seniority,'C Level Exec');
  assert.equal(a.zoominfo.contact_id,'12345');
  assert.deepEqual(a.phone_restrictions,{direct:false,mobile:true},'the mobile do-not-call flag survives the move');
  assert.equal(a.suppressed,false);assert.equal(a.email_status,'unverified','no verification is inherited');
  assert.equal(b.last_name,'Young, Jr.');assert.equal(b.title,'VP "Ops"');
  assert.equal(b.suppressed,true,'Not Interested arrives suppressed');
 }finally{await db.close();}
});
