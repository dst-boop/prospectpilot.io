// Test-only assembly around the production route/auth/HTTP/database modules.
// Never import server.mjs, firebase-admin, provider adapters or credential files.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createHandler} from '../../handler.mjs';
import {createHttpHandler} from '../../http-server.mjs';
import {migrate} from '../../migrate.mjs';
import {createResearchLab} from '../../research-lab.mjs';
import {createProspectWorkspace} from '../../prospect-workspace.mjs';
import {createProspectJobs} from '../../prospect-jobs.mjs';
import {createStagingDatabase} from './staging-database.mjs';
import {installSyntheticNetworkGuard} from './staging-network.mjs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
export async function createSyntheticStaging({env=process.env,backend='auto',readOnly=false}={}) {
  if(env.NODE_ENV==='production')throw Error('Synthetic staging refuses production mode');
  const database=await createStagingDatabase({env,backend});
  const network=installSyntheticNetworkGuard();
  const connection=env.STAGING_DATABASE_URL||env.POSTGRES_TEST_URL;
  if(connection)network.allowPort(new URL(connection).port||5432);
  let server;
  try {
    await migrate(database.pool);
    const tokens=new Map(),sessions=new Map(),providerCalls=[];
    const identities={advisor:{uid:'synthetic-advisor',email:'advisor@example.test',name:'Synthetic Advisor'},other:{uid:'synthetic-other',email:'other@example.test',name:'Other Synthetic Advisor'},recycled:{uid:'synthetic-recycled',email:'advisor@example.test',name:'Recycled Email Synthetic Advisor'}};
    for(const [key,identity] of Object.entries(identities))tokens.set('synthetic-id-'+key,{...identity,email_verified:true,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'}});
    const auth={
      verifyIdToken:async(token,revoked)=>{if(revoked!==true||!tokens.has(token))throw Error('Invalid synthetic token');return tokens.get(token);},
      createSessionCookie:async token=>{const session=randomUUID();sessions.set(session,tokens.get(token));return session;},
      verifySessionCookie:async(cookie,revoked)=>{if(revoked!==true||!sessions.has(cookie))throw Error('Invalid synthetic session');return sessions.get(cookie);}
    };
    const synthetic={first_name:'Avery',last_name:'Fixture',company:'Synthetic Manufacturing',title:'Operations Director',email:'avery@example.com',country:'US',state:'NY',city:'Albany',phone:'+12125550188'};
    const call=(name,result)=>async()=>{providerCalls.push(name);return structuredClone(result());};
    const providers={readiness:{search:true,enrichment:true,email_verification:true,domain_check:true,synthetic:true},
      search:call('search',()=>({contacts:[synthetic],retrieved:1,total:1,scroll_token:'',checked_at:new Date().toISOString()})),
      enrich:async contact=>{providerCalls.push('enrich');return {contact:{...contact,phone:synthetic.phone},checked_at:new Date().toISOString()};},
      verifyEmail:async contact=>{providerCalls.push('verify');return {email:contact.email,status:'valid',provider:'synthetic-only',provider_status:'fixture',checked_at:new Date().toISOString()};},
      checkDomain:async contact=>{providerCalls.push('check_domain');return {email:contact.email,domain:contact.email.split('@')[1],status:'mx_present',checked_at:new Date().toISOString()};}
    };
    const jobs=createProspectJobs({pool:database.pool,providers,config:{dailyBudgetMicros:0,prices:{search:0,enrich:0,verify:0}},pacingMs:{pdl:0,hunter:0,dns:0},dispatch:async()=>true});
    const prospect=createProspectWorkspace({pool:database.pool,jobs,checkDomain:providers.checkDomain});
    const lab=createResearchLab({pool:database.pool,sources:{readiness:{},quote:()=>0,run:async()=>({status:'skipped',candidates:[],errors:['Synthetic staging: external research disabled']})},dispatch:async()=>false});
    let handler;
    server=createServer(createHttpHandler(request=>handler(request)));
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const port=server.address().port,origin=`https://127.0.0.1:${port}`,base=`http://127.0.0.1:${port}`;
    network.allowPort(port);
    const banner='<p role="status">SYNTHETIC TEST ONLY. Fictional data. No real sign-in, providers, or spending.</p>';
    handler=createHandler({readOnly,auth,origins:[origin],ownerEmail:'unavailable-admin@example.test',releaseId:'synthetic-staging',
      worker:{fetch:async()=>new Response('Legacy integrations disabled in synthetic staging',{status:503})},
      lab,prospect,homeHtml:read('home.html'),siteStyle:read('site.css'),brandMark:read('brand.svg'),
      loginHtml:'<!doctype html><title>Synthetic sign-in only</title>'+banner,loginScript:'// No Firebase in synthetic staging.',
      labPage:read('lab.html').replace('<body>','<body>'+banner),labScript:read('lab-client.js'),labStyle:read('lab.css'),
      prospectPage:read('prospect.html').replace('<body>','<body>'+banner),prospectScript:read('prospect-client.js'),prospectJobsScript:read('prospect-jobs-client.js'),prospectStyle:read('prospect.css'),
      networkingPage:read('networking.html').replace('<body>','<body>'+banner),networkingScript:read('networking-client.js'),networkingStyle:read('networking.css')});
    const request=(path,{cookie='',method='GET',body,headers={},site=origin}={})=>fetch(base+path,{method,redirect:'manual',headers:{origin:site,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    let closing;
    const close=()=>closing??=(async()=>{
      try{server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
      finally{try{await database.close();}finally{network.restore();}}
    })();
    return {request,origin,base,database,network,providerCalls,jobs,identities,revoke:cookie=>sessions.delete(cookie.split('=')[1]),close};
  }catch(error){server?.closeAllConnections();server?.close();try{await database.close();}finally{network.restore();}throw error;}
}
