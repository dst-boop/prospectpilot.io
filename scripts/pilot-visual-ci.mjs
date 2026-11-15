import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
import {createSyntheticStaging} from '../test/helpers/staging-app.mjs';
const browser=await chromium.launch({headless:true});
const staging=await createSyntheticStaging();
try {
 const login=await staging.request('/auth/session',{method:'POST',body:{idToken:'synthetic-id-advisor'}});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const json=async(path,body)=>{const r=await staging.request(path,{cookie,method:'POST',body});if(r.status!==200)throw Error(await r.text());return r.json();};
 const captured=await json('/api/prospect/networking',{request_key:'visual-fixture-0001',kind:'in_person',person:{first_name:'Jordan',last_name:'Fixture',company:'Synthetic Manufacturing',email:'jordan@example.com'},context:'Fictional event',occurred_on:new Date().toISOString().slice(0,10),note:'Synthetic QA only'});
 await json('/api/lab/contact-import',{ids:[captured.capture.contact_id]});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!=='https://pilot.test')return route.abort();
  const response=await staging.request(url.pathname+url.search,{cookie,method:req.method(),...(req.postData()?{body:JSON.parse(req.postData())}:{})});
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('https://pilot.test/lab');await page.waitForTimeout(1500);
 console.log('TITLE',await page.title());console.log((await page.locator('body').innerText()).slice(0,7000));
 await page.screenshot({path:'/tmp/pilot-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/pilot-mobile.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));console.log('ERRORS',errors);console.log('OVERFLOW',await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth})));
 await browser.close();
}finally{await staging.close();}
