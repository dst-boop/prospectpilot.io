// Exact150/139 only. Existing corrected/negative controls remain unchanged.
export {validateTwoImageEnvironment,twoImageBaseTag,verifyTwoImageTagId,classifyTwoImageBuildFailure,verifyExtractedAsset,parseCorrectedBrowserOutput} from './corrected-floor-safety.mjs';
import {parseCorrectedFloorOutput} from './corrected-floor-safety.mjs';
export const sizePairFiles=Object.freeze(['audience-catalog.mjs','audience-client.js','audience.html','design/team-identity-preflight.md','firm-scoped-snapshot.mjs','lab.html','scripts/audience-visual-ci.mjs','test/audience-client.test.mjs','test/audience-guide.test.mjs','test/firm-scoped-snapshot.test.mjs','test/legacy-disclosure.test.mjs']);
export function validateSizePairPins(pins){
 const expected={floor:{commit:'6e85c69d3f1883bb4d82f7a3624aaf03567a15c6',tree:'7ceb709a81039ef2ca1aea9717de0a35116388f2'},successor:{commit:'622786fc243e902a94f91801090f040fd924f399',tree:'222c2da97aa6a6e506dce8e4880abbd21fb45048'}};
 for(const phase of ['floor','successor'])for(const field of ['commit','tree'])if(pins?.[phase]?.[field]!==expected[phase][field])throw Error('Exact150/139 pins required');
 if(!Array.isArray(pins.allowedChangedFiles)||JSON.stringify([...pins.allowedChangedFiles].sort())!==JSON.stringify([...sizePairFiles].sort()))throw Error('Exact reviewed eleven-file allowlist required');
 return pins;
}
export function validateSizePairChanges(files,pins){
 validateSizePairPins(pins);
 if(JSON.stringify([...files].sort())!==JSON.stringify([...sizePairFiles].sort()))throw Error('Exact eleven-file150/139 source delta required');
}
export {parseIntegratedPairOutput,parseIntegratedPreflightOutput} from './integrated-pair-safety.mjs';
export function parseSizeBrowserOutput(output){
 const lines=output.trim().split(/\r?\n/).filter(l=>l.startsWith('SIZE_PAIR_BROWSER_RESULT:'));
 if(lines.length!==1||Buffer.byteLength(lines[0])>16384)throw Error('Unique bounded size browser proof required');
 const result=JSON.parse(lines[0].slice('SIZE_PAIR_BROWSER_RESULT:'.length));
 if(result.verified!==true||result.fullCompatibility!==false||result.automaticDownloads!==0||result.externalRequests!==0)throw Error('Size browser scope mismatch');
 for(const key of ['professionalPartnerSizeVerified','downloadIncludesRoleAndSize','sizeRemovalVerified','removedSizeDownloadVerified','floorProfessionalSizeAbsent','floorDownloadAbsent','floorWorkplaceFallbackVerified','keyboardDownloadVerified','fallbackVerified','safetyCautionsPreserved'])if(result[key]!==true)throw Error('Missing size browser proof: '+key);
 return result;
}
