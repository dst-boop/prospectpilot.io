// Explicit isolated pilot contract. Never imported by the production entrypoint.
export function stagingConfig(env,now=Date.now()){
 const fail=()=>{throw Error('Invalid isolated staging configuration');};
 const project=env.STAGING_PROJECT_ID;
 if(!/^prospectpilot-stg-[a-z0-9-]{1,12}$/.test(project||'')||env.GOOGLE_CLOUD_PROJECT!==project)fail();
 const created=Date.parse(env.STAGING_CREATED_AT),expires=Date.parse(env.STAGING_EXPIRES_AT);
 if(!Number.isFinite(created)||!Number.isFinite(expires)||created>now||expires<=now||expires<=created||expires-created>30*86400000)fail();
 const uid=env.STAGING_OWNER_UID;if(!uid||uid.length>128||/[\s,]/.test(uid))fail();
 let testers;try{testers=JSON.parse(env.STAGING_TESTER_BINDINGS||'[]');}catch{fail();}
 if(!Array.isArray(testers)||testers.length>5)fail();
 const ids=new Set([uid]),emails=new Set();
 testers=testers.map(binding=>{
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).sort().join(',')!=='email,expires,uid')fail();
  const expiry=Date.parse(binding.expires);
  if(typeof binding.uid!=='string'||!binding.uid||binding.uid.length>128||/[\s,]/.test(binding.uid)||ids.has(binding.uid))fail();
  if(typeof binding.email!=='string'||binding.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(binding.email)||emails.has(binding.email.toLowerCase()))fail();
  if(typeof binding.expires!=='string'||!Number.isFinite(expiry)||expiry<=created||expiry>expires)fail();
  ids.add(binding.uid);emails.add(binding.email.toLowerCase());
  return Object.freeze({uid:binding.uid,email:binding.email,expires:expiry});
 });
 testers=Object.freeze(testers);
 let origin;try{origin=new URL(env.STAGING_ORIGIN);}catch{fail();}
 if(origin.protocol!=='https:'||!/^prospectpilot-stg-[a-z0-9-]+(?:\.us-central1)?\.run\.app$/.test(origin.hostname)||origin.origin!==env.STAGING_ORIGIN)fail();
 const host=env.PGHOST;
 if(!host?.startsWith('/cloudsql/'+project+':us-central1:prospectpilot-stg-')||!/^\/cloudsql\/[a-z0-9-]+:us-central1:prospectpilot-stg-[a-z0-9-]+$/.test(host))fail();
 if(!/^prospectpilot_stg_[a-z0-9_]+$/.test(env.PGDATABASE||'')||!/^prospectpilot_stg_[a-z0-9_]+$/.test(env.PGUSER||'')||!env.PGPASSWORD)fail();
 // Do not inherit libpq, ADC-file, emulator, provider or production configuration.
 const allowedPg=new Set(['PGHOST','PGDATABASE','PGUSER','PGPASSWORD']);
 for(const [key,value] of Object.entries(env))if(value&&((/^PG/.test(key)&&!allowedPg.has(key))||/^(FORGET_TOMBSTONE_.+|DATABASE_URL|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_QUOTA_PROJECT|GOOGLE_CLOUD_UNIVERSE_DOMAIN|CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE|FIREBASE_CONFIG|FIREBASE_AUTH_EMULATOR_HOST|FUNCTIONS_EMULATOR|GCE_METADATA_HOST|GCE_METADATA_IP|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|http_proxy|https_proxy|all_proxy|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|GCLOUD_PROJECT|APP_ORIGINS|OWNER_EMAIL|STRIPE_.+|LINKEDIN_.+|PDL_.+|HUNTER_.+|TRESTLE_.+|ANTHROPIC_.+|BRAVE_.+|PROVIDER_.+)$/.test(key)))fail();
 let firebase;try{firebase=JSON.parse(env.STAGING_FIREBASE_CONFIG);}catch{fail();}
 if(firebase.projectId!==project||firebase.authDomain!==project+'.firebaseapp.com'||typeof firebase.apiKey!=='string'||!firebase.apiKey||typeof firebase.appId!=='string'||!firebase.appId)fail();
 if(Object.keys(firebase).some(k=>!['projectId','authDomain','apiKey','appId'].includes(k)))fail();
 return Object.freeze({project,uid,testers,created,expires,origin:origin.origin,firebase:Object.freeze(firebase),database:env.PGDATABASE,db:Object.freeze({host,database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD,port:5432,ssl:false,max:2,connectionTimeoutMillis:10000,statement_timeout:30000,options:'-c lock_timeout=5000',application_name:'prospectpilot-authenticated-staging'})});
}
export function restrictedStagingAuth(auth,config,clock=Date.now){
 const check=claims=>{if(clock()>=config.expires||claims.email_verified!==true||claims.firebase?.sign_in_provider!=='google.com'||claims.aud!==config.project||![`https://securetoken.google.com/${config.project}`,`https://session.firebase.google.com/${config.project}`].includes(claims.iss))throw Error('Staging access denied');if(claims.uid!==config.uid&&!(config.testers||[]).some(t=>t.uid===claims.uid&&t.email===claims.email&&clock()<t.expires))throw Error('Staging access denied');return Object.freeze({uid:claims.uid,email:claims.email,email_verified:claims.email_verified,name:claims.name,auth_time:claims.auth_time,aud:claims.aud,iss:claims.iss,firebase:Object.freeze({sign_in_provider:claims.firebase.sign_in_provider})});};
 return {verifyIdToken:async token=>check(await auth.verifyIdToken(token,true)),verifySessionCookie:async token=>check(await auth.verifySessionCookie(token,true)),createSessionCookie:async(token,options)=>{await auth.verifyIdToken(token,true).then(check);return auth.createSessionCookie(token,options);}};
}
