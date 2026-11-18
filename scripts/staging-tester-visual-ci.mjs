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
import {fictionalCSV} from './staging-fixtures.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
const output='/tmp/staging-tester-browser';mkdirSync(output,{recursive:true});
const now=Date.now(),project='prospectpilot-stg-261118',origin='https://prospectpilot-stg-browser-123.us-central1.run.app';
const config=stagingConfig({STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-browser-owner',STAGING_TESTER_BINDINGS:JSON.stringify([{uid:'synthetic-browser-tester',email:'tester@example.test',expires:new Date(now+3600000).toISOString()}]),STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:origin,PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_test',PGUSER:'prospectpilot_stg_test',PGPASSWORD:'synthetic-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic-public-key',appId:'synthetic-app'})});
const claims={uid:config.uid,aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
const db=new PGlite();const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);
const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
const verify=async(token,revoked)=>{assert.equal(revoked,true);if(token==='synthetic-owner')return claims;assert.equal(token,'synthetic-session');return {...claims,uid:'synthetic-browser-tester',email:'tester@example.test'};};
let browser,page,server,certDir;const errors=[],outbound=[],posts=[],trace=[],consoleErrors=[];let failOnce=false;
try{
 await migrate(pool);
 const app=createAuthenticatedStaging({pool,config,auth:{verifyIdToken:verify,verifySessionCookie:verify,createSessionCookie:async()=> 'synthetic-session'},loginScript:'// synthetic test only'});
 const ownerSeed=await app(new Request(origin+'/api/prospect/import',{method:'POST',headers:{origin,cookie:'__session=synthetic-owner','content-type':'application/json'},body:JSON.stringify({csv:fictionalCSV,source:'Synthetic owner fixture'})}));assert.equal(ownerSeed.status,200);
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
 await seed();await page.goto(origin+'/prospect?import=1');
 await page.locator('#importDialog[open]').waitFor();
 await page.getByText('Approved fictional tester.',{exact:true}).waitFor();
 assert.equal(await page.locator('#saveSearchOpen').isVisible(),false);
 assert.equal(await page.locator('#export').isVisible(),false);
 const downloadPromise=page.waitForEvent('download');await page.locator('#importForm a[href="/staging-fixture.csv"]').click();
 const download=await downloadPromise,bytes=readFileSync(await download.path());assert.equal(bytes.toString(),fictionalCSV);
 await page.locator('#csvFile').setInputFiles({name:'fictional-staging.csv',mimeType:'text/csv',buffer:bytes});
 await page.waitForFunction(()=>document.querySelector('#importResult').textContent.includes('Preview — nothing saved.')&&document.querySelector('#importResult').textContent.includes('2 new'));
 assert.equal(await page.evaluate(async()=> (await (await fetch('/api/prospect/contacts')).json()).total),0);
 await page.locator('#importForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#continueImport').hidden===false);
 await page.locator('#continueImport').click();
 await page.locator('input[data-id]').first().check();await page.locator('#sendToWorklist').click();
 await page.waitForURL(url=>url.pathname==='/lab'&&url.searchParams.has('lead'));
 await page.locator('#detail[open]').waitFor();
 await page.waitForFunction(()=>document.querySelector('#activityForm').hidden===false);
 await page.locator('#outcomeDetails > summary').click();
 await page.locator('#activityForm').waitFor({state:'visible'});
 assert.equal(await page.locator('#profileOpen').isVisible(),false);
 assert.equal(await page.locator('#historicalOpen').isVisible(),false);
 assert.equal(await page.locator('#identityPanel').isVisible(),false);
 assert.equal(await page.locator('[data-run]:visible').count(),0);
 await page.screenshot({path:output+'/tester-worklist.png'});
 await page.goto(origin+'/prospect');await page.locator('input[data-id]').first().waitFor();
 assert.equal(await page.evaluate(async()=> (await (await fetch('/api/prospect/contacts')).json()).total),2);
 assert.ok(trace.filter(r=>r.path.startsWith('/api/')).every(r=>r.status===200),'startup/core flow must not call denied API routes');
 assert.equal(trace.some(r=>r.path==='/api/prospect/saved-searches'),false);
 assert.equal(trace.some(r=>r.path==='/api/lab/advisor-profile'&&r.method==='POST'),false);
 assert.equal(trace.some(r=>/\/api\/lab\/(?:historical-identity-reviews|identity-reviews)/.test(r.path)),false);
 await page.goto(origin+'/logout');await page.locator('#stagingSignOut').click();await loggedOut();
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 await page.screenshot({path:output+'/tester-signed-out.png'});
 console.log(JSON.stringify({verified:true,scope:'actual Chromium loopback synthetic tester startup, real file download/upload preview/import, separate persisted directory, Worklist navigation, denied controls absent, no denied background routes, signout/protected401',auth:'synthetic only, not real Google/IAP'}));
}catch(error){console.error(JSON.stringify({trace,consoleErrors,errors,pageURL:page?.url(),status:await page?.locator('#stagingLogoutStatus').textContent().catch(()=>null),cookiePresent:page?(await page.context().cookies(origin)).some(c=>c.name==='__session'):null}));if(page)await page.screenshot({path:output+'/failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(certDir)rmSync(certDir,{recursive:true,force:true});await db.close();}
