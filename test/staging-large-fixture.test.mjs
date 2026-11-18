import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {installSyntheticNetworkGuard} from './helpers/staging-network.mjs';
import {migrate} from '../migrate.mjs';
import {stagingConfig,restrictedStagingAuth} from '../scripts/staging-config.mjs';
import {createAuthenticatedStaging,fictionalCSV,stagingRouteAllowed} from '../scripts/staging-app.mjs';
const now=Date.now(),project='prospectpilot-stg-261118';
const env={STAGING_PROJECT_ID:project,GOOGLE_CLOUD_PROJECT:project,STAGING_OWNER_UID:'approved-owner',STAGING_CREATED_AT:new Date(now-1000).toISOString(),STAGING_EXPIRES_AT:new Date(now+7*86400000).toISOString(),STAGING_ORIGIN:'https://prospectpilot-stg-app-123.us-central1.run.app',PGHOST:`/cloudsql/${project}:us-central1:prospectpilot-stg-db`,PGDATABASE:'prospectpilot_stg_app',PGUSER:'prospectpilot_stg_app',PGPASSWORD:'test-only',STAGING_FIREBASE_CONFIG:JSON.stringify({projectId:project,authDomain:project+'.firebaseapp.com',apiKey:'fictional-public-key',appId:'fictional-app'})};
const claims={uid:'approved-owner',aud:project,iss:'https://securetoken.google.com/'+project,email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'},auth_time:Math.floor(now/1000)};

import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {createStagingHttpHandler} from '../scripts/staging-runtime-guards.mjs';
import {largeFictionalCSV,largeFixtureRows,allowedStagingCSV,stagingBodyLimit} from '../scripts/staging-fixtures.mjs';
test('fixed larger fixture covers encoded size and rejects arbitrary changes',()=>{
 assert.ok(Buffer.byteLength(largeFictionalCSV)>300000);
 for(const csv of [largeFictionalCSV,largeFictionalCSV.replaceAll('\n','\r\n'),'\uFEFF'+largeFictionalCSV+'\n']){
  assert.equal(allowedStagingCSV(csv),true);assert.ok(Buffer.byteLength(JSON.stringify({csv,format:'generic',source:'Synthetic fixture'}))<stagingBodyLimit);
 }
 for(const value of [null,42,{},[],largeFictionalCSV.replace('fiction0001@example.test','real@person.example'),largeFictionalCSV+'\nAdditional,Person',largeFictionalCSV.slice(0,-1),'x'.repeat(stagingBodyLimit+1)])assert.equal(allowedStagingCSV(value),false);
});
test('downloaded larger fixture imports over actual staging transport and repeats without added contacts',async()=>{
 const db=new PGlite();const query=async(sql,values)=>!values&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,values);
 const pool={query,connect:async()=>({query,release(){}}),end:async()=>{}};
 let server;
 try{
  await migrate(pool);const config=stagingConfig(env);
  const auth={verifyIdToken:async()=>claims,verifySessionCookie:async token=>{if(token!=='owner')throw Error('Denied');return claims;},createSessionCookie:async()=> 'owner'};
  const app=createAuthenticatedStaging({pool,auth,config,loginScript:'// test only'});
  server=createServer(createStagingHttpHandler(app,config));server.listen(0,'127.0.0.1');await once(server,'listening');
  const req=(path,body,cookie='owner')=>new Promise((resolve,reject)=>{
   const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
   const q=request({hostname:'127.0.0.1',port:server.address().port,path,method:bytes?'POST':'GET',headers:{host:new URL(config.origin).host,origin:config.origin,cookie:'__session='+cookie,...bytes?{'content-type':'application/json','content-length':bytes.length}:{}}},r=>{let text='';r.on('data',chunk=>text+=chunk);r.on('end',()=>resolve({status:r.statusCode,text,headers:r.headers}));});q.on('error',reject);q.end(bytes);
  });
  assert.equal((await req('/staging-fixture-large.csv',undefined,'other')).status,401);
  const download=await req('/staging-fixture-large.csv');assert.equal(download.status,200);assert.equal(download.text,largeFictionalCSV);assert.match(download.headers['content-disposition'],/fictional-staging-large.csv/);
  const contactsPage=await req('/prospect');assert.doesNotMatch(contactsPage.text,/<option value="zoominfo">/);assert.match(contactsPage.text,/<option value="generic" selected>/);
  assert.equal((await req('/api/prospect/import',{csv:download.text,format:'zoominfo'})).status,422);
  const payload={csv:download.text,format:'generic',source:'Fictional staging load fixture'};
  assert.equal((await req('/api/prospect/import/preview',payload)).status,200);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM prospect_contacts')).rows[0].n,0);
  const imported=await req('/api/prospect/import',payload);assert.equal(imported.status,200,imported.text);assert.equal(JSON.parse(imported.text).added,largeFixtureRows);
  const repeated=await req('/api/prospect/import',payload);assert.equal(repeated.status,200);assert.equal(JSON.parse(repeated.text).replayed,true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM prospect_contacts')).rows[0].n,largeFixtureRows);
  assert.equal((await req('/api/prospect/import',payload,'other')).status,401);
  for(const csv of [null,42,{},largeFictionalCSV.replace('fiction0001','changed0001'),largeFictionalCSV+'\nExtra,Person'])assert.equal((await req('/api/prospect/import',{...payload,csv})).status,422);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM prospect_contacts')).rows[0].n,largeFixtureRows);
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.close();}
});
