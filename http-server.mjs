import {candidateOrigin,READINESS_PATH} from './release-readiness.mjs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

class HttpFailure extends Error {constructor(status,message){super(message);this.status=status;}}
export function createHttpHandler(handler,{maxBodyBytes=5_000_000,maxInflight=40,logger=console,releaseCheckOrigin=''}={}) {
  const candidate=candidateOrigin(releaseCheckOrigin);
  const candidateHost=candidate?new URL(candidate).hostname:null;
  let active=0;
  return async(req,res)=>{
    const reject=(status,message)=>{res.writeHead(status,{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','Connection':'close',...(status===503?{'Retry-After':'5'}:{})});res.end(message);res.once('finish',()=>req.destroy());};
    if(active>=maxInflight){reject(503,'Server is busy. Please retry shortly.');return;}
    active++;
    const abort=new AbortController();
    const disconnect=()=>{if(!res.writableFinished)abort.abort();};
    req.once('aborted',disconnect);res.once('close',disconnect);
    try{
      const rawHost=String(req.headers.host||'').trim();
      let rawHostname;
      try{
        const parsedHost=new URL('https://'+rawHost);
        if(!rawHost||/[\s/\\?#@]/.test(rawHost)||parsedHost.username||parsedHost.password||parsedHost.pathname!=='/'||parsedHost.search||parsedHost.hash)throw Error('Invalid host');
        rawHostname=parsedHost.hostname.replace(/\.$/,'');
      }catch{if(candidateHost)throw new HttpFailure(400,'Invalid request address.');}
      const candidateRequest=!!candidateHost&&rawHostname===candidateHost;
      // Firebase Hosting forwarding is retained except on the isolated candidate.
      const host=candidateRequest?candidateHost:String(req.headers['x-forwarded-host']||rawHost).split(',')[0].trim();
      if(!host||!req.url?.startsWith('/')||req.url.startsWith('//')||req.url.includes('\\'))throw new HttpFailure(400,'Invalid request address.');
      let url;try{url=new URL(req.url,'https://'+host);}catch{throw new HttpFailure(400,'Invalid request address.');}
      if(candidateRequest&&!((url.pathname===READINESS_PATH&&req.method==='GET')||(['/health','/healthz'].includes(url.pathname)&&['GET','HEAD'].includes(req.method))))throw new HttpFailure(403,'Release readiness unavailable.');
      const length=req.headers['content-length'];
      if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>maxBodyBytes))throw new HttpFailure(413,'File exceeds 5 MB.');
      const chunks=[];let size=0;
      for await(const chunk of req.iterator({destroyOnReturn:false})){
        size+=chunk.length;if(size>maxBodyBytes)throw new HttpFailure(413,'File exceeds 5 MB.');chunks.push(chunk);
      }
      const init={method:req.method,headers:req.headers,signal:abort.signal};
      if(size&&req.method!=='GET'&&req.method!=='HEAD')init.body=chunks.length===1?chunks[0]:Buffer.concat(chunks,size);
      const response=await handler(new Request(url,init));
      const headers=Object.fromEntries(response.headers);
      const cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies;
      res.writeHead(response.status,headers);
      // Backpressure avoids creating a second full-size response buffer.
      if(req.method==='HEAD'||!response.body){await response.body?.cancel();res.end();}
      else await pipeline(Readable.fromWeb(response.body),res,{signal:abort.signal});
    }catch(error){
      if(abort.signal.aborted||res.destroyed)return;
      logger.error(JSON.stringify({event:'request_failed',name:error.name,status:error.status||500}));
      if(res.headersSent)res.destroy();else reject(error.status||500,error.status?error.message:'The request could not be completed.');
    }finally{active--;req.off('aborted',disconnect);res.off('close',disconnect);}
  };
}

export function shutdown(server,pool,{graceMs=8500,logger=console}={}) {
  // Cloud Run has a short SIGTERM grace period; never wait forever for crawlers.
  return new Promise(resolve=>{
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;clearTimeout(deadline);resolve();};
    const deadline=setTimeout(()=>{server.closeAllConnections();logger.warn('Shutdown grace period expired');finish();},graceMs);
    server.close(()=>{Promise.resolve().then(()=>pool.end()).catch(error=>logger.error(JSON.stringify({event:'pool_shutdown_failed',name:error.name}))).finally(finish);});
    server.closeIdleConnections();
  });
}
