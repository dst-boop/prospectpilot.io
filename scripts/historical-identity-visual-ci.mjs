// Synthetic auth and disposable native PostgreSQL only. No production entrypoint.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createSyntheticStaging} from '../test/helpers/staging-app.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
const staging=await createSyntheticStaging({backend:'postgres'});
let browser;
try{
 const login=await staging.request('/auth/session',{method:'POST',body:{idToken:'synthetic-id-advisor'}});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const api=async(path,body,method=body?'POST':'GET')=>{const r=await staging.request(path,{cookie,method,...body?{body}:{}});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const holds=[];
 for(let n=1;n<=3;n++){
  const csv=`First Name,Last Name,Company,Email\nOriginal,Person${n},Previous Employer${n},former${n}@example.com`;
  const imported=await api('/api/prospect/import',{csv,source:'Synthetic original '+n});
  const id=imported.rows[0].contact_id;
  const before=(await api('/api/prospect/contacts/'+id)).contact;
  await api('/api/prospect/contacts/'+id,{fields:{first_name:'DELETED_PRIVATE_SENTINEL',company:'Deleted employer '+n,email:`deleted-private${n}@example.com`},reason:'Synthetic source correction',revision:before.edit_revision},'PATCH');
  await api('/api/prospect/contacts/'+id,undefined,'DELETE');
  const incoming=`First Name,Last Name,Company,Email\nIncoming,Person${n},Incoming Company${n},former${n}@example.com`;
  const held=await api('/api/prospect/import',{csv:incoming,source:'Synthetic incoming '+n});
  assert.equal(held.added,0);assert.equal(held.conflicts,1);holds.push(held.rows[0].historical_review_id);
 }
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const posts=[],external=[],errors=[];let releasePost=null,holdNextPost=false,onPost;const postReached=new Promise(resolve=>{onPost=resolve;});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!=='https://historical.test'){external.push(req.url());return route.abort();}
  if(url.pathname.startsWith('/api/lab/historical-identity-reviews/')&&req.method()==='POST'){
   posts.push({path:url.pathname,body:req.postDataJSON()});
   if(holdNextPost){holdNextPost=false;await new Promise(resolve=>{releasePost=resolve;onPost();});}
  }
  const response=await staging.request(url.pathname+url.search,{cookie,method:req.method(),...(req.postData()?{body:JSON.parse(req.postData())}:{})});
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('https://historical.test/lab#historicalReviews');
 await page.locator('#historicalControls').waitFor({state:'visible'});
 await page.locator('#historicalSelect').selectOption(holds[0]);
 assert.match(await page.locator('#historicalArrival').innerText(),/Incoming Person1/);
 assert.doesNotMatch(await page.locator('body').innerText(),/DELETED_PRIVATE_SENTINEL|deleted-private|Deleted employer/);
 await page.locator('#historicalSave').click();assert.equal(posts.length,0);
 assert.equal(await page.locator('#historicalReason').evaluate(e=>e===document.activeElement),true);
 await page.locator('#historicalReason').fill('Reviewed the synthetic source: a different person uses this address.');
 await page.locator('#historicalSave').focus();await page.keyboard.press('Enter');assert.equal(posts.length,0);
 assert.equal(await page.locator('#historicalDistinct').evaluate(e=>e===document.activeElement),true);
 await page.locator('#historicalDistinct').check();
 await page.screenshot({path:'/tmp/historical-desktop-review.png',fullPage:true});
 holdNextPost=true;await page.locator('#historicalSave').click();
 await page.waitForFunction(()=>document.getElementById('historicalSave').disabled);
 // Repeated programmatic button activation obeys the native disabled control.
 await page.locator('#historicalSave').evaluate(e=>{e.click();e.click();});
 await postReached;assert.equal(posts.length,1);assert.equal(posts[0].body.confirmed_distinct,true);
 assert.equal(await page.locator('#historicalSelect').isDisabled(),true);
 assert.ok(releasePost);releasePost();
 await page.waitForFunction(()=>document.getElementById('historicalStatus').textContent.startsWith('Saved as a different person.'));
 assert.equal((await api('/api/lab/historical-identity-reviews')).total,2);
 assert.equal(await page.locator('#historicalDistinct').isChecked(),false);
 assert.equal(await page.locator('#historicalReason').inputValue(),'');
 // Discard is independent of distinct-person consent and supports the keyboard.
 await page.locator('#historicalSelect').selectOption(holds[1]);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/historical-mobile-review.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'review panel mobile overflow');
 await page.locator('#historicalDiscard').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.getElementById('historicalStatus').textContent.startsWith('Incoming record discarded.'));
 assert.equal(posts.length,2);assert.deepEqual(posts[1].body,{decision:'discard',reason:''});
 // Simulate another tab resolving the remaining hold while this tab is stale.
 await page.locator('#historicalSelect').selectOption(holds[2]);
 await api('/api/lab/historical-identity-reviews/'+holds[2],{decision:'discard'});
 await page.locator('#historicalDiscard').click();
 await page.waitForFunction(()=>document.getElementById('historicalStatus').textContent.includes('already decided'));
 assert.equal(await page.locator('#historicalControls').isVisible(),false);
 assert.equal((await api('/api/lab/historical-identity-reviews')).total,0);
 // A held correction must show the exact proposed values and update, not duplicate.
 const live=await api('/api/prospect/import',{csv:'First Name,Last Name,Company,Email\nCurrent,Distinct,Live Company,live-current@example.com',source:'Synthetic live person'});
 const liveId=live.rows[0].contact_id,liveBefore=(await api('/api/prospect/contacts/'+liveId)).contact;
 const proposed=await api('/api/prospect/contacts/'+liveId,{fields:{email:'former3@example.com',title:'Reviewed incoming title'},reason:'Synthetic incoming source',revision:liveBefore.edit_revision},'PATCH');
 assert.equal(proposed.held_for_historical_review,true);
 const queued=await api('/api/lab/historical-identity-reviews');assert.equal(queued.total,1);
 assert.equal(queued.reviews[0].operation,'update_contact');
 await page.locator('#historicalReload').click();await page.locator('#historicalControls').waitFor({state:'visible'});
 assert.match(await page.locator('#historicalSave').innerText(),/apply changes to the existing contact/);
 assert.match(await page.locator('#historicalArrival').innerText(),/Existing live record to update/);
 assert.match(await page.locator('#historicalArrival').innerText(),/Current Distinct/);
 assert.match(await page.locator('#historicalArrival').innerText(),/live-current@example.com/);
 assert.match(await page.locator('#historicalArrival').innerText(),/Reviewed incoming title/);
 assert.match(await page.locator('#historicalArrival').innerText(),/former3@example.com/);
 assert.doesNotMatch(await page.locator('body').innerText(),/DELETED_PRIVATE_SENTINEL|deleted-private/);
 await page.locator('#historicalReason').fill('Synthetic source confirms the live contact is different from the deleted person.');
 await page.locator('#historicalDistinct').check();await page.screenshot({path:'/tmp/historical-mobile-update.png',fullPage:true});
 await page.locator('#historicalSave').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.getElementById('historicalStatus').textContent.startsWith('Reviewed changes applied'));
 const liveAfter=(await api('/api/prospect/contacts/'+liveId)).contact;assert.equal(liveAfter.email,'former3@example.com');assert.equal(liveAfter.title,'Reviewed incoming title');
 assert.equal((await api('/api/lab/historical-identity-reviews')).total,0);
 assert.deepEqual(staging.providerCalls,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('HISTORICAL_IDENTITY_BROWSER_PASS: disposable native PostgreSQL; incoming-only details; required reason/confirmation; keyboard save/discard; explicit update values; repeat lock; stale refresh; mobile overflow; zero providers. No real Firebase or production validation.');
}finally{await browser?.close();await staging.close();}
