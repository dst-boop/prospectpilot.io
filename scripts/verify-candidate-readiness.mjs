import {open,constants,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {candidateOrigin,READINESS_PATH,RELEASE_SCHEMA_VERSION} from '../release-readiness.mjs';
const failure=()=>new Error('Candidate readiness verification failed.');
export async function readReleaseSession(file,{platform=process.platform,uid=process.getuid?.()}={}){
  if(!file)throw failure();
  let handle;
  try{
    const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
    const path=resolve(file instanceof URL?fileURLToPath(file):file);
    // Reject symlinked ancestors as well as the leaf; open the checked canonical path.
    for(let parent=dirname(path);;parent=dirname(parent)){
      if((await lstat(parent)).isSymbolicLink())throw failure();
      if(parent===dirname(parent))break;
    }
    const initial=await lstat(path);
    if(initial.isSymbolicLink()||!initial.isFile())throw failure();
    const actual=await realpath(path),within=relative(root,actual);
    if(within===''||(!within.startsWith('..'+(process.platform==='win32'?'\\':'/'))&&!isAbsolute(within)))throw failure();
    handle=await open(actual,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
    const stat=await handle.stat();
    if(stat.dev!==initial.dev||stat.ino!==initial.ino||await realpath(path)!==actual)throw failure();
    if(!stat.isFile()||stat.nlink!==1||stat.size<1||stat.size>16384||(platform!=='win32'&&((stat.mode&0o077)!==0||stat.uid!==uid)))throw failure();
    const buffer=Buffer.alloc(16385);
    const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
    const value=buffer.subarray(0,bytesRead).toString('utf8');
    // Only the cookie value, never a Cookie header or a browser cookie export.
    if(!/^[A-Za-z0-9_\-.]+$/.test(value)||value.length>16384)throw failure();
    return value;
  }catch{throw failure();}finally{await handle?.close();}
}
export async function verifyCandidateReadiness(origin,releaseId,{sessionFile=process.env.RELEASE_SESSION_FILE,fetchImpl=fetch,readSession=readReleaseSession}={}){
  if(!candidateOrigin(origin)||typeof releaseId!=='string'||!releaseId||/[\x00-\x20\x7f]/.test(releaseId))throw failure();
  const session=await readSession(sessionFile);
  try{
    const response=await fetchImpl(origin+READINESS_PATH,{method:'GET',headers:{Cookie:'__session='+session,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(response.status!==200||response.redirected||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw failure();
    // Limit the body independently of any untrusted Content-Length header.
    const reader=response.body?.getReader();if(!reader)throw failure();
    let bytes=0,text='';const decoder=new TextDecoder();
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096)throw failure();text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
    const body=JSON.parse(text);
    if(!body||Object.keys(body).sort().join(',')!=='ready,release_id,schema_version'||body.ready!==true||body.release_id!==releaseId||body.schema_version!==RELEASE_SCHEMA_VERSION)throw failure();
    return true;
  }catch{throw failure();}
}
export async function main(args=process.argv.slice(2),{log=console.log,error=console.error,...options}={}){
  try{
    if(args.length===1&&args[0]==='--preflight')await readReleaseSession(options.sessionFile??process.env.RELEASE_SESSION_FILE);
    else if(args.length===2)await verifyCandidateReadiness(args[0],args[1],options);
    else throw failure();
    log(args[0]==='--preflight'?'Release session preflight passed.':'Candidate readiness verified.');return 0;
  }catch{error('Candidate readiness verification failed.');return 1;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)process.exitCode=await main();
