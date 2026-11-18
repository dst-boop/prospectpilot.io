import {testerPage,testerProspectScript,testerLabScript} from './staging-tester-ui.mjs';
import {fictionalCSV,fixtureDownloads,allowedStagingCSV} from './staging-fixtures.mjs';
export {fictionalCSV} from './staging-fixtures.mjs';
import {stagingLogoutPage,stagingLogoutScript} from './staging-logout.mjs';
import {stagingPage,stagingProspectScript,stagingUIScript,stagingUIStyle} from './staging-ui.mjs';
import {readFileSync} from 'node:fs';
import {createHandler} from '../handler.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {stagingTesterRouteAllowed} from './staging-tester-policy.mjs';
import {restrictedStagingAuth} from './staging-config.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const deny=()=>{throw Error('External execution is disabled in fictional staging');};
const banner='<aside role="status"><strong>FICTIONAL STAGING · Owner-only · No production data.</strong> Use fictional information only. Provider searches, enrichment, invitations, team assignment and outreach are disabled. <a href="/staging-fixture.csv">Download fictional CSV</a>, then <a href="/prospect?import=1">preview and import it in Contacts</a>, select a contact and send it to Worklist to review the next action.</aside>';
const page=f=>stagingPage(read(f).replace('<body>','<body>'+banner));
const readPaths=new Set(['/staging-logout.js','/staging-ui.js','/staging-ui.css','/','/health','/healthz','/version','/login','/auth/login.js','/logout','/brand.svg','/favicon.ico','/site.css','/lab','/lab-client.js','/lab.css','/prospect','/prospect-client.js','/prospect-jobs-client.js','/prospect.css','/audience','/audience-client.js','/audience-catalog.mjs','/audience.css','/staging-fixture.csv','/staging-fixture-large.csv',...['me','contacts','lists','saved-searches','data-quality','daily-review','lead-costs'].map(p=>'/api/prospect/'+p),...['me','settings','sources','summary','worklist','leads','runs','scoreboard','advisor-profile','identity-reviews','historical-identity-reviews'].map(p=>'/api/lab/'+p)]);
export function stagingRouteAllowed(path,method){
 if(method==='GET')return readPaths.has(path)||/^\/api\/prospect\/(contacts|imports)\/[A-Za-z0-9_-]+$/.test(path)||/^\/api\/lab\/(leads|runs)\/[A-Za-z0-9_-]+(?:\/(activity|related))?$/.test(path);
 if(method==='POST')return ['/auth/session','/logout','/api/prospect/import','/api/prospect/import/preview','/api/prospect/export','/api/prospect/lists','/api/lab/contact-import','/api/lab/advisor-profile'].includes(path)||/^\/api\/prospect\/contacts\/[A-Za-z0-9_-]+\/(prepare|review)$/.test(path)||/^\/api\/lab\/leads\/[A-Za-z0-9_-]+\/(activity|review)$/.test(path)||/^\/api\/lab\/(historical-identity-reviews|identity-reviews)\/[A-Za-z0-9_-]+$/.test(path);
 if(method==='PATCH')return /^\/api\/prospect\/contacts\/[A-Za-z0-9_-]+$/.test(path);
 return false;
}
export function createAuthenticatedStaging({pool,auth,config,loginScript,clock=Date.now}){
 const gated=restrictedStagingAuth(auth,config,clock);
 const prospect=createProspectWorkspace({pool,checkDomain:deny});
 const lab=createResearchLab({pool,sources:{readiness:{web_search:false},quote:deny,run:deny,market:deny},dispatch:deny,isolateCandidateOwners:true});
 const pilotCopy=text=>config.testers?.length?text.replaceAll('Owner-only','Approved accounts only').replaceAll('approved owner only','approved accounts only').replaceAll('only the explicitly approved owner UID','only explicitly approved, verified identities'):text;
 const loginHtml=pilotCopy('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional staging sign-in</title><link rel="stylesheet" href="/site.css"></head><body><main><h1>Fictional staging · approved owner only</h1><p>Separate test workspace. No invitations, signup form, real contacts or provider execution. Google authentication is real; only the explicitly approved owner UID can access the application.</p><button id="google">Sign in with Google</button><p id="status" role="status"></p></main><script type="module" src="/auth/login.js"></script></body></html>');
 const handler=createHandler({auth:gated,ownerEmail:'',origins:[config.origin],releaseId:'fictional-staging',lab,prospect,
 loginHtml,loginScript,siteStyle:read('site.css'),brandMark:read('brand.svg'),
 labPage:pilotCopy(page('lab.html')),labScript:read('lab-client.js'),labStyle:read('lab.css'),
 prospectPage:pilotCopy(page('prospect.html')).replace('<option value="zoominfo">ZoomInfo export — no API required</option>','').replace('<option value="generic">','<option value="generic" selected>'),prospectScript:stagingProspectScript(read('prospect-client.js')),prospectStyle:read('prospect.css'),prospectJobsScript:read('prospect-jobs-client.js'),
 audienceAssets:{'/audience':pilotCopy(page('audience.html')),'/audience-client.js':read('audience-client.js'),'/audience-catalog.mjs':read('audience-catalog.mjs'),'/audience.css':read('audience.css')}});
 const refused=(detail,status=403)=>Response.json({detail},{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  const url=new URL(request.url);let testerView=false;
  if(clock()>=config.expires)return refused('Fictional staging has expired. No access or writes are allowed.',410);
  if(url.origin!==config.origin||(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==config.origin))return refused('Staging origin rejected.');
  if(!stagingRouteAllowed(url.pathname,request.method))return refused('This operation is disabled in fictional staging.');
  // Authorize the actual session UID before applying tester-only restrictions.
  // No UID substitution: downstream owner-scoped SQL receives the verified UID.
  {
   const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__session='))?.slice(10);
   const authenticationEntry=(request.method==='GET'&&['/login','/auth/login.js','/site.css','/brand.svg','/favicon.ico'].includes(url.pathname))||(request.method==='POST'&&['/auth/session','/logout'].includes(url.pathname));
   if(!authenticationEntry&&(cookie||url.pathname.startsWith('/api/'))){
    let identity;try{identity=await gated.verifySessionCookie(cookie);}catch{return refused('Sign in to ProspectPilot.',401);}
    {
     testerView=identity.uid!==config.uid;
     if(identity.uid!==config.uid&&!stagingTesterRouteAllowed(url.pathname,request.method))return refused('This operation is disabled for pilot testers.');
     // Existing admin rights or incoming team shares must not expand any pilot identity.
     if(url.pathname.startsWith('/api/')&&(await pool.query("SELECT 1 FROM prospect_list_shares WHERE recipient_uid=$1 UNION ALL SELECT 1 FROM discovery_users WHERE user_id=$1 AND role='admin' LIMIT 1",[identity.uid])).rows.length)return refused('Pilot account isolation requires review.');
    }
   }
  }
  if(request.method==='GET'&&['/logout','/staging-logout.js','/staging-fixture.csv','/staging-fixture-large.csv','/staging-ui.js','/staging-ui.css'].includes(url.pathname)){
   const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__session='))?.slice(10);
   try{await gated.verifySessionCookie(cookie);}catch{return refused('Sign in as the approved staging owner.',401);}
   if(url.pathname==='/logout')return new Response(stagingLogoutPage,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
   if(url.pathname==='/staging-logout.js')return new Response(stagingLogoutScript,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   if(!fixtureDownloads.has(url.pathname))return new Response(url.pathname.endsWith('.js')?stagingUIScript:stagingUIStyle,{headers:{'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   const fixture=fixtureDownloads.get(url.pathname);
   return new Response(fixture.csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+fixture.filename+'"','Cache-Control':'no-store'}});
  }
  if(request.method==='POST'&&['/api/prospect/import','/api/prospect/import/preview'].includes(url.pathname)){
   let input;try{input=await request.clone().json();}catch{return refused('Provide the supplied fictional CSV.',422);}
   if(!allowedStagingCSV(input?.csv)||input?.format&&input.format!=='generic')return refused('This pilot accepts only either supplied unchanged fictional CSV. Real data imports are disabled.',422);
  }
  let response=await handler(request);
  // Presentation is selected only from this request's verified server identity.
  // Client flags, query parameters and custom role claims never select authority.
  if(testerView&&request.method==='GET'&&response.status===200){
   const transform=['/prospect','/lab','/audience'].includes(url.pathname)?testerPage:url.pathname==='/prospect-client.js'?testerProspectScript:url.pathname==='/lab-client.js'?testerLabScript:null;
   if(transform)response=new Response(transform(await response.text()),{status:response.status,headers:response.headers});
  }
  response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Robots-Tag','noindex, nofollow');
  if(url.pathname==='/login')response.headers.set('Content-Security-Policy',`default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://${config.firebase.authDomain}; frame-src https://${config.firebase.authDomain}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  return response;
 };
}
