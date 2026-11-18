// Synthetic actual-worker artifact rehearsal. No production rollout approval.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {validateTwoImageEnvironment,twoImageBaseTag,verifyTwoImageTagId,classifyTwoImageBuildFailure} from './two-image-safety.mjs';
export const workerFloor=Object.freeze({commit:'6e85c69d3f1883bb4d82f7a3624aaf03567a15c6',tree:'7ceb709a81039ef2ca1aea9717de0a35116388f2'});
export const workerCriticalFiles=Object.freeze(['rollback-worker.mjs','rollback-bootstrap.mjs','rollback-schema.mjs','scripts/rollback-schema034.json','generated/schema.sql','research-worker.mjs','research-jobs.mjs','legacy-identity-guard.mjs','historical-identities.mjs','identity-keyring.mjs','forget.mjs','prospect-data-quality.mjs','prospect-workspace.mjs','prospect-jobs.mjs','prospect-autopilot.mjs','research-lab.mjs','scripts/rollback-bootstrap-network-guard.mjs']);
export function parseWorkerBootstrapResult(output){
 const lines=output.trim().split(/\r?\n/).filter(l=>l.startsWith('WORKER_BOOTSTRAP_RESULT:'));
 if(lines.length!==1||Buffer.byteLength(lines[0])>16384)throw Error('Unique bounded worker result required');
 const result=JSON.parse(lines[0].slice('WORKER_BOOTSTRAP_RESULT:'.length));
 if(result.verified!==true||result.fullCompatibility!==false||result.networkDeniedOperations!==0||result.outbound_attempts!==0||result.idle_graceful_exit!==0||result.guard_loss_exit!==1)throw Error('Worker evidence scope mismatch');
 for(const key of ['incompatible035_refused','actual_rollback_worker_bootstrap','idle_loop_reached','legacy_queue_loop_reached','legacy_identity_guard_terminal_refusal','exclusive_migration_lock_blocked','worker_sessions_closed','unrelated_rows_preserved','reservations_preserved'])if(result[key]!==true)throw Error('Missing worker proof: '+key);
 return result;
}
export async function runWorkerBootstrap(env=process.env){
 const {url}=validateTwoImageEnvironment(env),root=fileURLToPath(new URL('..',import.meta.url));
 const nonce=randomBytes(12).toString('hex'),temp=await mkdtemp(join(tmpdir(),'pp-worker-'));
 const clean={PATH:env.PATH||'/usr/bin:/bin',HOME:temp};const containers=[],tags=[];let primary;
 const run=(bin,args,{input,timeout=60000,max=4*1024*1024,label=bin,build=false}={})=>new Promise((resolve,reject)=>{
  const child=spawn(bin,args,{cwd:root,env:clean,stdio:['pipe','pipe','pipe']});let chunks=[],size=0,failed=false,diagnostic='';
  const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},timeout);
  child.stdout.on('data',b=>{size+=b.length;if(size>max){failed=true;child.kill('SIGKILL');}else chunks.push(b);});
  child.stderr.on('data',b=>{if(build&&diagnostic.length<65536)diagnostic+=b.toString().slice(0,65536-diagnostic.length);size+=b.length;if(size>max){failed=true;child.kill('SIGKILL');}});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Synthetic command could not start: '+label));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0||failed)reject(Error('Synthetic command failed/bounded: '+label+(build?' ['+classifyTwoImageBuildFailure(diagnostic)+']':'')));else resolve(Buffer.concat(chunks));});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
 const docker=(args,opts={})=>run('docker',['--host','unix:///var/run/docker.sock',...args],{label:'docker '+args[0],...opts});
 try{
  for(const [kind,expected] of [['commit',workerFloor.commit],['tree',workerFloor.tree]])if((await run('git',['rev-parse',workerFloor.commit+'^{'+kind+'}'])).toString().trim()!==expected)throw Error('Exact worker floor pin mismatch');
  const context=join(temp,'base');await mkdir(context);
  const archive=await run('git',['archive','--format=tar',workerFloor.tree],{max:64*1024*1024});await run('tar',['-xf','-','-C',context],{input:archive});
  const iid=join(temp,'base.iid');await docker(['build','--target','rollback-runtime','--iidfile',iid,context],{timeout:1200000,max:32*1024*1024,label:'worker floor base build',build:true});
  const image=(await readFile(iid,'utf8')).trim();if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Invalid worker image ID');
  console.log(JSON.stringify({stage:'worker-base-built',...workerFloor,imageID:image}));
  const migrations=(await run('git',['ls-tree','-r','--name-only',workerFloor.tree,'migrations'])).toString().trim().split('\n').filter(Boolean);
  const files=[...workerCriticalFiles,...migrations],expected={};for(const file of files)expected[file]=createHash('sha256').update(await run('git',['show',workerFloor.tree+':'+file])).digest('hex');
  const program="const fs=require('node:fs'),c=require('node:crypto');const out={};for(const f of "+JSON.stringify(files)+")out[f]=c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');console.log(JSON.stringify(out));";
  const hashName='pp-worker-'+nonce+'-hash';containers.push(hashName);
  const actual=JSON.parse((await docker(['run','--name',hashName,'--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--network','none','--entrypoint','timeout',image,'--signal=TERM','--kill-after=5s','20s','node','-e',program],{timeout:30000,max:65536,label:'worker runtime hashes'})).toString());
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Actual worker image content mismatch');
  console.log(JSON.stringify({stage:'worker-runtime-hashes-verified',...workerFloor,imageID:image,hashesVerified:true,contentHashes:actual,generatedWorkerClaim:'built by pinned build process; not compared to tracked generated source'}));
  const overlay=join(temp,'overlay');await mkdir(overlay);await copyFile(join(root,'scripts/verify-rollback-worker-image.mjs'),join(overlay,'verify-rollback-worker-image.mjs'));
  const tag=twoImageBaseTag(nonce,'floor');tags.push(tag);await docker(['image','tag',image,tag]);
  const verifyTag=async()=>verifyTwoImageTagId((await docker(['image','inspect','--format','{{.Id}}',tag])).toString(),image);
  await verifyTag();await writeFile(join(overlay,'Dockerfile'),`FROM ${tag}\nCOPY verify-rollback-worker-image.mjs /app/scripts/\n`);
  const overlayIid=join(temp,'overlay.iid');await docker(['build','--pull=false','--iidfile',overlayIid,overlay],{timeout:120000,max:4*1024*1024,label:'worker instrumentation build',build:true});await verifyTag();
  const overlayImage=(await readFile(overlayIid,'utf8')).trim();if(!/^sha256:[a-f0-9]{64}$/.test(overlayImage))throw Error('Invalid worker overlay ID');
  const name='pp-worker-'+nonce+'-rehearsal';containers.push(name);
  const output=await docker(['run','--name',name,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=64m','--cap-drop=ALL','--security-opt','no-new-privileges','--network','host','-e','NODE_ENV=test','-e','HOME=/tmp','-e','GOOGLE_APPLICATION_CREDENTIALS=/tmp/no-credentials','-e','STAGING_DATABASE_URL='+url,'--entrypoint','timeout',overlayImage,'--signal=TERM','--kill-after=5s','240s','node','scripts/verify-rollback-worker-image.mjs','--synthetic-image'],{timeout:260000,max:65536,label:'actual worker bootstrap'});
  const result=parseWorkerBootstrapResult(output.toString());console.log(JSON.stringify({syntheticActualWorker:true,floor:workerFloor,imageID:image,overlayID:overlayImage,result,fullCompatibility:false}));
 }catch(error){primary=error;throw error;}finally{
  const failed=[];const attempt=async(label,fn)=>{try{await fn();}catch{failed.push(label);}};
  for(const name of containers)await attempt('container',()=>docker(['rm','-f',name]));
  for(const tag of tags)await attempt('local image tag',()=>docker(['image','rm',tag]));
  await attempt('temporary contexts',()=>rm(temp,{recursive:true,force:true}));
  if(failed.length){if(primary)console.error('Synthetic cleanup incomplete: '+failed.join(', '));else throw Error('Synthetic cleanup incomplete: '+failed.join(', '));}
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){if(process.argv.length!==3||process.argv[2]!=='--postgres')throw Error('Explicit --postgres required');await runWorkerBootstrap();}
