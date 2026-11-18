import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTwoImageEnvironment,validateTwoImageReceipt} from '../scripts/corrected-floor-phase.mjs';
import {correctedBrowserFiles,validateCorrectedBrowserAssets} from '../scripts/corrected-floor-browser.mjs';
test('corrected phase retains bounded environment and receipt refusal',()=>{
 assert.throws(()=>validateTwoImageEnvironment({}));assert.throws(()=>validateTwoImageReceipt('{}',{nonce:'a',schema:'b'}));
 const source=readFileSync(new URL('../scripts/corrected-floor-phase.mjs',import.meta.url),'utf8');
 assert.match(source,/sponsorIdentityCompatible:true/);assert.match(source,/localDownloadAbsentOnFloor:true/);assert.match(source,/fullCompatibility:false/);
 assert.match(source,/schema035_refused:true/);assert.match(source,/Every successor row retained before floor writes/);assert.doesNotMatch(source,/assert.equal\(payload.plan_id,'synthetic-ein-two'\)/);
});
test('browser proof requires exact bounded extracted asset set',()=>{
 const assets=Object.fromEntries(correctedBrowserFiles.map(f=>[f,'synthetic bytes']));assert.equal(validateCorrectedBrowserAssets(assets),assets);
 for(const bad of [{},{...assets,'app.mjs':'extra'},{...assets,'audience.html':''},{...assets,'audience.css':'x'.repeat(2*1024*1024+1)}])assert.throws(()=>validateCorrectedBrowserAssets(bad));
});
