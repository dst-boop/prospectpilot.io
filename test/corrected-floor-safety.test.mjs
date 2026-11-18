import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateCorrectedFloorPins,validateCorrectedFloorChanges,parseCorrectedFloorOutput,verifyExtractedAsset} from '../scripts/corrected-floor-safety.mjs';
const pins={floor:{commit:'6e85c69d3f1883bb4d82f7a3624aaf03567a15c6',tree:'7ceb709a81039ef2ca1aea9717de0a35116388f2'},successor:{commit:'c'.repeat(40),tree:'d'.repeat(40)},allowedChangedFiles:['audience-client.js','audience.html','test/audience-client.test.mjs','scripts/audience-visual-ci.mjs']};
test('corrected floor requires exact139 and genuine UI delta without changing retained runtime',()=>{
 validateCorrectedFloorPins(pins);validateCorrectedFloorChanges(pins.allowedChangedFiles,pins);
 assert.throws(()=>validateCorrectedFloorPins({...pins,floor:{...pins.floor,commit:'a'.repeat(40)}}));
 assert.throws(()=>validateCorrectedFloorChanges(['audience.html'],pins));
 for(const file of ['research-lab.mjs','plan-catalog.mjs','audience-catalog.mjs','rollback-schema.mjs','migrations/035.sql','scripts/two-image-phase.mjs','.github/workflows/tests.yml']){
  assert.throws(()=>validateCorrectedFloorChanges([...pins.allowedChangedFiles,file],pins));
  assert.throws(()=>validateCorrectedFloorPins({...pins,allowedChangedFiles:[...pins.allowedChangedFiles,file]}));
 }
});
test('corrected floor result must retain sponsor identity while expressly lacking new affordance',()=>{
 const identity={nonce:'a'.repeat(24),schema:'pp_two_'+'a'.repeat(24)};
 const result={verified:true,...identity,external_calls:0,fullCompatibility:false,sponsorIdentityCompatible:true,localDownloadAbsentOnFloor:true,...Object.fromEntries(['successor_rows_preserved','activity_idempotency','advice_decisions_preserved','dnc_export','uid_isolation','historical_hold_resolution','key_coverage_fail_closed','privacy_deletion','alias_tombstones','queues_reservations_unchanged','schema035_refused'].map(k=>[k,true]))};
 const output=r=>'SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED\nTWO_IMAGE_RESULT:'+JSON.stringify(r)+'\n'+JSON.stringify({synthetic_bootstrap_network_guard:true,denied_operations:0});
 assert.deepEqual(parseCorrectedFloorOutput(output(result),identity,'floor'),result);
 for(const changed of [{dnc_export:false},{uid_isolation:undefined},{sponsorIdentityCompatible:false},{localDownloadAbsentOnFloor:false},{productRegressionObserved:true},{fullCompatibility:true},{external_calls:1}])assert.throws(()=>parseCorrectedFloorOutput(output({...result,...changed}),identity,'floor'));
});
test('image-extracted assets require exact source hash and bounded canonical base64',()=>{
 const bytes=Buffer.from('<html>synthetic</html>'),hash=createHash('sha256').update(bytes).digest('hex');
 assert.deepEqual(verifyExtractedAsset(bytes.toString('base64'),hash),bytes);
 assert.throws(()=>verifyExtractedAsset(Buffer.from('substituted').toString('base64'),hash));
 assert.throws(()=>verifyExtractedAsset('***',hash));assert.throws(()=>verifyExtractedAsset('A'.repeat(4*1024*1024+4),hash));
});
test('corrected harness extracts browser assets from exact images and overlays phase only',async()=>{
 const source=await readFile(new URL('../scripts/corrected-floor-rehearsal.mjs',import.meta.url),'utf8');
 assert.match(source,/COPY corrected-floor-phase\.mjs \/app\/scripts/);
 assert.match(source,/verifyExtractedAsset\(extracted\[file\],contentHashes\[phase\]\[file\]\)/);
 assert.match(source,/'scripts\/corrected-floor-browser\.mjs',assetRoot/);
 assert.match(source,/Retained security\/core image content changed/);
 assert.match(source,/fullCompatibility:false/);
 assert.doesNotMatch(source,/COPY.*(?:audience|handler|research-lab)/);
});
test('browser receipt requires every bounded affordance and network assertion',async()=>{
 const {parseCorrectedBrowserOutput}=await import('../scripts/corrected-floor-safety.mjs');
 const result={verified:true,successorDownloadVerified:true,floorDownloadAbsent:true,keyboardDownloadVerified:true,fallbackVerified:true,samePlanText:true,fullCompatibility:false,automaticDownloads:0,externalRequests:0};
 const output=r=>'CORRECTED_BROWSER_RESULT:'+JSON.stringify(r);
 assert.deepEqual(parseCorrectedBrowserOutput(output(result)),result);
 for(const changes of [{samePlanText:false},{keyboardDownloadVerified:false},{fullCompatibility:true},{externalRequests:1},{automaticDownloads:1}])assert.throws(()=>parseCorrectedBrowserOutput(output({...result,...changes})));
 assert.throws(()=>parseCorrectedBrowserOutput(output(result)+'\n'+output(result)));
});
test('published corrected pair pins genuine reviewed download change without changing negative control',async()=>{
 const actual=JSON.parse(await readFile(new URL('../scripts/corrected-floor-pins.json',import.meta.url),'utf8'));
 assert.deepEqual(actual.floor,pins.floor);
 assert.deepEqual(actual.successor,{commit:'31a76db2d504d3e65f802a8ce815f82eedefd2eb',tree:'105ed7e4fbb8791b845a550883c8ae61f82b21a1'});
 assert.deepEqual([...actual.allowedChangedFiles].sort(),[...pins.allowedChangedFiles].sort());
 validateCorrectedFloorChanges(actual.allowedChangedFiles,actual);
 const negative=JSON.parse(await readFile(new URL('../scripts/two-image-pins.json',import.meta.url),'utf8'));
 assert.equal(negative.floor.commit,'9f840ac9e07a9051055bdd3eb97857f0d2645392');assert.equal(negative.successor.commit,actual.floor.commit);
});
