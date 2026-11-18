// Browser-cookie/Origin regression only. No server, real identity or provider access.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {stagingConfig} from './staging-config.mjs';
import {createAuthenticatedStaging} from './staging-app.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
const output='/tmp/staging-logout-browser';mkdirSync(output,{recursive:true});
const now=Date.now(),project='prospectpilot-stg-261118',origin='https://prospectpilot-stg-browser-123.us-central1.run.app';
const config=stagingConfig({STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-browser-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:origin,PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_test',PGUSER:'prospectpilot_stg_test',PGPASSWORD:'synthetic-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic-public-key',appId:'synthetic-app'})});
const claims={uid:config.uid,aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
const db=new PGlite();const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);
const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
const verify=async(token)=>{assert.equal(token,'synthetic-session');return claims;};
let browser,page;const errors=[],outbound=[],posts=[];let failOnce=false;
try{
 await migrate(pool);
 const app=createAuthenticatedStaging({pool,config,auth:{verifyIdToken:verify,verifySessionCookie:verify,createSessionCookie:async()=> 'synthetic-session'},loginScript:'// synthetic test only'});
 // Explicit negative server requests; unlike the browser requests below these are constructed.
 for(const invalid of [undefined,'null','https://evil.example.test']){
  const headers={cookie:'__session=synthetic-session'};if(invalid!==undefined)headers.origin=invalid;
  const r=await app(new Request(origin+'/logout',{method:'POST',headers}));assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
 }
 browser=await chromium.launch({headless:true,...process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}});
 const context=await browser.newContext();
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin!==origin){outbound.push(req.url());return route.abort();}
  // Forward browser-generated headers verbatim. NEVER synthesize Origin or Cookie.
  const headers=await req.allHeaders();
  if(u.pathname==='/logout'&&req.method()==='POST'){
   posts.push({origin:headers.origin,cookie:headers.cookie});
   if(failOnce){failOnce=false;return route.fulfill({status:503,body:'Synthetic retry failure'});}
  }
  const response=await app(new Request(req.url(),{method:req.method(),headers,...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})}));
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const seed=()=>context.addCookies([{name:'__session',value:'synthetic-session',url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
 const loggedOut=async()=>{
  await page.waitForURL(origin+'/login?staging_signed_out=1');
  assert.equal((await context.cookies(origin)).some(c=>c.name==='__session'),false);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/prospect/me')).status),401);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/prospect/contacts')).status),401);
 };
 // Direct sign-out page, failed request must preserve session and offer retry.
 await seed();await page.goto(origin+'/logout');assert.equal(await page.locator('form').count(),0);
 failOnce=true;await page.locator('#stagingSignOut').click();
 await page.getByText('Sign-out could not be confirmed.',{exact:false}).waitFor();
 assert.equal((await context.cookies(origin)).some(c=>c.name==='__session'),true);
 assert.equal(await page.locator('#stagingSignOut').isEnabled(),true);
 await page.screenshot({path:output+'/retry.png'});
 await page.locator('#stagingSignOut').focus();await page.keyboard.press('Enter');await loggedOut();
 // Existing Contacts navigation must lead to the same secure flow.
 await seed();await page.goto(origin+'/prospect?import=1');
 await page.locator('#importDialog[open]').waitFor();
 await page.locator('#previewImport').click();
 await page.waitForFunction(()=>document.querySelector('#importResult').textContent.includes('fictional-staging.csv'));
 assert.doesNotMatch(await page.locator('#importResult').textContent(),/ZoomInfo/i);
 await page.locator('#csvFile').setInputFiles({name:'fictional-invalid.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic invalid extension')});
 await page.waitForFunction(()=>document.querySelector('#importResult').textContent.includes('Real provider exports are not accepted'));
 assert.match(await page.locator('#importResult').textContent(),/fictional-staging\.csv/);
 assert.doesNotMatch(await page.locator('#importResult').textContent(),/ZoomInfo/i);
 assert.doesNotMatch(await page.locator('#importDialog').textContent(),/ZoomInfo IDs, scores, dates/);
 await page.screenshot({path:output+'/fictional-import-error.png'});
 await page.locator('[data-close="importDialog"]').click();
 await page.locator('.workspace-menu > summary').click();
 await page.locator('a[href="/logout"]').click();await page.waitForURL(origin+'/logout');
 await page.locator('#stagingSignOut').click();await loggedOut();
 assert.equal(posts.length,3);for(const p of posts){assert.equal(p.origin,origin);assert.match(p.cookie||'',/__session=synthetic-session/);}
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 await page.screenshot({path:output+'/signed-out.png'});
 console.log('PASS: actual Chromium Origin + Cookie forwarding; browser Set-Cookie deletion; direct and Contacts sign-out; retry preserves session; post-logout protected APIs 401. Synthetic auth/PGlite only, no real Google or deployed proxy proof.');
}catch(error){if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();await db.close();}
