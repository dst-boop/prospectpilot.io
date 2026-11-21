import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as model from '../audience-catalog.mjs';
import {stagingAudienceScript,stagingPage,blockedStagingControls} from '../scripts/staging-ui.mjs';
import {stagingConfig} from '../scripts/staging-config.mjs';
import {createAuthenticatedStaging} from '../scripts/staging-app.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const now=Date.now(),project='prospectpilot-stg-synthetic';
function fixture(){
 const config=stagingConfig({STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-first-use',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-test-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_test',PGUSER:'prospectpilot_stg_test',PGPASSWORD:'synthetic',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic',appId:'synthetic'})});
 const claims={uid:config.uid,email:'synthetic@example.test',aud:project,iss:'https://securetoken.google.com/'+project,email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
 const app=createAuthenticatedStaging({pool:{query:()=>{throw Error('Asset route must not query database');}},config,auth:{verifySessionCookie:async()=>claims,verifyIdToken:async()=>claims,createSessionCookie:async()=> 'synthetic'},loginScript:'// synthetic only'});
 return path=>app(new Request(config.origin+path,{headers:{cookie:'__session=synthetic',origin:config.origin}}));
}
test('actual authenticated staging handler serves fixture-only first-use pages and script',async()=>{
 const request=fixture();
 const response=await request('/audience');assert.equal(response.status,200);const html=await response.text();
 assert.match(html,/id="planNext"><strong>Next: preview a supplied unchanged fictional CSV/);
 assert.doesNotMatch(html,/Next: open your own ZoomInfo|In Advanced Search, choose Contacts|Use the arrow beside Export|After your ZoomInfo review|Use a range your ZoomInfo account offers/);
 assert.doesNotMatch(html,/Long Island/);assert.match(html,/id="roleFamily"/);assert.match(html,/City and state, or ZIP plus radius/);
 assert.match(html,/Preview first; nothing is saved until you choose Import contacts/);
 const script=await (await request('/audience-client.js')).text();
 assert.equal(script,stagingAudienceScript(read('audience-client.js')));
 assert.doesNotMatch(script,/Next: use it in ZoomInfo|Enter individual values in matching filters|Paste only if the matching field/);
 const lab=await (await request('/lab')).text();assert.match(lab,/id="buildSearchPlan"/);assert.doesNotMatch(lab,/Long Island|Huntington, NY|11747/);assert.ok(blockedStagingControls.includes('findProspects'));
 const contact=await (await request('/prospect')).text();assert.match(contact,/Only the supplied, unchanged fictional CSV fixtures are accepted/);assert.match(contact,/Preview does not save contacts/);
});
test('served script displays, copies and downloads the same safe fictional plan, preserving groups',async()=>{
 const source=await (await fixture()('/audience-client.js')).text();
 const els=new Map(),copies=[],blobs=[];const get=id=>{if(!els.has(id))els.set(id,{value:id==='audience'?'workplace':'',textContent:'',innerHTML:'',focus(){},select(){}});return els.get(id);};
 const document={getElementById:get,body:{dataset:{fictionalExercise:'true'},appendChild(){}},createElement:()=>({click(){},remove(){}})};
 vm.runInNewContext(source.replace(/^import[^\n]+\n/,''),{...model,document,navigator:{clipboard:{writeText:async v=>copies.push(v)}},URL:{createObjectURL:b=>{blobs.push(b);return 'blob:synthetic';},revokeObjectURL(){}},Blob,Date,setTimeout:fn=>fn()});
 get('occupation').value='office';get('occupation').onchange();get('roleFamily').value='accounting';get('focus').value='Fictional role';get('location').value='Fictional area';get('setupForm').onsubmit({preventDefault(){}});
 assert.match(get('planOutcome').textContent,/No search was run and no contacts were saved/);assert.match(get('stepLabel').textContent,/unchanged fictional CSV/);
 const displayed=get('planText').value;assert.match(displayed,/Accounting/);assert.match(displayed,/Fictional area/);await get('copy').onclick();get('download').onclick();assert.equal(copies[0],displayed);assert.equal(await blobs[0].text(),displayed);
 assert.match(displayed,/supplied unchanged fictional CSV/);assert.doesNotMatch(displayed,/Next: in your own|enter each proposed|Export’s arrow|Search documentation|Export documentation/);
 assert.match(get('copyStatus').textContent,/no contacts were exported or searches run/);
});
test('adapter refuses changed first-use source instead of silently retaining live instructions',()=>{
 assert.throws(()=>stagingAudienceScript(read('audience-client.js').replace('Plan built · Next: use it in ZoomInfo','changed')),/needs review/);
 assert.throws(()=>stagingPage(read('audience.html').replace('Next: open your own ZoomInfo account and try the filters below.','changed')),/needs review/);
});
test('local professionals compare one plan across screen, copy and download without a real search',async()=>{
 const request=fixture(),html=await (await request('/audience')).text(),source=await (await request('/audience-client.js')).text();
 assert.match(html,/id="optionalIndustryFields"/);
 const els=new Map(),copies=[],blobs=[];const get=id=>{if(!els.has(id))els.set(id,{value:id==='audience'?'workplace':'',textContent:'',innerHTML:'',focus(){},select(){}});return els.get(id);};
 const document={getElementById:get,body:{dataset:{fictionalExercise:'true'},appendChild(){}},createElement:()=>({click(){},remove(){}})};
 vm.runInNewContext(source.replace(/^import[^\n]+\n/,''),{...model,document,navigator:{clipboard:{writeText:async v=>copies.push(v)}},URL:{createObjectURL:b=>{blobs.push(b);return 'blob:synthetic';},revokeObjectURL(){}},Blob,Date,setTimeout:fn=>fn()});
 get('audience').value='local';get('audience').onchange();assert.equal(get('optionalIndustryFields').hidden,false);
 get('focus').value='Partner';get('industry').value='Offices of Lawyers';get('employeeCount').value='10–20';get('location').value='Austin, TX';
 const submit=()=>get('setupForm').onsubmit({preventDefault(){}});submit();
 const plan=get('planText').value,screen=get('filterList').innerHTML;
 for(const match of [/Country, State, or City \/ Radius Around Postal Code[^\n]*Austin, TX/,/Job Title: Partner/,/Company Industry: Offices of Lawyers/,/Employee Count: 10–20/])assert.match(plan,match);
 for(const value of ['Austin, TX','Partner','Offices of Lawyers','10–20'])assert.ok(screen.includes(value));
 assert.doesNotMatch(plan,/Long Island|Location of:|Management Level|Next: in your own|Export’s arrow/);
 await get('copy').onclick();get('download').onclick();assert.equal(copies[0],plan);assert.equal(await blobs[0].text(),plan);
 get('back').onclick();assert.equal(get('industry').value,'Offices of Lawyers');
 for(const area of ['', '02108 + 25 miles']){
  get('location').value=area;submit();
  const next=get('planText').value,rendered=get('filterList').innerHTML;
  assert.doesNotMatch(next,/Long Island|Austin, TX/);
  if(area){assert.ok(next.includes(area));assert.ok(rendered.includes(area));}
  else {assert.doesNotMatch(next,/Locations →|Radius Around Postal Code/);assert.doesNotMatch(rendered,/Locations →/);}
  await get('copy').onclick();get('download').onclick();assert.equal(copies.at(-1),next);assert.equal(await blobs.at(-1).text(),next);
  get('back').onclick();assert.equal(get('location').value,area);
 }
 get('audience').value='employer';get('audience').onchange();assert.equal(get('optionalIndustryFields').hidden,true);assert.equal(get('industry').value,'');
});
