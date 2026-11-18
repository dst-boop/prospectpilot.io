// Exact146/139 only. Existing corrected/negative controls remain unchanged.
export {validateTwoImageEnvironment,twoImageBaseTag,verifyTwoImageTagId,classifyTwoImageBuildFailure,verifyExtractedAsset,parseCorrectedBrowserOutput} from './corrected-floor-safety.mjs';
import {parseCorrectedFloorOutput} from './corrected-floor-safety.mjs';
export const integratedPairFiles=Object.freeze(['audience-client.js','audience.html','design/team-identity-preflight.md','firm-scoped-snapshot.mjs','lab.html','scripts/audience-visual-ci.mjs','test/audience-client.test.mjs','test/firm-scoped-snapshot.test.mjs','test/legacy-disclosure.test.mjs']);
export function validateIntegratedPairPins(pins){
 const expected={floor:{commit:'6e85c69d3f1883bb4d82f7a3624aaf03567a15c6',tree:'7ceb709a81039ef2ca1aea9717de0a35116388f2'},successor:{commit:'62c6fab8d385d4546c022b0758600496f7f26839',tree:'ca07f43fa895051e9fa43b88db54dc27599cc5df'}};
 for(const phase of ['floor','successor'])for(const field of ['commit','tree'])if(pins?.[phase]?.[field]!==expected[phase][field])throw Error('Exact146/139 pins required');
 if(!Array.isArray(pins.allowedChangedFiles)||JSON.stringify([...pins.allowedChangedFiles].sort())!==JSON.stringify([...integratedPairFiles].sort()))throw Error('Exact reviewed nine-file allowlist required');
 return pins;
}
export function validateIntegratedPairChanges(files,pins){
 validateIntegratedPairPins(pins);
 if(JSON.stringify([...files].sort())!==JSON.stringify([...integratedPairFiles].sort()))throw Error('Exact nine-file146/139 source delta required');
}
export function parseIntegratedPairOutput(output,identity,phase){
 const result=parseCorrectedFloorOutput(output,identity,phase);
 if(phase==='floor'&&(result.preflightRuntimeUnavailableBoth!==true||result.legacyDisclosureAbsentOnFloor!==true))throw Error('Integrated runtime scope evidence missing');
 return result;
}
export function parseIntegratedPreflightOutput(output){
 const all=output.trim().split(/\r?\n/);
 if(all.filter(l=>l==='SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED').length!==1)throw Error('Draft network guard installation missing');
 const reports=all.filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return {};}}).filter(r=>r.synthetic_bootstrap_network_guard===true);
 if(reports.length!==1||reports[0].denied_operations!==0)throw Error('Draft network guard receipt failed');
 const lines=output.trim().split(/\r?\n/).filter(l=>l.startsWith('INTEGRATED_PREFLIGHT_RESULT:'));
 if(lines.length!==1||Buffer.byteLength(lines[0])>16384)throw Error('Unique bounded draft preflight result required');
 const result=JSON.parse(lines[0].slice('INTEGRATED_PREFLIGHT_RESULT:'.length));
 if(result.verified!==true||result.draftDiagnosticOnly!==true||result.runtimePreflightAvailable!==false||result.runtimeCapability!==false||result.fullCompatibility!==false)throw Error('Draft diagnostic scope mismatch');
 for(const phase of ['floor','successor']){
  const item=result.results?.[phase];
  if(!item||item.sourceOnly!==true||item.runtimeCapability!==false||item.can_execute!==false||item.can_transfer!==false||item.privacyVerified!==true||item.authorizationRefused!==true)throw Error('Missing bounded draft proof');
  const changed=phase==='successor';for(const key of ['metadataInventory','boundedEvidenceRefused','missingSchemaRefused'])if(item[key]!==changed)throw Error('Draft source distinction missing');
 }
 return result;
}
