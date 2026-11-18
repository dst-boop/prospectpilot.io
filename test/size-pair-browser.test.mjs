import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertSizePlan,sizePairBrowserFiles,validateSizePairBrowserAssets} from '../scripts/size-pair-browser.mjs';
const base='Job Title & Role → Job Title: Partner\nDNC unknown is not cleared\nA phone number is not permission to call\nNo live connection or lead preview';
test('size browser assertions require exact role/size and refuse stale removed size or lost cautions',()=>{
 assertSizePlan(base+'\nEmployee Count: 10–20',true);assertSizePlan(base,false);
 for(const [text,present] of [[base,true],[base+'\nEmployee Count: 10–20',false],[base+'\n10-20',false],[base.replace('Partner','Engineer'),false],[base.replace('DNC unknown is not cleared',''),false]])assert.throws(()=>assertSizePlan(text,present));
});
test('size browser accepts only fixed bounded image assets and reports explicit139 feature loss',()=>{
 const assets=Object.fromEntries(sizePairBrowserFiles.map(f=>[f,'synthetic bytes']));validateSizePairBrowserAssets(assets);
 assert.throws(()=>validateSizePairBrowserAssets({...assets,extra:'no'}));assert.throws(()=>validateSizePairBrowserAssets({...assets,'audience.html':''}));
 const source=readFileSync(new URL('../scripts/size-pair-browser.mjs',import.meta.url),'utf8');
 for(const flag of ['professionalPartnerSizeVerified:true','removedSizeDownloadVerified:true','floorProfessionalSizeAbsent:true','floorWorkplaceFallbackVerified:true','floorDownloadAbsent:true','fullCompatibility:false'])assert.ok(source.includes(flag));
 assert.match(source,/selectOption\('local'\)/);assert.match(source,/employeeCount'\)\.fill\(''\)/);assert.match(source,/route.abort\(\)/);
 assert.match(source,/SIZE_PAIR_BROWSER_RESULT:/);
});
