import {stagingPage,stagingProspectScript} from './staging-ui.mjs';
import {readFileSync} from 'node:fs';
import {createHandler} from '../handler.mjs';
import {createResearchLab} from '../research-lab.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {restrictedStagingAuth} from './staging-config.mjs';
export const fictionalCSV='First Name,Last Name,Company,Title,Email,Country\nAlex,Fiction,Example Legal,Partner,alex@example.test,US\nSam,Sample,Example Engineering,Engineer,sam@example.test,US';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const deny=()=>{throw Error('External execution is disabled in fictional staging');};
const banner='<aside role="status"><strong>FICTIONAL STAGING · Owner-only · No production data.</strong> Use fictional information only. Provider searches, enrichment, invitations, team assignment and outreach are disabled. <a href="/staging-fixture.csv">Download fictional CSV</a>, then <a href="/prospect?import=1">preview and import it in Contacts</a>, select a contact and send it to Worklist to review the next action.</aside>';
const page=f=>stagingPage(read(f).replace('<body>','<body>'+banner));
const readPaths=new Set(['/','/health','/healthz','/version','/login','/auth/login.js','/logout','/brand.svg','/favicon.ico','/site.css','/lab','/lab-client.js','/lab.css','/prospect','/prospect-client.js','/prospect-jobs-client.js','/prospect.css','/audience','/audience-client.js','/audience-catalog.mjs','/audience.css','/staging-fixture.csv',...['me','contacts','lists','saved-searches','data-quality','daily-review','lead-costs'].map(p=>'/api/prospect/'+p),...['me','settings','sources','summary','worklist','leads','runs','scoreboard','advisor-profile','identity-reviews','historical-identity-reviews'].map(p=>'/api/lab/'+p)]);
export function stagingRouteAllowed(path,method){
 if(method==='GET')return readPaths.has(path)||/^\/api\/prospect\/(contacts|imports)\/[A-Za-z0-9_-]+$/.test(path)||/^\/api\/lab\/(leads|runs)\/[A-Za-z0-9_-]+(?:\/(activity|related))?$/.test(path);
 if(method==='POST')return ['/auth/session','/logout','/api/prospect/import','/api/prospect/import/preview','/api/prospect/export','/api/prospect/lists','/api/lab/contact-import','/api/lab/advisor-profile'].includes(path)||/^\/api\/prospect\/contacts\/[A-Za-z0-9_-]+\/(prepare|review)$/.test(path)||/^\/api\/lab\/leads\/[A-Za-z0-9_-]+\/(activity|review)$/.test(path)||/^\/api\/lab\/(historical-identity-reviews|identity-reviews)\/[A-Za-z0-9_-]+$/.test(path);
 if(method==='PATCH')return /^\/api\/prospect\/contacts\/[A-Za-z0-9_-]+$/.test(path);
 return false;
}
export function createAuthenticatedStaging({pool,auth,config,loginScript,clock=Date.now}){
 const gated=restrictedStagingAuth(auth,config,clock);
 const prospect=createProspectWorkspace({pool,checkDomain:deny});
 const lab=createResearchLab({pool,sources:{readiness:{web_search:false},quote:deny,run:deny,market:deny},dispatch:deny});
 const loginHtml='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional staging sign-in</title><link rel="stylesheet" href="/site.css"></head><body><main><h1>Fictional staging · approved owner only</h1><p>Separate test workspace. No invitations, signup form, real contacts or provider execution. Google authentication is real; only the explicitly approved owner UID can access the application.</p><button id="google">Sign in with Google</button><p id="status" role="status"></p></main><script type="module" src="/auth/login.js"></script></body></html>';
 const handler=createHandler({auth:gated,ownerEmail:'',origins:[config.origin],releaseId:'fictional-staging',lab,prospect,
 loginHtml,loginScript,siteStyle:read('site.css'),brandMark:read('brand.svg'),
 labPage:page('lab.html'),labScript:read('lab-client.js'),labStyle:read('lab.css'),
 prospectPage:page('prospect.html').replace('<option value="zoominfo">ZoomInfo export — no API required</option>','').replace('<option value="generic">','<option value="generic" selected>'),prospectScript:stagingProspectScript(read('prospect-client.js')),prospectStyle:read('prospect.css'),prospectJobsScript:read('prospect-jobs-client.js'),
 audienceAssets:{'/audience':page('audience.html'),'/audience-client.js':read('audience-client.js'),'/audience-catalog.mjs':read('audience-catalog.mjs'),'/audience.css':read('audience.css')}});
 const refused=(detail,status=403)=>Response.json({detail},{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  const url=new URL(request.url);
  if(clock()>=config.expires)return refused('Fictional staging has expired. No access or writes are allowed.',410);
  if(url.origin!==config.origin||(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==config.origin))return refused('Staging origin rejected.');
  if(!stagingRouteAllowed(url.pathname,request.method))return refused('This operation is disabled in fictional staging.');
  if(url.pathname==='/staging-fixture.csv'){
   const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__session='))?.slice(10);
   try{await gated.verifySessionCookie(cookie);}catch{return refused('Sign in as the approved staging owner.',401);}
   return new Response(fictionalCSV,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="fictional-staging.csv"','Cache-Control':'no-store'}});
  }
  if(request.method==='POST'&&['/api/prospect/import','/api/prospect/import/preview'].includes(url.pathname)){
   let input;try{input=await request.clone().json();}catch{return refused('Provide the supplied fictional CSV.',422);}
   if(input.csv?.replace(/\r\n/g,'\n').trim()!==fictionalCSV||input.format&&input.format!=='generic')return refused('This pilot accepts only the supplied fictional CSV. Real data imports are disabled.',422);
  }
  const response=await handler(request);
  response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Robots-Tag','noindex, nofollow');
  if(url.pathname==='/login')response.headers.set('Content-Security-Policy',`default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://${config.firebase.authDomain}; frame-src https://${config.firebase.authDomain}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
  return response;
 };
}
