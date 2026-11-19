// Browser regression for the real staging renderer, with local fictional storage and
// injected test authentication. This is NOT live Google, Cloud SQL or general egress proof.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {stagingConfig} from './staging-config.mjs';
import {createAuthenticatedStaging,fictionalCSV} from './staging-app.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
const output='/tmp/staging-ui-browser';mkdirSync(output,{recursive:true});
const now=Date.now(),project='prospectpilot-stg-261118';
const config=stagingConfig({STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-browser-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-browser-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_test',PGUSER:'prospectpilot_stg_test',PGPASSWORD:'synthetic-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic-public-key',appId:'synthetic-app'})});
const claims={uid:config.uid,aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
const db=new PGlite();
const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);
const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
let browser,page;const consoleErrors=[];
try{
 await migrate(pool);
 const auth={verifyIdToken:async()=>claims,verifySessionCookie:async()=>claims,createSessionCookie:async()=> 'synthetic-session'};
 const app=createAuthenticatedStaging({pool,config,auth,loginScript:'// no real authentication in this local browser fixture'});
 const request=(path,{method='GET',body}={})=>app(new Request(config.origin+path,{method,headers:{origin:config.origin,cookie:'__session=synthetic-session','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 const json=async(path,body)=>{const r=await request(path,{method:body?'POST':'GET',body});assert.equal(r.status,200,await r.clone().text());return r.json();};
 browser=await chromium.launch({headless:true,...process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),requests=[],external=[],errors=[],popups=[];
 // A synthetic clipboard proves app state only, not native clipboard permission.
 await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.syntheticClipboard=text;}}}));
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());requests.push({path:u.pathname,method:req.method()});
  if(u.origin!==config.origin){external.push(req.url());return route.abort();}
  if(u.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
  const response=await request(u.pathname+u.search,{method:req.method(),...(req.postData()?{body:JSON.parse(req.postData())}:{})});
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 page=await context.newPage();page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});page.on('pageerror',error=>errors.push(String(error)));page.on('popup',popup=>popups.push(popup));
 await page.goto(config.origin+'/prospect?import=1');
 await page.locator('#importDialog[open]').waitFor();
 await page.locator('#importInputMode').selectOption('paste');await page.locator('#csvText').fill(fictionalCSV);await page.locator('#source').fill('Fictional browser exercise');
 await page.locator('#previewImport').click();await page.waitForFunction(()=>document.querySelector('#importPreview').textContent.includes('Alex'));
 assert.equal((await json('/api/prospect/contacts')).total,0,'preview must not persist');
 await page.locator('#importForm button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#continueImport').hidden===false);
 const contacts=await json('/api/prospect/contacts');assert.equal(contacts.total,2);
 assert.ok(!requests.some(r=>/providers|\/jobs/.test(r.path)),'staging directory must not initialize disabled provider/jobs APIs');
 assert.equal(await page.locator('#providerSetup').isVisible(),false);
 await page.screenshot({path:output+'/contacts.png',fullPage:true});
 const handoff=await json('/api/lab/contact-import',{ids:[contacts.contacts.find(c=>c.first_name==='Alex').id]});
 const leadId=handoff.lead_ids[0],detail=await json('/api/lab/leads/'+leadId);
 for(const [field,value] of Object.entries({residence:{country:'US',scope:'residence',state:'NY'},planning_decision:{origin:'accepted_introduction',topic:'retirement_income',identity_confirmed:true,prospect_confirmed:true},contact:{channel:'email',address:'alex@example.test',identity_confirmed:true,outreach_basis:'person_requested'}}))await json('/api/lab/leads/'+leadId+'/review',{field,value,verdict:'confirmed',source:'Fictional browser fixture',note:'Synthetic evidence only',observed_at:new Date().toISOString(),identity_signature:detail.quality.identity_signature});
 await page.goto(config.origin+'/lab');await page.locator('#startNext').click();await page.locator('#detail[open]').waitFor();
 await page.evaluate(()=>document.querySelector('#prepareDetails').open=true);
 await page.locator('#draftPanel').waitFor({state:'visible'});
 assert.equal(await page.locator('#draftOutlook').evaluate(el=>String(el.onclick).includes('window.open')),true,'original Lab launch handler must be present');
 for(const id of ['draftOutlook','draftMailApp','draftLinkedIn']){
  assert.equal(await page.locator('#'+id).isVisible(),false,id);
  assert.equal(await page.locator('#'+id).isDisabled(),true,id);
 }
 await page.locator('#draftCopy').click();await page.waitForFunction(()=>Boolean(window.syntheticClipboard));
 assert.match(await page.evaluate(()=>window.syntheticClipboard),/Alex|retirement|conversation/i);
 await page.locator('#outcomeDetails > summary').click();await page.locator('#activityOutcome').selectOption('meeting_booked');
 await page.locator('#activityNext').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
 for(const id of ['inviteOutlook','inviteICS'])assert.equal(await page.locator('#'+id).isVisible(),false,id);
 // Mutation race: original app handlers are still installed. Synchronously re-show
 // and activate before the observer can repair attributes; capture must cancel first.
 const blocked=await page.evaluate(()=>{
  window.syntheticLaunchHandlers=0;window.syntheticWindowOpens=[];
  const originalOpen=window.open;window.open=(...args)=>{window.syntheticWindowOpens.push(args);return null;};
  const results=[];
  for(const id of ['draftOutlook','draftMailApp','draftLinkedIn','inviteOutlook','inviteICS']){
   const el=document.getElementById(id),original=el.onclick;
   el.onclick=function(e){window.syntheticLaunchHandlers++;return original.call(this,e);};
   el.hidden=false;el.disabled=false;el.removeAttribute('data-staging-unavailable');el.style.setProperty('display','block','important');
   const click=new MouseEvent('click',{bubbles:true,cancelable:true});el.dispatchEvent(click);
   const key=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});el.dispatchEvent(key);
   results.push({id,clickPrevented:click.defaultPrevented,keyPrevented:key.defaultPrevented});
  }
  window.open=originalOpen;return results;
 });
 assert.ok(blocked.every(x=>x.clickPrevented&&x.keyPrevented),JSON.stringify(blocked));
 assert.equal(await page.evaluate(()=>window.syntheticLaunchHandlers),0,'original handlers must not run');
 assert.deepEqual(await page.evaluate(()=>window.syntheticWindowOpens),[]);
 await page.waitForFunction(()=>document.querySelector('#draftOutlook').disabled&&document.querySelector('#draftOutlook').getAttribute('data-staging-unavailable')==='true');
 await page.evaluate(()=>{for(const id of ['draftOutlook','draftMailApp','draftLinkedIn','inviteOutlook','inviteICS'])document.getElementById(id).style.removeProperty('display');});
 for(const id of ['draftOutlook','draftMailApp','draftLinkedIn','inviteOutlook','inviteICS'])assert.equal(await page.locator('#'+id).isVisible(),false,id+' restored after mutation');
 // A dynamically inserted contact shortcut must also be unavailable.
 await page.evaluate(()=>{const a=document.createElement('a');a.id='syntheticExternal';a.href='mailto:alex@example.test';a.textContent='Email synthetic person';document.querySelector('#contactActions').append(a);});
 await page.waitForFunction(()=>document.querySelector('#syntheticExternal').getAttribute('aria-disabled')==='true');
 assert.equal(await page.locator('#syntheticExternal').isVisible(),false);
 assert.equal(await page.locator('#syntheticExternal').evaluate(el=>el.tabIndex),-1);
 await page.locator('#activityOutcome').selectOption('follow_up');await page.locator('#activityNote').fill('Fictional person requested a follow-up tomorrow.');await page.locator('#continueNext').uncheck();
 await page.screenshot({path:output+'/lab-desktop.png',fullPage:true});
 await page.locator('#saveActivity').click();await page.locator('#detail').waitFor({state:'hidden'});
 assert.equal((await json('/api/lab/leads/'+leadId)).lead.follow_up_status,'Follow-up');
 assert.equal(popups.length,0);assert.deepEqual(external,[]);
 assert.equal(await page.locator('#findProspects').isVisible(),false);await page.locator('#buildSearchPlan').focus();await page.keyboard.press('Enter');await page.waitForURL('**/audience');
 await page.locator('#location').fill('Long Island');await page.locator('#occupation').selectOption('office');await page.locator('#setupForm button[type=submit]').click();assert.match(await page.locator('#planSummary').textContent(),/Only one provider filter/);assert.match(await page.locator('#planSummary').textContent(),/office occupational preference does not filter/);assert.match(await page.locator('#planText').inputValue(),/Fictional practice plan only/);assert.doesNotMatch(await page.locator('#providerReview').textContent(),/Use the arrow beside Export/);await page.locator('#back').click();await page.locator('#audience').selectOption('local');await page.locator('#focus').fill('Partner');await page.locator('#employeeCount').fill('10–20');await page.locator('#setupForm button[type=submit]').click();
 const downloadReady=page.waitForEvent('download');await page.locator('#download').focus();await page.keyboard.press('Enter');
 const download=await downloadReady;await download.saveAs(output+'/audience-plan.txt');assert.match(readFileSync(output+'/audience-plan.txt','utf8'),/Partner/);assert.match(readFileSync(output+'/audience-plan.txt','utf8'),/10–20/);assert.match(readFileSync(output+'/audience-plan.txt','utf8'),/Fictional practice plan only/);assert.doesNotMatch(readFileSync(output+'/audience-plan.txt','utf8'),/Use Export’s arrow|Review actual results in ZoomInfo before exporting/);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/audience-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile audience overflow');
 assert.equal(popups.length,0);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[],'browser console errors, including CSP violations');
 console.log('PASS: actual staged assets in Chromium; fictional preview/import, local draft copy, dynamic outbound suppression, hidden keyboard targets, saved follow-up, keyboard audience navigation/download. Test auth/clipboard and local PGlite only; no live Google/Cloud SQL, OS mail-client or general outbound network-isolation proof.');
}catch(error){
 console.error('BROWSER_CONSOLE_ERRORS',JSON.stringify(consoleErrors));
 if(page)await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});
 throw error;
}finally{await browser?.close();await db.close();}
