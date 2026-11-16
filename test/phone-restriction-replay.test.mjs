import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {phoneReadiness} from '../prospect-data-quality.mjs';
test('synthetic sequential import must not export a DNC number under mobile fallback',async()=>{
 const db=new PGlite();try{
  for(const n of ['008-prospect-workspace','020-list-sharing','017-forget'])await db.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const app=createProspectWorkspace({pool}),user={uid:'synthetic-only'};
  const csv='First Name,Last Name,Company,Email,Direct Phone,Mobile Phone,Direct Phone Do Not Call,Mobile Phone Do Not Call\n';
  await app.importCSV(user,{source:'Synthetic mobile',csv:csv+'Synthetic,Example,Fixture Works,person@example.test,,2125550199,,false'});
  await app.importCSV(user,{source:'Synthetic direct DNC',csv:csv+'Synthetic,Example,Fixture Works,person@example.test,2125550199,2125550199,true,false'});
  const c=(await app.search(user)).contacts[0],output=await(await app.exportCSV(user,{ids:[c.id]})).text();
  console.log(JSON.stringify({origin:c.phone_origin,flags:c.phone_restrictions,readiness:phoneReadiness(c),restricted_number_exported:output.includes('+12125550199')}));
  assert.equal(output.includes('+12125550199'),false,'restricted same physical number must be omitted');
 }finally{await db.close();}
});

test('legacy mobile fallback with explicit same-number direct provenance respects direct DNC',()=>{
 const c={phone:'+12125550199',mobile_phone:'+12125550199',phone_origin:'mobile',country:'US',phone_import:{direct:{raw:'(212) 555-0199',status:'normalized'}},phone_restrictions:{direct:true,mobile:false}};
 assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
});

test('a distinct raw reference cannot safely bind a cumulative restriction on mobile fallback',()=>{
 for(const raw of ['2125550198','2125550198 ext 3']){
  const c={phone:'+12125550199',mobile_phone:'+12125550199',phone_origin:'mobile',country:'US',phone_import:{direct:{raw}},phone_restrictions:{direct:true,mobile:false}};
  assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);assert.equal(phoneReadiness(c).restriction_review,true);assert.equal(phoneReadiness(c).direct_do_not_call,true);
 }
});
test('unknown restricted direct linkage fails closed, including missing and pruned legacy provenance',()=>{
 for(const raw of [undefined,'unsupported','Call 2125550199']){
  const c={phone:'+12125550199',mobile_phone:'+12125550199',phone_origin:'mobile',country:'US',phone_import:{direct:{raw}},phone_restrictions:{direct:true,mobile:false},source_history:[]};
  assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);assert.equal(phoneReadiness(c).restriction_review,true);
 }
});
test('retained same-number DNC history still blocks when the latest direct field differs',()=>{
 const c={phone:'+12125550199',mobile_phone:'+12125550199',phone_origin:'mobile',country:'US',phone_import:{direct:{raw:'2125550198'}},phone_restrictions:{direct:true,mobile:false},source_history:[{phone_import:{direct:{raw:'2125550199'}},phone_restrictions:{direct:true}}]};
 assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
});

test('distinct direct and mobile routes retain their independent restrictions and unknowns',()=>{
 for(const direct of [true,false,null])for(const mobile of [true,false,null]){
  const c={phone:'+12125550198',mobile_phone:'+12125550199',phone_origin:'direct',phone_restrictions:{direct,mobile}};
  const actual=phoneReadiness(c);assert.equal(actual.primary_blocked,direct===true);assert.equal(actual.mobile_blocked,mobile===true);
  assert.equal(actual.direct_do_not_call,direct);assert.equal(actual.mobile_do_not_call,mobile);
 }
});

test('subsequent malformed imports cannot erase direct provenance or re-export a restricted physical number',async()=>{
 const db=new PGlite();try{
  for(const n of ['008-prospect-workspace','020-list-sharing','017-forget'])await db.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const app=createProspectWorkspace({pool}),user={uid:'synthetic-only'};
  const csv='First Name,Last Name,Company,Email,Direct Phone,Mobile Phone,Direct Phone Do Not Call,Mobile Phone Do Not Call\n';
  for(const [source,row] of [['Mobile','Synthetic,Example,Fixture Works,person@example.test,,2125550199,,false'],['Explicit direct','Synthetic,Example,Fixture Works,person@example.test,2125550199,2125550199,true,false'],['Malformed','Synthetic,Example,Fixture Works,person@example.test,Call 2125550199,2125550199,unknown,false']])await app.importCSV(user,{source,csv:csv+row});
  const c=(await app.search(user)).contacts[0];assert.equal(c.phone_origin,'direct');assert.equal(c.phone_restrictions.direct,true);
  assert.equal(c.phone_import.direct.status,'needs_review');assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
  assert.doesNotMatch(await(await app.exportCSV(user,{ids:[c.id]})).text(),/\+12125550199/);
  assert.equal(c.source_history[1].phone_import.direct.raw,'2125550199');
 }finally{await db.close();}
});

test('different incoming direct number stays a review conflict and cannot relabel mobile fallback',async()=>{
 const db=new PGlite();try{
  for(const n of ['008-prospect-workspace','020-list-sharing','017-forget'])await db.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const app=createProspectWorkspace({pool}),user={uid:'synthetic-only'};
  const csv='First Name,Last Name,Company,Email,Direct Phone,Mobile Phone,Direct Phone Do Not Call,Mobile Phone Do Not Call\n';
  await app.importCSV(user,{source:'Mobile',csv:csv+'Synthetic,Example,Fixture Works,person@example.test,,2125550199,,false'});
  const result=await app.importCSV(user,{source:'Different direct',csv:csv+'Synthetic,Example,Fixture Works,person@example.test,2125550198,2125550199,true,false'});
  const c=(await app.search(user)).contacts[0];assert.equal(c.phone_origin,'mobile');assert.equal(c.phone,'+12125550199');assert.equal(result.field_reviews,1);
  assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);assert.equal(phoneReadiness(c).restriction_review,true);
  assert.equal(c.source_history[1].proposed_values.phone,'+12125550198');
 }finally{await db.close();}
});

test('legacy accumulated DNC cannot use stale distinct raw to clear fallback after bounded history pruning',async()=>{
 const db=new PGlite();try{
  for(const n of ['008-prospect-workspace','020-list-sharing','017-forget'])await db.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  const app=createProspectWorkspace({pool}),user={uid:'synthetic-legacy'};
  const header='First Name,Last Name,Company,Email,Direct Phone,Mobile Phone,Direct Phone Do Not Call,Mobile Phone Do Not Call\n';
  const row=(direct,flag)=>`Synthetic,Legacy,Fixture Works,legacy@example.test,${direct},2125550199,${flag},false`;
  await app.importCSV(user,{source:'Legacy mobile',csv:header+row('','')});
  await app.importCSV(user,{source:'Legacy distinct direct',csv:header+row('2125550198','false')});
  await app.importCSV(user,{source:'Legacy same-number restricted direct',csv:header+row('2125550199','true')});
  // Simulate the deployed importer's only difference here: it did not promote mobile origin.
  // This is a synthetic legacy snapshot, not mutation of a real record.
  await db.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{phone_origin}','"mobile"') WHERE user_id=$1`,[user.uid]);
  for(let i=0;i<22;i++)await app.importCSV(user,{source:`Later legacy observation ${i}`,csv:header+row('','')});
  const c=(await app.search(user)).contacts[0];
  assert.equal(c.phone_origin,'mobile');assert.equal(c.phone_import.direct.raw,'2125550198');assert.equal(c.phone_restrictions.direct,true);
  assert.equal(c.source_history.some(e=>e.phone_restrictions?.direct===true&&e.phone_import?.direct?.raw==='2125550199'),false,'restricted same-number event has actually pruned');
  assert.equal(phoneReadiness(c).restriction_review,true);assert.equal(phoneReadiness(c).primary_blocked,true);assert.equal(phoneReadiness(c).mobile_blocked,true);
  assert.ok(c.quality.issues.some(i=>i.code==='phone_restriction_review'));
  assert.doesNotMatch(await(await app.exportCSV(user,{ids:[c.id]})).text(),/\+12125550199/);
 }finally{await db.close();}
});
