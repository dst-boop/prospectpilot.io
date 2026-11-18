// Local native-only diagnostic. Never production recovery approval.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {validateTwoImageEnvironment,validateTwoImagePins,validateTwoImageChanges,parseTwoImageOutput,twoImageBaseTag,verifyTwoImageTagId,classifyTwoImageBuildFailure} from './two-image-safety.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
if(process.argv.length!==3||process.argv[2]!=='--postgres')throw Error('Explicit --postgres required');
const {config,url}=validateTwoImageEnvironment(process.env);
const pins=validateTwoImagePins(JSON.parse(await readFile(new URL('./two-image-pins.json',import.meta.url),'utf8')));
const nonce=randomBytes(12).toString('hex'),schema='pp_two_'+nonce,key='synthetic-two-image-'+randomBytes(32).toString('hex');
const temp=await mkdtemp(join(tmpdir(),'pp-two-image-'));
const clean={PATH:process.env.PATH||'/usr/bin:/bin',HOME:temp};
const containers=[],images=[],tags=[];let primary;
function run(bin,args,{input,timeout=60000,max=4*1024*1024,cwd=root,label=bin,buildDiagnostic=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(bin,args,{cwd,env:clean,stdio:['pipe','pipe','pipe']});let chunks=[],size=0,failed=false,diagnostic='';
  const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},timeout);
  child.stdout.on('data',b=>{size+=b.length;if(size>max){failed=true;child.kill('SIGKILL');}else chunks.push(b);});
  child.stderr.on('data',b=>{if(buildDiagnostic&&diagnostic.length<65536)diagnostic+=b.toString().slice(0,65536-diagnostic.length);size+=b.length;if(size>max){failed=true;child.kill('SIGKILL');}});
  child.on('error',()=>{clearTimeout(timer);reject(Error('Synthetic command could not start: '+label));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0||failed)reject(Error('Synthetic command failed/bounded: '+label+(buildDiagnostic?' ['+classifyTwoImageBuildFailure(diagnostic)+']':'')));else resolve(Buffer.concat(chunks));});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
const docker=(args,opts={})=>run('docker',['--host','unix:///var/run/docker.sock',...args],{label:'docker '+args[0],...opts});
try{
 for(const pin of [pins.floor,pins.successor]){
  const commit=(await run('git',['rev-parse',pin.commit+'^{commit}'])).toString().trim();
  const tree=(await run('git',['rev-parse',pin.commit+'^{tree}'])).toString().trim();
  if(commit!==pin.commit||tree!==pin.tree)throw Error('Source pin mismatch');
 }
 const changed=(await run('git',['diff','--name-only',pins.floor.tree,pins.successor.tree])).toString().trim().split('\n').filter(Boolean);
 validateTwoImageChanges(changed,pins);
 const built={},contentHashes={};
 for(const phase of ['floor','successor']){
  const context=join(temp,phase);await mkdir(context);
  const archive=await run('git',['archive','--format=tar',pins[phase].tree],{max:64*1024*1024});
  await run('tar',['-xf','-','-C',context],{input:archive});
  const iid=join(temp,phase+'.iid');
  await docker(['build','--target','rollback-runtime','--iidfile',iid,context],{timeout:1200000,max:32*1024*1024,label:phase+' base build'});
  const id=(await readFile(iid,'utf8')).trim();if(!/^sha256:[a-f0-9]{64}$/.test(id))throw Error('Invalid image identity');
  built[phase]=id;images.push(id);
  console.log(JSON.stringify({stage:"base-built",phase,...pins[phase],imageID:id}));
 }
 for(const phase of ['floor','successor']){
  const files=['plan-catalog.mjs','research-lab.mjs','rollback-bootstrap.mjs','rollback-schema.mjs','scripts/rollback-bootstrap-network-guard.mjs'];
  const migrationFiles=(await run('git',['ls-tree','-r','--name-only',pins[phase].tree,'migrations'])).toString().trim().split('\n').filter(Boolean);files.push(...migrationFiles);
  const expected={};for(const file of files)expected[file]=createHash('sha256').update(await run('git',['show',pins[phase].tree+':'+file])).digest('hex');
  const program="const fs=require('node:fs'),c=require('node:crypto');const out={};for(const f of "+JSON.stringify(files)+")out[f]=c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');console.log(JSON.stringify(out));";
  const name='pp-two-'+nonce+'-hash-'+phase;containers.push(name);
  const actual=JSON.parse((await docker(['run','--name',name,'--read-only','--cap-drop=ALL','--security-opt','no-new-privileges','--network','none','--entrypoint','timeout',built[phase],'--signal=TERM','--kill-after=5s','20s','node','-e',program],{timeout:30000,max:65536,label:phase+' runtime content hashes'})).toString());
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Runtime content hash mismatch: '+phase);contentHashes[phase]=actual;
  console.log(JSON.stringify({stage:"runtime-hashes-verified",phase,...pins[phase],imageID:built[phase],hashesVerified:true,contentHashes:actual}));
 }
 if(built.floor===built.successor)throw Error('Independent images must differ');
 const overlays={};
 for(const phase of ['floor','successor']){
  const context=join(temp,phase+'-overlay');await mkdir(context);
  // Only test instrumentation is overlaid; never application/runtime modules.
  for(const file of ['two-image-phase.mjs'])await copyFile(join(root,'scripts',file),join(context,file));
  const tag=twoImageBaseTag(nonce,phase);tags.push(tag);
  await docker(['image','tag',built[phase],tag],{label:phase+' local base tag'});
  const verifyTag=async()=>verifyTwoImageTagId((await docker(['image','inspect','--format','{{.Id}}',tag],{label:phase+' local base identity'})).toString(),built[phase]);
  await verifyTag();
  await writeFile(join(context,'Dockerfile'),`FROM ${tag}\nCOPY two-image-phase.mjs /app/scripts/\n`);
  const iid=join(temp,phase+'-overlay.iid');await docker(['build','--pull=false','--iidfile',iid,context],{timeout:120000,max:4*1024*1024,label:phase+' instrumentation build',buildDiagnostic:true});
  await verifyTag();
  const id=(await readFile(iid,'utf8')).trim();if(!/^sha256:[a-f0-9]{64}$/.test(id))throw Error('Invalid overlay identity');overlays[phase]=id;images.push(id);
 }
 let receipt;
 const setup=new pg.Client({...config,statement_timeout:10000,query_timeout:12000});try{await setup.connect();await setup.query(`CREATE SCHEMA "${schema}"`);}finally{await setup.end();}
 let result;
 for(const phase of ['successor','floor']){
  const name='pp-two-'+nonce+'-'+phase;containers.push(name);
  const env={NODE_ENV:'test',HOME:'/tmp',GOOGLE_APPLICATION_CREDENTIALS:'/tmp/no-credentials',TWO_IMAGE_SYNTHETIC:'1',TWO_IMAGE_NONCE:nonce,TWO_IMAGE_SCHEMA:schema,TWO_IMAGE_KEY:key,STAGING_DATABASE_URL:url,PGHOST:'127.0.0.1',PGPORT:String(config.port),ROLLBACK_SYNTHETIC_BOOTSTRAP:'1'};
  const args=['run','--name',name,'-i','--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=64m','--cap-drop=ALL','--security-opt','no-new-privileges','--network','host',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','timeout',overlays[phase],'--signal=TERM','--kill-after=5s','180s','node','--import','./scripts/rollback-bootstrap-network-guard.mjs','scripts/two-image-phase.mjs','--'+phase];
  const output=await docker(args,{input:receipt?JSON.stringify(receipt):undefined,timeout:200000,max:65536,label:phase+' handler rehearsal'});
  const next=parseTwoImageOutput(output.toString(),{nonce,schema},phase);
  if(phase==='successor')receipt=next;else result=next;
 }
 console.log(JSON.stringify({syntheticTwoImage:true,fullCompatibility:false,productCompatibility:result?.productRegressionObserved?'known regression: floor drops distinct-EIN discovery review context':'not established',floor:pins.floor,successor:pins.successor,images:built,contentHashes,result}));
}catch(error){primary=error;throw error;}finally{
 const failed=[];const attempt=async(label,fn)=>{try{await fn();}catch{failed.push(label);}};
 for(const name of containers)await attempt('container',()=>docker(['rm','-f',name]));
 await attempt('schema',async()=>{const client=new pg.Client({...config,statement_timeout:10000,query_timeout:12000});try{await client.connect();await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await client.end();}});
 for(const tag of tags)await attempt('local image tag',()=>docker(['image','rm',tag],{label:'remove run-owned local tag'}));
 // Image cleanup targets only IDs created by this run; no global prune.
 // Base IDs can be shared with Docker's cache, so leave immutable images cached.
 await attempt('temporary contexts',()=>rm(temp,{recursive:true,force:true}));
 if(failed.length){if(primary)console.error('Synthetic cleanup incomplete: '+failed.join(', '));else throw Error('Synthetic cleanup incomplete: '+failed.join(', '));}
}
