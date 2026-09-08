// Local synthetic demonstration only. Production continues to use server.mjs,
// Firebase authentication, Cloud SQL, and the real source adapters.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createResearchLab} from '../research-lab.mjs';
import {createHttpHandler} from '../http-server.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createProspectJobs} from '../prospect-jobs.mjs';
if(process.env.NODE_ENV==='production')throw Error('The synthetic demo cannot run in production. Use pnpm start.');
const port=Number(process.env.DEMO_PORT||8088);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid DEMO_PORT.');
const origin=`http://127.0.0.1:${port}`,db=new PGlite();
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
await db.exec(read('generated/schema.sql'));
await db.exec(read('migrations/006-research-lab.sql'));
await db.exec(read('migrations/007-quality-v2.sql'));
await db.exec(read('migrations/008-prospect-workspace.sql'));
await db.exec(read('migrations/009-prospect-jobs.sql'));
// Serialize requests because this embedded database has a single connection.
const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
const user={uid:'synthetic-demo',email:'research@example.com',name:'Synthetic demonstration'};
const demoRecord={first_name:'Avery',last_name:'Sample',company:'Example Manufacturing',title:'Operations Director',email:'avery@example.com',country:'US',state:'NY',city:'Albany',industry:'Manufacturing',seniority:'Director',phone:'+12125550188'};
const demoProviders={readiness:{search:true,enrichment:true,email_verification:true,demo:true},search:async filters=>{const records=Object.entries(filters).filter(([key,value])=>value&&['company','title','country','state','city','industry','seniority'].includes(key)).every(([key,value])=>String(demoRecord[key]).toLowerCase().includes(String(value).toLowerCase()))?[demoRecord]:[];return {contacts:records,total:records.length,retrieved:records.length,scroll_token:''};},enrich:async contact=>({contact:{...contact,phone:contact.phone||'+12125550188'},checked_at:new Date().toISOString()}),verifyEmail:async contact=>({email:contact.email,status:contact.email?.endsWith('@example.com')?'valid':'unknown',provider:'synthetic-demo',provider_status:'synthetic',checked_at:new Date().toISOString()})};
const prospectJobs=createProspectJobs({pool,providers:demoProviders,config:{dailyBudgetMicros:1000000,prices:{search:1000,enrich:1000,verify:1000}},pacingMs:{pdl:0,hunter:0},dispatch:async()=>true});
const prospect=createProspectWorkspace({pool,jobs:prospectJobs});
await prospect.importCSV(user,{source:'Synthetic demo fixtures',csv:'First Name,Last Name,Company,Title,Email,Phone,Country,State,City,Industry,Seniority\nJamie,Rivera,Example Manufacturing,Operations Director,jamie@example.com,2125551234,US,NY,Albany,Manufacturing,Director\nMorgan,Chen,Example Services,Engineering Manager,morgan@example.com,,US,CA,San Diego,Technology,Manager\nCasey,Ellis,Example Systems,VP of Sales,casey@example.com,,US,TX,Austin,Software,VP'});
await prospect.createList(user,{name:'My first prospect list'});
const lab=createResearchLab({pool,sources:{readiness:{},quote:()=>0,run:async()=>({status:'skipped',errors:['Synthetic demo: no external provider calls.'],candidates:[]})}});
const imported=await lab.importCSV(user,{source:'Synthetic fixtures',csv:'First Name,Last Name,Company,Title,Email,Estimated Age Range,Country\nJamie,Rivera,Example Manufacturing,Director,jamie@example.com,62,US\nMorgan,Chen,Example Services,Manager,morgan@example.com,50,US\nCasey,Ellis,Example Systems,Engineer,casey@example.com,60,US\nTaylor,Brooks,Example Logistics,Manager,taylor@example.com,74,US'});
const values={age:{min:62,max:62},residence:{country:'US',scope:'residence'},retirement:{account_type:'rollover_ira',route:'trustee_transfer',destination_type:'traditional_ira',assets_confirmed:true,individual:true,eligible_distribution:true,evidence_basis:'participant_disclosure',consent_confirmed:true},contact:{channel:'email',address:'jamie@example.com',identity_confirmed:true},net_worth:{lower_bound_usd:250000,excludes_home:true,net_of_liabilities:true,evidence_basis:'participant_disclosure',consent_confirmed:true}};
for(const {lead} of (await lab.list(user)).leads){
  const detail=await lab.detail(user,lead.id);
  for(const [field,value] of Object.entries(values)){
    if(lead.first_name!=='Jamie' && field!=='age')continue;
    await lab.review(user,lead.id,{field,value:field==='age'?{min:Number(lead.estimated_age_range),max:Number(lead.estimated_age_range)}:value,verdict:'confirmed',source:'Synthetic fixture — not a real disclosure',note:'Fictional information used only to demonstrate the workflow.',observed_at:new Date().toISOString(),identity_signature:detail.quality.identity_signature});
  }
}
await lab.cost(user,{run_id:imported.run.id,category:'labor',amount_micros:12000000,note:'Synthetic cost example, not actual spending',idempotency_key:'fixture-cost'});
const assets=new Map([['/lab-client.js',['text/javascript',read('lab-client.js')]],['/lab.css',['text/css',read('lab.css')]]]);
assets.set('/prospect-client.js',['text/javascript',read('prospect-client.js')]);assets.set('/prospect.css',['text/css',read('prospect.css')]);
assets.set('/prospect-jobs-client.js',['text/javascript',read('prospect-jobs-client.js')]);
const prospectPage=read('prospect.html').replace('<body>','<body><p role="status">SYNTHETIC DEMONSTRATION — Fictional contacts only. Data resets on restart. No provider calls.</p>');
const page=read('lab.html').replace('<body>','<body><p class="notice">SYNTHETIC DEMONSTRATION · No real leads or provider calls · Data resets when this process stops. Do not enter real personal information here.</p>').replace(/<nav aria-label="Workspace">[\s\S]*?<\/nav>/,'<nav aria-label="Workspace"><a href="/lab">Research workspace</a></nav>');
let queue=Promise.resolve();
const handle=async request=>{
  const url=new URL(request.url);
  // The production transport constructs HTTPS URLs for its reverse proxy.
  // This separate loopback demo accepts the exact local host, using HTTP Origin
  // for CSRF checks below. Production transport and authentication are unchanged.
  if(url.host!==new URL(origin).host)return new Response('Use the local demo address.',{status:403});
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==origin)return new Response('Origin rejected.',{status:403});
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
  try{
    if(url.pathname==='/api/me'||url.pathname==='/api/prospect/me')return Response.json(user,{headers});
    if(url.pathname.startsWith('/api/prospect/')){const result=await prospect.route(request,user);return result instanceof Response?result:Response.json(result,{headers});}
    if(url.pathname.startsWith('/api/lab/')){const result=await lab.route(request,user);return result instanceof Response?result:Response.json(result,{headers});}
    if(assets.has(url.pathname)){const [type,body]=assets.get(url.pathname);return new Response(body,{headers:{...headers,'Content-Type':type}});}
    if(['/', '/prospect'].includes(url.pathname))return new Response(prospectPage,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    if(url.pathname==='/lab')return new Response(page,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    return new Response('This local demo exposes only the Research Lab.',{status:404,headers});
  }catch(e){return Response.json({detail:e.status?e.message:'Demo request failed.'},{status:e.status||500,headers});}
};
const server=createServer(createHttpHandler(request=>{const work=queue.then(()=>handle(request));queue=work.catch(()=>{});return work;}));
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic ProspectPilot demo: ${origin}`));
const timer=setInterval(()=>{queue=queue.then(async()=>{await prospectJobs.tick();await lab.tick();}).catch(e=>console.error('Demo task failed:',e.message));},2000);
const stop=()=>{clearInterval(timer);server.close(()=>db.close().then(()=>process.exit(0)));};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
