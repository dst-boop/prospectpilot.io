import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
// Build a separate in-memory bundle. Works as the image's unprivileged node user;
// never overwrite generated/login.js or depend on a writable application tree.
export async function buildStagingLogin(config){
 const result=await build({entryPoints:[fileURLToPath(new URL('./staging-login-client.mjs',import.meta.url))],bundle:true,format:'esm',minify:true,write:false,define:{STAGING_FIREBASE_CONFIG:JSON.stringify(config.firebase)}});
 if(result.outputFiles.length!==1)throw Error('Unexpected staging login build output');
 return Object.freeze({project:config.project,firebase:config.firebase,script:result.outputFiles[0].text});
}
