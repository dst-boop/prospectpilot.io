import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createSyntheticStaging} from '../test/helpers/staging-app.mjs';
import {createResearchLab} from '../research-lab.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
const staging=await createSyntheticStaging({readOnly:true});
const browser=await chromium.launch({headless:true});
try{
 const lab=createResearchLab({pool:staging.database.pool,sources:{readiness:{}}});
 await lab.importCSV(staging.identities.advisor,{csv:'First Name,Last Name,Company,Email\n'+Array.from({length:27},(_,i)=>'Fixture'+String(i).padStart(2,'0')+',Person,Synthetic,person'+i+'@example.test').join('\n')});
 const login=await staging.request('/auth/session',{method:'POST',body:{idToken:'synthetic-id-advisor'}});
 const cookie=login.headers.get('set-cookie').split(';')[0],context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!=='https://pilot.test')return route.abort();
  assert.equal(req.method(),'GET','fallback browser must not mutate');
  const response=await staging.request(url.pathname+url.search,{cookie});
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('https://pilot.test/lab');
 await page.waitForFunction(()=>document.querySelectorAll('#items button').length===24);
 assert.equal(await page.locator('#previous').isDisabled(),true);
 await page.locator('#next').click();await page.waitForFunction(()=>document.querySelectorAll('#items button').length===3);
 assert.equal(await page.locator('#next').isDisabled(),true);
 await page.locator('#previous').click();await page.waitForFunction(()=>document.querySelectorAll('#items button').length===24);
 await page.locator('#search').fill('Fixture26');await page.locator('#searchForm button').click();
 await page.waitForFunction(()=>document.querySelectorAll('#items button').length===1);
 assert.match(await page.locator('#items').innerText(),/Fixture26/);
 await page.locator('#items button').click();await page.waitForFunction(()=>document.querySelector('#brief').textContent.includes('"read_only": true'));
 await page.screenshot({path:'/tmp/readonly-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
 await page.screenshot({path:'/tmp/readonly-mobile.png',fullPage:true});
 await page.locator('#search').fill('MissingPerson');await page.locator('#searchForm button').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('No matching'));
 assert.equal(await page.locator('#next').isDisabled(),true);assert.equal(await page.locator('#previous').isDisabled(),true);
 assert.deepEqual(errors,[]);assert.equal(staging.providerCalls.length,0);console.log('PASS: browser search/paging/brief, empty results, mobile overflow, no mutations/providers');
}finally{await browser.close();await staging.close();}
