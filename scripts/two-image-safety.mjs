// Synthetic, disposable PostgreSQL only. These checks do not authorize deployment.
import {validateStagingDatabaseUrl} from '../test/helpers/staging-database.mjs';
export function validateTwoImageEnvironment(env){
 if(env.NODE_ENV==='production')throw Error('Two-image rehearsal refuses production');
 if(Object.entries(env).some(([k,v])=>/^DOCKER_/i.test(k)&&v))throw Error('Inherited Docker overrides forbidden');
 const config=validateStagingDatabaseUrl(env);
 if(!config||config.host!=='127.0.0.1')throw Error('Explicit literal loopback disposable PostgreSQL required');
 return {config,url:env.STAGING_DATABASE_URL||env.POSTGRES_TEST_URL};
}
export function validateTwoImagePins(pins){
 for(const name of ['floor','successor'])for(const field of ['commit','tree'])if(!/^[a-f0-9]{40}$/.test(pins?.[name]?.[field]||''))throw Error('Exact commit and tree pins required');
 if(pins.floor.commit===pins.successor.commit||pins.floor.tree===pins.successor.tree)throw Error('Distinct source trees required');
 if(!Array.isArray(pins.allowedChangedFiles)||!pins.allowedChangedFiles.length||pins.allowedChangedFiles.some(f=>typeof f!=='string'||f.split('/').includes('..')||!(/^(plan-catalog\.mjs|research-lab\.mjs|lab-client\.js|\.github\/workflows\/tests\.yml|scripts\/verify-pinned034-upgrade\.mjs|test\/[a-zA-Z0-9/_.-]+\.mjs|[A-Z0-9_-]+\.md)$/.test(f))))throw Error('Only explicit product files/tests/docs may differ');
 return pins;
}
export function validateTwoImageChanges(files,pins){
 validateTwoImagePins(pins);
 if(!['plan-catalog.mjs','research-lab.mjs'].every(f=>files.includes(f))||files.some(f=>!pins.allowedChangedFiles.includes(f)))throw Error('Unexpected source delta or missing genuine product change');
}
export function parseTwoImageOutput(output,{nonce,schema},phase='successor'){
 const lines=output.trim().split(/\r?\n/);
 if(lines.filter(l=>l==='SYNTHETIC_BOOTSTRAP_NETWORK_GUARD_INSTALLED').length!==1)throw Error('Missing unique network guard installation');
 const guards=lines.filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return {};}}).filter(x=>x.synthetic_bootstrap_network_guard===true);
 if(guards.length!==1||guards[0].denied_operations!==0)throw Error('Network guard receipt failed');
 const prefix=phase==='floor'?'TWO_IMAGE_RESULT:':'TWO_IMAGE_RECEIPT:';
 const receipts=lines.filter(l=>l.startsWith(prefix));
 if(receipts.length!==1||Buffer.byteLength(receipts[0])>16384)throw Error('Invalid receipt bound/count');
 const receipt=JSON.parse(receipts[0].slice(prefix.length));
 if(phase==='floor'){if(receipt.verified!==true||receipt.nonce!==nonce||receipt.schema!==schema||receipt.external_calls!==0||receipt.fullCompatibility!==false)throw Error('Floor result mismatch');return receipt;}
 if(Object.keys(receipt).sort().join(',')!=='digest,nonce,schema,version'||receipt.version!==1||receipt.nonce!==nonce||receipt.schema!==schema||!/^[a-f0-9]{64}$/.test(receipt.digest||''))throw Error('Receipt identity mismatch');
 return receipt;
}
// Run-owned tags are aliases only; never clean up a shared content-addressed ID.
export function twoImageBaseTag(nonce,phase){
 if(!/^[a-f0-9]{24}$/.test(nonce)||!['floor','successor'].includes(phase))throw Error('Invalid local image tag identity');
 return `pp-two-image-${nonce}-${phase}:synthetic`;
}
export function verifyTwoImageTagId(actual,expected){
 if(!/^sha256:[a-f0-9]{64}$/.test(expected)||actual.trim()!==expected)throw Error('Local base tag does not match pinned image ID');
}
export function classifyTwoImageBuildFailure(stderr){
 // Return fixed categories only, never arbitrary daemon output or build arguments.
 if(/pull access denied|failed to resolve source metadata|failed to resolve reference|repository does not exist/i.test(stderr))return 'base-resolution';
 if(/invalid reference format|invalid tag/i.test(stderr))return 'invalid-reference';
 if(/no space left on device/i.test(stderr))return 'storage-capacity';
 if(/cannot connect to the docker daemon|is the docker daemon running/i.test(stderr))return 'daemon-unavailable';
 return 'unspecified';
}
