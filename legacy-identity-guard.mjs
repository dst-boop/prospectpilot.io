// Schema 034 historical-identity protection has no safe legacy write adapter.
// Keep reads and non-identity settings/export paths; do not pretend feature parity.
export function isLegacyIdentityMutation(request){
 const method=request.method.toUpperCase();if(['GET','HEAD','OPTIONS'].includes(method))return false;
 let path=new URL(request.url).pathname;try{path=decodeURIComponent(path);}catch{return true;}
 path=path.replace(/\/+$/,'')||'/';
 if(path==='/api/v3/discovery'||path.startsWith('/api/v3/discovery/')){
  if(method==='POST'&&(['/api/v3/discovery/source-discovery','/api/v3/discovery/export/salesforce','/api/v3/discovery/export/zoominfo'].includes(path)||/^\/api\/v3\/discovery\/campaigns\/[^/]+\/export-companies$/.test(path)))return false;
  return true;
 }
 if(path==='/api/enrichment'||path.startsWith('/api/enrichment/'))return !(path==='/api/enrichment/export'&&method==='POST');
 if(path==='/api/research'||path.startsWith('/api/research/'))return true;
 if(path==='/api/wealthfeed'||path.startsWith('/api/wealthfeed/'))return !(method==='POST'&&['/api/wealthfeed/connect','/api/wealthfeed/disconnect'].includes(path));
 // Legacy call saving rewrites an entire lead payload without the new locks.
 if(path==='/api/beta/calls')return true;
 return false;
}
export async function fetchLegacySafely(worker,request,env){
 if(isLegacyIdentityMutation(request))return Response.json({detail:'This legacy write is paused because it cannot preserve historical identity restrictions. Use /prospect for contact imports, edits and enrichment, or /lab for lead work and identity review. Legacy assignment, bulk deletion and provider-specific workflows do not have full replacement parity yet.'},{status:409,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 return worker.fetch(request,env);
}
