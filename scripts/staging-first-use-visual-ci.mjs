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
const output='/tmp/staging-first-use-browser';mkdirSync(output,{recursive:true});
const now=Date.now(),project='prospectpilot-stg-synthetic';
const config=stagingConfig({STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'synthetic-browser-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-browser-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_test',PGUSER:'prospectpilot_stg_test',PGPASSWORD:'synthetic-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'synthetic-public-key',appId:'synthetic-app'})});
const claims={uid:config.uid,aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};
const db=new PGlite();
const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);
const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
let browser,page;
const errors=[],external=[],manualRequests=[],allRequests=[];
let manual=false;
try {
 await migrate(pool);
 const auth={verifyIdToken:async()=>claims,verifySessionCookie:async()=>claims,createSessionCookie:async()=> 'synthetic-session'};
 const app=createAuthenticatedStaging({pool,config,auth,loginScript:'// synthetic authentication only'});
 const contacts=async()=>{const r=await app(new Request(config.origin+'/api/prospect/contacts',{headers:{cookie:'__session=synthetic-session'}}));assert.equal(r.status,200);return (await r.json()).total;};
 browser=await chromium.launch({headless:true,...process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}});
 const context=await browser.newContext({acceptDownloads:true});
 await context.addCookies([{name:'__session',value:'synthetic-session',url:config.origin,secure:true,httpOnly:true,sameSite:'Lax'}]);
 await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.syntheticClipboard=text;}}}));
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),entry={url:req.url(),path:u.pathname,method:req.method()};
  allRequests.push(entry);if(manual)manualRequests.push(entry);
  if(u.origin!==config.origin){external.push(req.url());return route.abort();}
  if(u.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
  // Preserve the browser's actual headers/body; only the auth adapter is synthetic.
  const response=await app(new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),...(req.postDataBuffer()?{body:req.postDataBuffer()}:{})}));
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(config.origin+'/lab');await page.waitForLoadState('networkidle');
  assert.equal(await contacts(),0);
  assert.equal(await page.locator('#findProspects').isVisible(),false,'disabled live discovery must not masquerade as a manual plan');
  await page.locator('#buildSearchPlan').waitFor({state:'visible'});
  manual=true;
  await page.locator('#buildSearchPlan').click();await page.waitForURL('**/audience');await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#stepLabel').count(),1);
  await page.locator('#location').fill('Long Island');await page.locator('#occupation').selectOption('office');
  await page.locator('#setupForm button[type=submit]').click();
  assert.match(await page.locator('#planOutcome').innerText(),/No search was run and no contacts were saved/);
  assert.match(await page.locator('#planNext').innerText(),/fictional|supplied/i);
  assert.match(await page.locator('#stepLabel').innerText(),/fictional|supplied/i);
  const forbidden=/open your own ZoomInfo|use it in ZoomInfo|try the filters below|After your ZoomInfo review|Use Export.s arrow|Review actual results in ZoomInfo before exporting/i;
  assert.doesNotMatch(await page.locator('body').innerText(),forbidden);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'planTitle');
  await page.locator('#copy').click();await page.waitForFunction(()=>Boolean(window.syntheticClipboard));
  const copied=await page.evaluate(()=>window.syntheticClipboard);
  assert.match(copied,/Fictional practice plan only/);assert.match(copied,/fixed|unchanged|supplied/i);assert.doesNotMatch(copied,forbidden);
  assert.equal(copied,await page.locator('#planText').inputValue());
  const pending=page.waitForEvent('download');await page.locator('#download').click();const download=await pending;
  const filename=output+'/plan-'+width+'.txt';await download.saveAs(filename);assert.equal(readFileSync(filename,'utf8'),copied);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:output+'/plan-'+width+'.png',fullPage:true});
  manual=false;
  assert.equal(await contacts(),0,'manual plan cannot save contacts');
  await page.locator('#uploadLink').click();await page.locator('#importDialog[open]').waitFor();
  const fixtureReady=page.waitForEvent('download');await page.locator('#stagingFixtureOnly a[href="/staging-fixture.csv"]').click();
  const fixture=await fixtureReady,fixturePath=output+'/fixture-'+width+'.csv';await fixture.saveAs(fixturePath);
  assert.equal(readFileSync(fixturePath,'utf8'),fictionalCSV,'served fixture must remain byte-identical');
  await page.locator('#source').fill('Fictional first-use exercise');
  await page.locator('#csvFile').setInputFiles(fixturePath);
  // The shipped file-change handler previews automatically once source is present.
  await page.waitForFunction(()=>document.querySelector('#importPreview').textContent.includes('Alex'));
  assert.equal(await contacts(),0,'actual file preview cannot persist contacts');
  await page.screenshot({path:output+'/preview-'+width+'.png',fullPage:true});
 }
 assert.ok(manualRequests.length>0);
 assert.ok(manualRequests.every(r=>new URL(r.url).origin===config.origin&&r.method==='GET'&&['/audience','/audience.css','/audience-client.js','/audience-guide.mjs','/audience-catalog.mjs','/staging-ui.css','/staging-ui.js','/favicon.ico'].includes(r.path)),JSON.stringify(manualRequests));
 assert.ok(!allRequests.some(r=>/providers|\/jobs|\/api\/lab\/runs/.test(r.path)),'no provider/discovery dispatch');
 assert.ok(!allRequests.some(r=>r.method==='POST'&&r.path==='/api/prospect/import'),'no commit submission');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({verified:true,scope:'handler-rendered fictional first-use UI; desktop/mobile manual plan, copy/download, unchanged fixture file preview with zero contacts',auth:'synthetic adapter and cookie, not real Google/IAP',storage:'local PGlite, not native PostgreSQL or live Cloud SQL',network:'browser intercepted requests only; not general network isolation'}));
} finally {await browser?.close();await db.close();}
