import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {integratedPairFiles,validateIntegratedPairPins,validateIntegratedPairChanges} from '../scripts/integrated-pair-safety.mjs';
test('integrated pair fixes exact146/139 and exact nine-file reviewed delta',async()=>{
 const pins=JSON.parse(await readFile(new URL('../scripts/integrated-pair-pins.json',import.meta.url),'utf8'));validateIntegratedPairPins(pins);validateIntegratedPairChanges(integratedPairFiles,pins);
 assert.throws(()=>validateIntegratedPairPins({...pins,successor:{...pins.successor,commit:'a'.repeat(40)}}));
 for(const files of [integratedPairFiles.slice(1),[...integratedPairFiles,'scripts/demo.mjs'],[...integratedPairFiles,'migrations/035.sql'],[...integratedPairFiles,'handler.mjs']]){
  assert.throws(()=>validateIntegratedPairChanges(files,pins));assert.throws(()=>validateIntegratedPairPins({...pins,allowedChangedFiles:files}));
 }
});
test('draft source probe remains separate from runtime continuity and old controls',async()=>{
 const source=await readFile(new URL('../scripts/integrated-pair-rehearsal.mjs',import.meta.url),'utf8');
 assert.match(source,/COPY integrated-pair-phase\.mjs \/app\/scripts/);
 assert.doesNotMatch(source,/COPY (?:firm|schema-drafts)/);
 assert.match(source,/Draft unexpectedly packaged/);assert.match(source,/'build','--target','build'/);
 assert.match(source,/Host draft setup differs from exact source/);
 assert.match(source,/'scripts\/integrated-pair-preflight.mjs','--source-dir',draftRoot/);
 assert.match(source,/runtimePreflightAvailable:false/);assert.match(source,/draftDiagnosticOnly:true/);
 assert.match(source,/authenticatedBrowserRendering:false/);assert.match(source,/'scripts\/demo.mjs'/);
 assert.match(source,/'scripts\/corrected-floor-browser.mjs',assetRoot/);
 const negative=JSON.parse(await readFile(new URL('../scripts/two-image-pins.json',import.meta.url),'utf8'));assert.equal(negative.floor.commit,'9f840ac9e07a9051055bdd3eb97857f0d2645392');
 const corrected=JSON.parse(await readFile(new URL('../scripts/corrected-floor-pins.json',import.meta.url),'utf8'));assert.equal(corrected.successor.commit,'31a76db2d504d3e65f802a8ce815f82eedefd2eb');
});
test('preflight receipt refuses runtime or transfer claims and missing privacy boundaries',async()=>{
 const {parseIntegratedPreflightOutput}=await import('../scripts/integrated-pair-safety.mjs');
 const item=changed=>({sourceOnly:true,runtimeCapability:false,can_execute:false,can_transfer:false,privacyVerified:true,authorizationRefused:true,metadataInventory:changed,boundedEvidenceRefused:changed,missingSchemaRefused:changed});
 const value={verified:true,draftDiagnosticOnly:true,runtimePreflightAvailable:false,runtimeCapability:false,fullCompatibility:false,results:{floor:item(false),successor:item(true)}};
 const output=v=>'SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED\nINTEGRATED_PREFLIGHT_RESULT:'+JSON.stringify(v)+'\n'+JSON.stringify({synthetic_bootstrap_network_guard:true,denied_operations:0});assert.deepEqual(parseIntegratedPreflightOutput(output(value)),value);
 for(const changed of [{runtimeCapability:true},{fullCompatibility:true},{draftDiagnosticOnly:false},{results:{...value.results,successor:{...item(true),can_transfer:true}}},{results:{...value.results,floor:item(true)}}])assert.throws(()=>parseIntegratedPreflightOutput(output({...value,...changed})));
});
test('integrated floor receipt requires explicit runtime draft absence and disclosure difference',async()=>{
 const {parseIntegratedPairOutput}=await import('../scripts/integrated-pair-safety.mjs');
 const identity={nonce:'a'.repeat(24),schema:'pp_two_'+'a'.repeat(24)};
 const keys=['successor_rows_preserved','activity_idempotency','advice_decisions_preserved','dnc_export','uid_isolation','historical_hold_resolution','key_coverage_fail_closed','privacy_deletion','alias_tombstones','queues_reservations_unchanged','schema035_refused'];
 const value={verified:true,...identity,external_calls:0,fullCompatibility:false,sponsorIdentityCompatible:true,localDownloadAbsentOnFloor:true,preflightRuntimeUnavailableBoth:true,legacyDisclosureAbsentOnFloor:true,...Object.fromEntries(keys.map(k=>[k,true]))};
 const output=r=>'SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED\nTWO_IMAGE_RESULT:'+JSON.stringify(r)+'\n'+JSON.stringify({synthetic_bootstrap_network_guard:true,denied_operations:0});
 assert.deepEqual(parseIntegratedPairOutput(output(value),identity,'floor'),value);
 for(const key of ['preflightRuntimeUnavailableBoth','legacyDisclosureAbsentOnFloor'])for(const replacement of [false,undefined])assert.throws(()=>parseIntegratedPairOutput(output({...value,[key]:replacement}),identity,'floor'));
});
