// Browser checks on bytes extracted from exact images by the pinned orchestrator.
// No application modules, authentication, live API, providers or external pages.
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
export const correctedBrowserFiles=Object.freeze(['audience.html','audience-client.js','audience-catalog.mjs','audience.css']);
export function validateCorrectedBrowserAssets(assets){
 assert.deepEqual(Object.keys(assets).sort(),[...correctedBrowserFiles].sort(),'Exact extracted image asset set');
 for(const file of correctedBrowserFiles)assert.ok(typeof assets[file]==='string'&&Buffer.byteLength(assets[file])>0&&Buffer.byteLength(assets[file])<=2*1024*1024,'Bounded extracted image asset');
 return assets;
}
export async function runCorrectedBrowser(directory){
 assert.ok(isAbsolute(directory),'Explicit absolute extracted-assets directory required');
 const require=createRequire(import.meta.url);
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
 const browser=await chromium.launch({headless:true});
 const plans={};
 try{
  for(const phase of ['successor','floor']){
   const assets={};for(const file of correctedBrowserFiles){const path=join(directory,phase,file),info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size<=2*1024*1024);assets[file]=await readFile(path,'utf8');}validateCorrectedBrowserAssets(assets);
   const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true,serviceWorkers:'block'});
   try{
    const forbidden=[],errors=[],downloads=[];
    const paths={'/audience':'audience.html','/audience-client.js':'audience-client.js','/audience-catalog.mjs':'audience-catalog.mjs','/audience.css':'audience.css'};
    await context.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());const file=paths[url.pathname];
     if(url.origin==='https://corrected-guide.test'&&request.method()==='GET'&&!url.search&&url.pathname==='/favicon.ico'){await route.fulfill({status:204,body:''});return;}
     if(url.origin!=='https://corrected-guide.test'||request.method()!=='GET'||url.search||!file){forbidden.push('unexpected request');await route.abort();return;}
     await route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript',body:assets[file]});
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',()=>errors.push('page error'));page.on('download',download=>downloads.push(download));
    await page.goto('https://corrected-guide.test/audience');
    await page.locator('#audience option').first().waitFor({state:'attached'});
    await page.locator('#setupForm button[type=submit]').click();
    assert.equal(await page.locator('#plan').isVisible(),true);assert.equal(downloads.length,0,'Building never downloads automatically');
    plans[phase]=await page.locator('#planText').inputValue();assert.match(plans[phase],/DNC unknown is not cleared/);
    await page.screenshot({path:'/tmp/corrected-floor-'+phase+'-plan.png',fullPage:true});
    if(phase==='successor'){
     assert.equal(await page.locator('#download').isVisible(),true);
     const downloadReady=page.waitForEvent('download');await page.locator('#download').click();const download=await downloadReady;
     assert.equal(download.suggestedFilename(),'prospectpilot-search-plan.txt');assert.equal(await download.failure(),null);
     assert.equal(await readFile(await download.path(),'utf8'),plans[phase],'Exact proposed plan and cautions downloaded');
     assert.match(await page.locator('#copyStatus').innerText(),/Download requested/);
     const keyboardReady=page.waitForEvent('download');await page.locator('#download').focus();await page.keyboard.press('Enter');const keyboard=await keyboardReady;
     assert.equal(keyboard.suggestedFilename(),'prospectpilot-search-plan.txt');assert.equal(await keyboard.failure(),null);assert.equal(await readFile(await keyboard.path(),'utf8'),plans[phase]);assert.equal(downloads.length,2);
     // Browser-controlled capability failure, not an app replacement.
     await page.evaluate(()=>{URL.createObjectURL=()=>{throw Error('synthetic unsupported download');};});
     await page.locator('#download').click();
     assert.match(await page.locator('#copyStatus').innerText(),/Download unavailable/);assert.equal(await page.locator('#planDetails').evaluate(e=>e.open),true);assert.equal(await page.locator('#planText').evaluate(e=>document.activeElement===e),true);assert.equal(downloads.length,2,'Fallback never downloads');
     await page.screenshot({path:'/tmp/corrected-floor-successor-fallback.png',fullPage:true});
    }else assert.equal(await page.locator('#download').count(),0,'Frozen floor lacks only new local-download affordance');
    await page.locator('#back').click();await page.locator('#setupForm button[type=submit]').click();assert.equal(downloads.length,phase==='successor'?2:0,'Rebuilding does not download');
    assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   }finally{await context.close();}
  }
  assert.equal(plans.floor,plans.successor,'Same manual plan remains available on floor');
  console.log('CORRECTED_BROWSER_RESULT:'+JSON.stringify({verified:true,successorDownloadVerified:true,floorDownloadAbsent:true,keyboardDownloadVerified:true,fallbackVerified:true,automaticDownloads:0,externalRequests:0,samePlanText:true,fullCompatibility:false,scope:'extracted exact-image browser assets; no real auth/provider/production coverage'}));
 }finally{await browser.close();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){if(process.argv.length!==3)throw Error('One extracted asset directory required');await runCorrectedBrowser(process.argv[2]);}
