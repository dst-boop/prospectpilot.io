const responseJSON=(detail,status)=>Response.json({detail},{status,headers:{'Cache-Control':'no-store'}});
export function createHandler({auth,db,worker,loginHtml,loginScript,ownerEmail,origins,providerKey='',linkedin,nativeResearch,warn,warnPage,warnScript,researchJobs,lab,labPage,labScript,labStyle,releaseId=''}) {
  const allowed=new Set(origins);
  const authorized=claims=>claims.email_verified===true&&String(claims.email||'').toLowerCase()===ownerEmail.toLowerCase()&&claims.firebase?.sign_in_provider==='google.com';
  return async request=>{
    const url=new URL(request.url);
    if(url.pathname==='/healthz')return new Response('ok');
    if(!allowed.has(url.origin))return responseJSON('Use the ProspectPilot website address.',403);
    if(url.pathname==='/version'&&request.method==='GET')return Response.json({application:'ProspectPilot',feature_set:lab?'research-lab-v1':'legacy',release_id:releaseId},{headers:{'Cache-Control':'no-store'}});
    const mutates=!['GET','HEAD','OPTIONS'].includes(request.method);
    if(mutates&&request.headers.get('origin')!==url.origin)return responseJSON('Please submit changes from this website.',403);
    if(url.pathname==='/login'&&request.method==='GET')return new Response(loginHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    if(url.pathname==='/auth/login.js'&&request.method==='GET')return new Response(loginScript,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
    if(url.pathname==='/auth/session'&&request.method==='POST'){
      let claims,idToken;try{({idToken}=await request.json());claims=await auth.verifyIdToken(idToken,true);}catch{return responseJSON('Google sign-in could not be verified.',401);}
      if(!authorized(claims))return responseJSON('This account has not been granted access to ProspectPilot.',403);
      if(!Number.isFinite(claims.auth_time)||Math.abs(Date.now()/1000-claims.auth_time)>300)return responseJSON('Please sign in again.',401);
      const expiresIn=8*60*60*1000;
      const body=await auth.createSessionCookie(idToken,{expiresIn});
      return new Response('{}',{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`__session=${body}; Max-Age=${expiresIn/1000}; Path=/; HttpOnly; Secure; SameSite=Lax`}});
    }
    if(url.pathname==='/logout'){
      if(request.method==='POST')return new Response(null,{status:303,headers:{Location:'/login','Cache-Control':'no-store','Set-Cookie':'__session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'}});
      return new Response('<form method="post"><button>Sign out of ProspectPilot</button></form>',{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}});
    }
    const cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__session='))?.slice(10);
    let claims;if(cookie){try{claims=await auth.verifySessionCookie(cookie,true);}catch{}}
    if(!claims||!authorized(claims))return url.pathname.startsWith('/api/')?responseJSON('Sign in to ProspectPilot.',401):new Response(null,{status:303,headers:{Location:'/login','Cache-Control':'no-store'}});
    if(lab && ['/', '/lab','/lab-client.js','/lab.css'].includes(url.pathname) && request.method==='GET') {
      const script=url.pathname==='/lab-client.js',style=url.pathname==='/lab.css';
      return new Response(script?labScript:style?labStyle:labPage,{headers:{'Content-Type':script?'text/javascript; charset=utf-8':style?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
    }
    if(lab && url.pathname.startsWith('/api/lab/')) {
      try {const result=await lab.route(request,claims);const response=result instanceof Response?result:Response.json(result);response.headers.set('Cache-Control','private, no-store');response.headers.set('X-Content-Type-Options','nosniff');return response;}
      catch(error){return responseJSON(error.status?error.message:'Research could not be completed. Please retry.',error.status||500);}
    }
    if(warn&&url.pathname==='/warn'&&request.method==='GET')return new Response(warnPage,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    if(warn&&url.pathname==='/warn-client.js'&&request.method==='GET')return new Response(warnScript,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
    if(warn&&url.pathname==='/api/warn'&&request.method==='GET'){try{return Response.json(await warn.query(Object.fromEntries(url.searchParams)),{headers:{'Cache-Control':'no-store'}});}catch{return responseJSON('WARN feeds are unavailable. Please retry.',503);}}
    if(linkedin&&(url.pathname==='/settings/linkedin'||url.pathname.startsWith('/api/linkedin/')||url.pathname.startsWith('/auth/linkedin/')))return linkedin(request,claims,cookie);
    const headers=new Headers(request.headers);
    for(const key of [...headers.keys()])if(key.startsWith('oai-'))headers.delete(key);
    headers.set('oai-authenticated-user-id',claims.uid);
    headers.set('oai-authenticated-user-email',claims.email.toLowerCase());
    headers.set('oai-authenticated-user-full-name',encodeURIComponent(claims.name||claims.email));
    headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
    const next=new Request(request,{headers});
    const result=await worker.fetch(next,{DB:db,PROVIDER_ENCRYPTION_KEY:providerKey,NATIVE_RESEARCH:nativeResearch,RESEARCH_JOBS:researchJobs});
    const output=new Response(result.body,result);output.headers.set('Cache-Control','private, no-store');output.headers.set('X-Content-Type-Options','nosniff');
    return output;
  };
}
