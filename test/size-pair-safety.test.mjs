import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sizePairFiles,validateSizePairPins,validateSizePairChanges,parseSizeBrowserOutput} from '../scripts/size-pair-safety.mjs';
test('size pair pins exact150/139 eleven files without broadening unchanged core or CSS',async()=>{
 const pins=JSON.parse(await readFile(new URL('../scripts/size-pair-pins.json',import.meta.url),'utf8'));validateSizePairPins(pins);validateSizePairChanges(sizePairFiles,pins);assert.equal(sizePairFiles.length,11);
 for(const file of ['audience.css','scripts/demo.mjs','handler.mjs','migrations/035.sql']){assert.throws(()=>validateSizePairChanges([...sizePairFiles,file],pins));assert.throws(()=>validateSizePairPins({...pins,allowedChangedFiles:[...sizePairFiles,file]}));}
 assert.throws(()=>validateSizePairPins({...pins,successor:{...pins.successor,commit:'a'.repeat(40)}}));
});
test('browser proof requires role/size/removal/download plus explicitly degraded floor fallback',()=>{
 const fields=['professionalPartnerSizeVerified','downloadIncludesRoleAndSize','sizeRemovalVerified','removedSizeDownloadVerified','floorProfessionalSizeAbsent','floorDownloadAbsent','floorWorkplaceFallbackVerified','keyboardDownloadVerified','fallbackVerified','safetyCautionsPreserved'];
 const result={verified:true,fullCompatibility:false,automaticDownloads:0,externalRequests:0,...Object.fromEntries(fields.map(k=>[k,true]))};const output=r=>'SIZE_PAIR_BROWSER_RESULT:'+JSON.stringify(r);
 assert.deepEqual(parseSizeBrowserOutput(output(result)),result);
 for(const key of fields)assert.throws(()=>parseSizeBrowserOutput(output({...result,[key]:undefined})));
 for(const change of [{fullCompatibility:true},{externalRequests:1},{automaticDownloads:1}])assert.throws(()=>parseSizeBrowserOutput(output({...result,...change})));
 assert.throws(()=>parseSizeBrowserOutput(output(result)+'\n'+output(result)));
});
test('size harness reuses frozen truthful phase/preflight but not old browser or pins',async()=>{
 const source=await readFile(new URL('../scripts/size-pair-rehearsal.mjs',import.meta.url),'utf8');
 assert.match(source,/'scripts\/size-pair-browser.mjs',assetRoot/);assert.match(source,/COPY integrated-pair-phase\.mjs \/app\/scripts/);assert.match(source,/'scripts\/integrated-pair-preflight.mjs','--source-dir',draftRoot/);
 assert.match(source,/\['audience-client.js','audience.html','audience-catalog.mjs','lab.html'\]/);
 assert.match(source,/runtimePreflightAvailable:false/);assert.match(source,/fullCompatibility:false/);
 const old=JSON.parse(await readFile(new URL('../scripts/integrated-pair-pins.json',import.meta.url),'utf8'));assert.equal(old.successor.commit,'62c6fab8d385d4546c022b0758600496f7f26839');
});
