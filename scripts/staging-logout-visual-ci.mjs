// Browser-cookie/Origin regression on ephemeral loopback HTTPS only. No real identity/provider access.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../migrate.mjs';
import {stagingConfig} from './staging-config.mjs';
import {createAuthenticatedStaging} from './staging-app.mjs';
import {largeFictionalCSV,largeFixtureRows} from './staging-fixtures.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
const output='/tmp/staging-logout-browser';mkdirSync(output,{recursive:true});
const now=Date.now(),project='prospectpilot-stg-261118',origin='https://prospectpilot-stg-browser-123.us-central1.run.app';
const config=stagingConfig({STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-browser-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:origin,PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_test',PGUSER:'prospectpilot_stg_test',PGPASSWORD:'synthetic-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic-public-key',appId:'synthetic-app'})});
const claims={uid:config.uid,aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
const db=new PGlite();const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);
const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
const verify=async(token)=>{assert.equal(token,'synthetic-session');return claims;};
let browser,page,server,certDir;const errors=[],outbound=[],posts=[],trace=[],consoleErrors=[];let failOnce=false;
try{
 await migrate(pool);
 const app=createAuthenticatedStaging({pool,config,auth:{verifyIdToken:verify,verifySessionCookie:verify,createSessionCookie:async()=> 'synthetic-session'},loginScript:'// synthetic test only'});
 // Explicit negative server requests; unlike the browser requests below these are constructed.
 for(const invalid of [undefined,'null','https://evil.example.test']){
  const headers={cookie:'__session=synthetic-session'};if(invalid!==undefined)headers.origin=invalid;
  const r=await app(new Request(origin+'/logout',{method:'POST',headers}));assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
 }
 // Real loopback transport preserves browser redirects and Set-Cookie semantics.
 // Route.fulfill cannot faithfully intercept every request in a redirected chain.
 certDir=mkdtempSync(join(tmpdir(),'pp-synthetic-tls-'));
 const key=join(certDir,'key.pem'),cert=join(certDir,'cert.pem'),hostname=new URL(origin).hostname;
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN='+hostname,'-addext','subjectAltName=DNS:'+hostname],{stdio:'ignore',timeout:15000});
 server=createServer({key:readFileSync(key),cert:readFileSync(cert)},async(req,res)=>{
  try{
   if(req.headers.host!==hostname){res.writeHead(403);return res.end('Synthetic host rejected');}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const u=new URL(req.url,origin),headers=req.headers;
   if(u.pathname==='/logout'&&req.method==='POST'){
    posts.push({origin:headers.origin,cookie:headers.cookie});
    if(failOnce){failOnce=false;res.writeHead(503);return res.end('Synthetic retry failure');}
   }
   const response=await app(new Request(u,{method:req.method,headers,...(body.length?{body}:{})}));
   trace.push({path:u.pathname,method:req.method,origin:headers.origin||null,hasCookie:!!headers.cookie,status:response.status,location:response.headers.get('location'),setsCookie:response.headers.has('set-cookie')});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){errors.push(error.message);res.writeHead(500);res.end('Synthetic server error');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 assert.equal(server.address().address,'127.0.0.1');
 browser=await chromium.launch({headless:true,args:['--no-proxy-server',`--host-resolver-rules=MAP ${hostname} 127.0.0.1:${server.address().port}, MAP * ~NOTFOUND`],...process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}});
 // Certificate exemption is confined to this disposable synthetic browser context.
 const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  if(new URL(route.request().url()).origin!==origin){outbound.push(route.request().url());return route.abort();}
  return route.continue(); // No Origin/Cookie/request rewriting or response simulation.
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
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
 // Real file download -> upload, not an API-only or paste-only substitute.
 await page.locator('#importInputMode').selectOption('paste');
 await page.locator('#csvTextLabel').waitFor({state:'visible'});
 assert.match(await page.locator('#stagingFixtureOnly').textContent(),/unchanged fictional CSV fixtures/);
 await page.locator('#importInputMode').selectOption('file');
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#importForm a[href="/staging-fixture-large.csv"]').click();
 const download=await downloadPromise,downloadBytes=readFileSync(await download.path());
 assert.equal(download.suggestedFilename(),'fictional-staging-large.csv');
 assert.equal(downloadBytes.toString('utf8'),largeFictionalCSV);
 await page.locator('#csvFile').setInputFiles({name:download.suggestedFilename(),mimeType:'text/csv',buffer:downloadBytes});
 await page.waitForFunction(()=>document.querySelector('#importResult').textContent.includes('Preview — nothing saved.')&&document.querySelector('#importResult').textContent.includes('1000 new'));
 assert.equal(await page.locator('#importPreview a[href="/lab#historicalReviews"]').count(),0,'ordinary preview must not send users to an unrelated review queue');
 await page.locator('#importForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#continueImport').hidden===false);
 assert.equal(await page.evaluate(async()=> (await (await fetch('/api/prospect/contacts')).json()).total),largeFixtureRows);
 await page.locator('#importForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#importResult').textContent.includes('already processed'));
 assert.equal(await page.evaluate(async()=> (await (await fetch('/api/prospect/contacts')).json()).total),largeFixtureRows);
 // Navigation-only synthetic hold: execute the shipped notice renderer, not a
 // fake backend decision. Real import/replay above stays unchanged.
 assert.equal(await page.locator('#importPreview a[href="/lab#historicalReviews"]').count(),0);
 const clientSource=readFileSync(new URL('../prospect-client.js',import.meta.url),'utf8');
 const noticeSource=clientSource.slice(clientSource.indexOf('function historicalImportNotice('),clientSource.indexOf('function renderImportReport('));
 const importState=()=>page.evaluate(()=>({url:location.href,open:document.querySelector('#importDialog').open,file:document.querySelector('#csvFile').files[0]?.name,size:document.querySelector('#csvFile').files[0]?.size,list:document.querySelector('#importList').value,source:document.querySelector('#source').value,result:document.querySelector('#importResult').textContent}));
 const beforeReview=await importState();
 await page.evaluate(noticeSource+"\ndocument.querySelector('#importPreview').insertAdjacentHTML('afterbegin',historicalImportNotice({rows:[{status:'identity_review',historical_review_id:'synthetic-navigation-only'}]}));");
 const reviewOpened=context.waitForEvent('page');
 await page.locator('#importPreview a[href="/lab#historicalReviews"]').click();
 const reviewPage=await reviewOpened;reviewPage.on('pageerror',e=>errors.push(e.message));await reviewPage.waitForLoadState('domcontentloaded');
 await reviewPage.locator('#historicalReviews').waitFor();
 assert.equal(reviewPage.url(),origin+'/lab#historicalReviews');
 assert.equal(await reviewPage.evaluate(()=>window.opener),null);
 await reviewPage.close();await page.bringToFront();
 assert.deepEqual(await importState(),beforeReview,'review tab must preserve original file, list, source, report and dialog');
 await page.screenshot({path:output+'/import-review-return.png'});
 await page.locator('[data-close="importDialog"]').click();
 await page.locator('.workspace-menu > summary').click();
 await page.locator('a[href="/logout"]').click();await page.waitForURL(origin+'/logout');
 await page.locator('#stagingSignOut').click();await loggedOut();
 assert.equal(posts.length,3);for(const p of posts){assert.equal(p.origin,origin);assert.match(p.cookie||'',/__session=synthetic-session/);}
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 await page.screenshot({path:output+'/signed-out.png'});
 console.log('PASS: actual Chromium Origin + Cookie forwarding; browser Set-Cookie deletion; direct and Contacts sign-out; retry preserves session; post-logout protected APIs 401. Synthetic auth/PGlite only, no real Google or deployed proxy proof.');
}catch(error){console.error(JSON.stringify({trace,consoleErrors,errors,pageURL:page?.url(),status:await page?.locator('#stagingLogoutStatus').textContent().catch(()=>null),cookiePresent:page?(await page.context().cookies(origin)).some(c=>c.name==='__session'):null}));if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(certDir)rmSync(certDir,{recursive:true,force:true});await db.close();}
