import {createHash} from 'node:crypto';
// Separate corrected-floor diagnostic; preserves the original negative control.
export {validateTwoImageEnvironment,twoImageBaseTag,verifyTwoImageTagId,classifyTwoImageBuildFailure} from './two-image-safety.mjs';
import {parseTwoImageOutput} from './two-image-safety.mjs';
export function validateCorrectedFloorPins(pins){
 for(const name of ['floor','successor'])for(const field of ['commit','tree'])if(!/^[a-f0-9]{40}$/.test(pins?.[name]?.[field]||''))throw Error('Exact commit/tree pins required');
 if(pins.floor.commit!=='6e85c69d3f1883bb4d82f7a3624aaf03567a15c6'||pins.floor.tree!=='7ceb709a81039ef2ca1aea9717de0a35116388f2')throw Error('Corrected floor must remain pinned139');
 if(pins.floor.commit===pins.successor.commit||pins.floor.tree===pins.successor.tree)throw Error('Distinct source trees required');
 if(!Array.isArray(pins.allowedChangedFiles)||!pins.allowedChangedFiles.length||pins.allowedChangedFiles.some(f=>typeof f!=='string'||f.split('/').includes('..')||!(/^(audience-client\.js|audience\.html|scripts\/audience-visual-ci\.mjs|test\/[a-zA-Z0-9/_.-]+\.mjs|[A-Z0-9_-]+\.md)$/.test(f))))throw Error('Only named download assets/tests/docs may differ');
 return pins;
}
export function validateCorrectedFloorChanges(files,pins){
 validateCorrectedFloorPins(pins);
 if(!['audience-client.js','audience.html'].every(f=>files.includes(f))||files.some(f=>!pins.allowedChangedFiles.includes(f)))throw Error('Unexpected delta or missing genuine download asset change');
}
export function parseCorrectedFloorOutput(output,identity,phase){
 const result=parseTwoImageOutput(output,identity,phase);
 if(phase==='floor'&&(result.sponsorIdentityCompatible!==true||result.localDownloadAbsentOnFloor!==true||result.productRegressionObserved===true))throw Error('Corrected sponsor/download scope mismatch');
 if(phase==='floor')for(const key of ['successor_rows_preserved','activity_idempotency','advice_decisions_preserved','dnc_export','uid_isolation','historical_hold_resolution','key_coverage_fail_closed','privacy_deletion','alias_tombstones','queues_reservations_unchanged','schema035_refused'])if(result[key]!==true)throw Error('Missing security/data proof: '+key);
 return result;
}
export function verifyExtractedAsset(encoded,expectedHash){
 if(typeof encoded!=='string'||encoded.length>4*1024*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error('Invalid bounded image asset');
 if(!/^[a-f0-9]{64}$/.test(expectedHash))throw Error('Invalid asset hash');
 const bytes=Buffer.from(encoded,'base64');if(createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw Error('Extracted image asset hash mismatch');return bytes;
}
export function parseCorrectedBrowserOutput(output){
 const lines=output.trim().split(/\r?\n/).filter(l=>l.startsWith('CORRECTED_BROWSER_RESULT:'));
 if(lines.length!==1||Buffer.byteLength(lines[0])>16384)throw Error('Bounded browser result required');
 const result=JSON.parse(lines[0].slice('CORRECTED_BROWSER_RESULT:'.length));
 for(const key of ['verified','successorDownloadVerified','floorDownloadAbsent','keyboardDownloadVerified','fallbackVerified','samePlanText'])if(result[key]!==true)throw Error('Missing browser proof: '+key);
 if(result.fullCompatibility!==false||result.automaticDownloads!==0||result.externalRequests!==0)throw Error('Browser scope violation');
 return result;
}
