// Browser checks on bytes extracted from exact images by the pinned orchestrator.
// No application modules, authentication, live API, providers or external pages.
import assert from 'node:assert/strict';
import {readFile,lstat} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
export const sizePairBrowserFiles=Object.freeze(['audience.html','audience-client.js','audience-catalog.mjs','audience.css']);
export function validateSizePairBrowserAssets(assets){
 assert.deepEqual(Object.keys(assets).sort(),[...sizePairBrowserFiles].sort(),'Exact extracted image asset set');
 for(const file of sizePairBrowserFiles)assert.ok(typeof assets[file]==='string'&&Buffer.byteLength(assets[file])>0&&Buffer.byteLength(assets[file])<=2*1024*1024,'Bounded extracted image asset');
 return assets;
}
export function assertSizePlan(text,hasSize){
 assert.match(text,/Job Title & Role → Job Title: Partner/);
 assert.equal(text.includes('Employee Count: 10–20'),hasSize);
 if(!hasSize){assert.doesNotMatch(text,/10[–-]20/);assert.doesNotMatch(text,/Employee Count:/);}
 for(const caution of ['DNC unknown is not cleared','not permission to call','No live connection or lead preview'])assert.ok(text.includes(caution),'Safety caution remains in proposed plan');
}
export async function runSizePairBrowser(directory){
 assert.ok(isAbsolute(directory),'Explicit absolute extracted-assets directory required');
 const require=createRequire(import.meta.url);
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/pp-browser/node_modules/playwright');
 const browser=await chromium.launch({headless:true});
 const plans={};let clearedPlan;
 try{
  for(const phase of ['successor','floor']){
   const assets={};for(const file of sizePairBrowserFiles){const path=join(directory,phase,file),info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size<=2*1024*1024);assets[file]=await readFile(path,'utf8');}validateSizePairBrowserAssets(assets);
   const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true,serviceWorkers:'block'});
   try{
    const forbidden=[],errors=[],downloads=[];
    const paths={'/audience':'audience.html','/audience-client.js':'audience-client.js','/audience-catalog.mjs':'audience-catalog.mjs','/audience.css':'audience.css'};
    await context.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());const file=paths[url.pathname];
     if(url.origin==='https://size-guide.test'&&request.method()==='GET'&&!url.search&&url.pathname==='/favicon.ico'){await route.fulfill({status:204,body:''});return;}
     if(url.origin!=='https://size-guide.test'||request.method()!=='GET'||url.search||!file){forbidden.push('unexpected request');await route.abort();return;}
     await route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript',body:assets[file]});
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',()=>errors.push('page error'));page.on('download',download=>downloads.push(download));
    await page.goto('https://size-guide.test/audience');
    await page.locator('#audience option').first().waitFor({state:'attached'});
    if(phase==='floor'){
     // Enter size where frozen139 allows it, then move to the professional route.
     // This shows the older route ignores hidden size rather than pretending parity.
     await page.locator('#audience').selectOption('workplace');await page.locator('#employeeCount').fill('10–20');
     await page.locator('#focus').fill('Partner');await page.locator('#setupForm button[type=submit]').click();
     assertSizePlan(await page.locator('#planText').inputValue(),true);assert.equal(downloads.length,0);
     assert.equal(await page.locator('#download').count(),0);
     await page.screenshot({path:'/tmp/size-pair-floor-workplace-fallback.png',fullPage:true});
     await page.locator('#back').click();
    }
    await page.locator('#audience').selectOption('local');await page.locator('#focus').fill('Partner');
    assert.equal(await page.locator('#employeeCount').isVisible(),phase==='successor');
    if(phase==='successor')await page.locator('#employeeCount').fill('10–20');
    await page.locator('#setupForm button[type=submit]').click();
    assert.equal(await page.locator('#plan').isVisible(),true);assert.equal(downloads.length,0,'Building never downloads automatically');
    plans[phase]=await page.locator('#planText').inputValue();assertSizePlan(plans[phase],phase==='successor');
    const values=await page.locator('#filterList .value').allTextContents();assert.ok(values.includes('Partner'));assert.equal(values.includes('10–20'),phase==='successor');
    await page.screenshot({path:'/tmp/size-pair-'+phase+'-plan.png',fullPage:true});
    if(phase==='successor'){
     assert.equal(await page.locator('#download').isVisible(),true);
     const readDownload=async download=>{assert.equal(download.suggestedFilename(),'prospectpilot-search-plan.txt');assert.equal(await download.failure(),null);return readFile(await download.path(),'utf8');};
     const ready=page.waitForEvent('download');await page.locator('#download').click();
     assert.equal(await readDownload(await ready),plans[phase],'Exact Partner plus10–20 plan and cautions downloaded');
     assert.match(await page.locator('#copyStatus').innerText(),/Download requested/);
     const keyboardReady=page.waitForEvent('download');await page.locator('#download').focus();await page.keyboard.press('Enter');
     assert.equal(await readDownload(await keyboardReady),plans[phase]);assert.equal(downloads.length,2);
     await page.locator('#back').click();await page.locator('#employeeCount').fill('');await page.locator('#setupForm button[type=submit]').click();
     assert.equal(downloads.length,2,'Clearing and rebuilding never downloads automatically');
     clearedPlan=await page.locator('#planText').inputValue();assertSizePlan(clearedPlan,false);
     assert.equal(await page.locator('[data-copy-filter="employeeCount"]').count(),0);
     const clearedReady=page.waitForEvent('download');await page.locator('#download').click();
     const clearedDownload=await readDownload(await clearedReady);assert.equal(clearedDownload,clearedPlan);assertSizePlan(clearedDownload,false);assert.equal(downloads.length,3);
     await page.screenshot({path:'/tmp/size-pair-successor-cleared.png',fullPage:true});
     // Capability failure only; no replacement application code or synthetic API.
     await page.evaluate(()=>{URL.createObjectURL=()=>{throw Error('synthetic unsupported download');};});
     await page.locator('#download').click();
     assert.match(await page.locator('#copyStatus').innerText(),/Download unavailable/);assert.equal(await page.locator('#planDetails').evaluate(e=>e.open),true);assert.equal(await page.locator('#planText').evaluate(e=>document.activeElement===e),true);assert.equal(downloads.length,3,'Fallback never downloads');
     await page.screenshot({path:'/tmp/size-pair-successor-fallback.png',fullPage:true});
    }else{
     assert.equal(await page.locator('#download').count(),0,'Frozen139 lacks download affordance');
     assert.equal(await page.locator('[data-copy-filter="employeeCount"]').count(),0,'Frozen139 professional plan lacks size');
    }
    await page.locator('#back').click();await page.locator('#setupForm button[type=submit]').click();assert.equal(downloads.length,phase==='successor'?3:0,'Rebuilding does not download');
    assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   }finally{await context.close();}
  }
  console.log('SIZE_PAIR_BROWSER_RESULT:'+JSON.stringify({verified:true,professionalPartnerSizeVerified:true,downloadIncludesRoleAndSize:true,sizeRemovalVerified:true,removedSizeDownloadVerified:true,floorProfessionalSizeAbsent:true,floorWorkplaceFallbackVerified:true,floorDownloadAbsent:true,keyboardDownloadVerified:true,fallbackVerified:true,safetyCautionsPreserved:true,automaticDownloads:0,externalRequests:0,fullCompatibility:false,scope:'exact150/139 extracted image assets;139 loses professional size and download; no API/provider/auth/production proof'}));
 }finally{await browser.close();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){if(process.argv.length!==3)throw Error('One extracted asset directory required');await runSizePairBrowser(process.argv[2]);}
