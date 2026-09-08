import test from 'node:test';import assert from 'node:assert/strict';
import {createProspectProviders,professionalRecord} from '../prospect-providers.mjs';
const raw={id:'provider-id',first_name:'Jamie',last_name:'Rivera',job_company_name:'Example',work_email:'jamie@example.com',linkedin_url:'linkedin.com/in/jamie-example',phone_numbers:['+12125551234'],birth_date:'private',estimated_net_worth:1000000};
const contact={...professionalRecord(raw),suppressed:false};
test('provider pagination preserves opaque tokens longer than contact fields',async()=>{const token='opaque-'.repeat(100);const p=createProspectProviders({pdlKey:'key',fetcher:async(url,options)=>{assert.equal(JSON.parse(options.body).scroll_token,token);return Response.json({data:[],total:0,scroll_token:token});}});assert.equal((await p.search({company:'Example',scroll_token:token})).scroll_token,token);await assert.rejects(p.search({company:'Example',scroll_token:'x'.repeat(5001)}),{status:422});});
test('provider projection excludes financial and demographic data; no status is fabricated',()=>{const c=professionalRecord(raw);assert.equal(c.birth_date,undefined);assert.equal(c.estimated_net_worth,undefined);assert.equal(c.phone,'+12125551234');assert.equal(c.email_status,'unverified');});
test('provider search is bounded and key remains in the server request header',async()=>{let calls=0;const p=createProspectProviders({pdlKey:'test-key',fetcher:async(url,options)=>{calls++;assert.equal(options.headers['X-Api-Key'],'test-key');assert.ok(!String(url).includes('test-key'));const body=JSON.parse(options.body);assert.equal(body.size,10);assert.ok(!body.data_include.includes('birth'));return Response.json({data:[raw],total:1});}});assert.equal((await p.search({company:'Example'})).contacts.length,1);await assert.rejects(p.search({size:1000,company:'Example'}),{status:422});await assert.rejects(p.search({}),{status:422});assert.equal(calls,1);});
test('provider search expands US states and honors absence filters',async()=>{
 const p=createProspectProviders({pdlKey:'key',fetcher:async(url,options)=>{
  const query=JSON.parse(options.body).query.bool;
  assert.ok(query.must.some(item=>item.match?.location_region?.query==='new york'));
  assert.ok(query.must.some(item=>item.match?.location_country?.query==='united states'));
  assert.deepEqual(query.must_not,[{exists:{field:'work_email'}},{exists:{field:'phone_numbers'}}]);return Response.json({total:0,data:[]});
 }});await p.search({country:'US',state:'NY',has_email:'false',has_phone:'false'});
});
test('enrichment rejects conflicting identities and requires stable identifiers',async()=>{const p=createProspectProviders({pdlKey:'key',fetcher:async()=>Response.json({likelihood:10,data:{...raw,last_name:'Other'}})});assert.equal((await p.enrich(contact)).conflict,true);await assert.rejects(p.enrich({first_name:'Jamie',last_name:'Rivera',company:'Example'}),{status:422});await assert.rejects(p.enrich({...contact,suppressed:true}),{status:422});});
test('enrichment confidence must be a documented integer and match the supplied identity',async()=>{
 for(const likelihood of [undefined,null,'10','invalid',7,8.5,11]){
  const p=createProspectProviders({pdlKey:'key',fetcher:async()=>Response.json({likelihood,data:raw})});
  await assert.rejects(p.enrich(contact),{status:502});
 }
 const p=createProspectProviders({pdlKey:'key',fetcher:async()=>Response.json({likelihood:9,data:raw})});
 assert.equal((await p.enrich(contact)).match_likelihood,9);
});
test('provider rows use strict import validation and rejected rows are counted',async()=>{
 const p=createProspectProviders({pdlKey:'key',fetcher:async()=>Response.json({total:3,data:[raw,{...raw,work_email:'broken'},{...raw,first_name:'x'.repeat(201)}]})});
 const result=await p.search({company:'Example'});assert.equal(result.contacts.length,1);assert.equal(result.retrieved,3);assert.equal(result.rejected,2);
 assert.throws(()=>professionalRecord({...raw,linkedin_url:'https://example.com/person'}));
});
test('pending verifier payloads remain pending and disposable addresses never become valid',async()=>{
 for(const [data,expected] of [[{status:'pending'},'pending'],[{status:'valid',disposable:true},'invalid']]){
  const p=createProspectProviders({hunterKey:'key',fetcher:async()=>Response.json({data:{email:contact.email,...data}})});
  const result=await p.verifyEmail(contact);assert.ok(result.status===expected||result[expected]===true);
 }
});
test('verification preserves catch-all and pending states, handles suppression and hides secrets on failure',async()=>{
 for(const [response,expected] of [[Response.json({data:{email:contact.email,status:'valid',accept_all:true}}),'catch_all'],[new Response(null,{status:202}),'pending'],[new Response(null,{status:451}),'suppressed']]){const p=createProspectProviders({hunterKey:'secret',fetcher:async()=>response});const r=await p.verifyEmail(contact);assert.ok(r.status===expected||r[expected]===true);}
 const bad=createProspectProviders({hunterKey:'secret',fetcher:async()=>{throw Error('URL contains secret');}});await assert.rejects(bad.verifyEmail(contact),e=>!e.message.includes('secret')&&e.status===502);
 const mismatch=createProspectProviders({hunterKey:'secret',fetcher:async()=>Response.json({data:{email:'other@example.com',status:'valid'}})});await assert.rejects(mismatch.verifyEmail(contact),{status:502});
});
