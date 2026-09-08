// Per-user provider credentials never leave the server after connection.
export const WF = (() => {
  const encode = v => new TextEncoder().encode(v);
  const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
  const un64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function cipherKey(env) {
    if (!/^[a-f0-9]{64}$/i.test(env.PROVIDER_ENCRYPTION_KEY || '')) throw new HttpError(503, 'Secure connection storage is not configured yet.');
    return crypto.subtle.importKey('raw', Uint8Array.from(env.PROVIDER_ENCRYPTION_KEY.match(/../g), x => parseInt(x,16)), 'AES-GCM', false, ['encrypt','decrypt']);
  }
  async function seal(key, user, env) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return b64(iv)+'.'+b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode(user)}, await cipherKey(env), encode(key)));
  }
  async function open(value, user, env) {
    const [iv,data]=value.split('.');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv),additionalData:encode(user)},await cipherKey(env),un64(data)));
  }
  async function call(key, path, body) {
    let r;
    try { r=await fetch('https://api.wealthfeed.com'+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'x-api-key':key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}); }
    catch (error) { console.error('WealthFeed network failure',{name:error?.name||'Error',message:String(error?.message||'').slice(0,240)});throw new HttpError(502, body?'WealthFeed did not confirm receipt. Do not resubmit until you check the job in your provider account.':'WealthFeed could not be reached. Try checking again.'); }
    if(r.status===429){const e=new HttpError(429,'WealthFeed is busy. Wait before checking again.');e.retryAfter=Math.max(1,Math.min(86400,Number(r.headers.get('retry-after'))||60));throw e;}
    if(r.status>=300&&r.status<400)throw new HttpError(502,'WealthFeed redirected the secure request. The connection was not saved.');
    if(r.status===401||r.status===403)throw new HttpError(r.status,'WealthFeed did not accept this connection. Check your key and subscription.');
    if(!r.ok)throw new HttpError(r.status===400?422:502,r.status===400?'WealthFeed rejected the submitted details. Check the names and contact information.':'WealthFeed could not complete the request. Check your provider account before resubmitting.');
    // Bound response storage and reject malformed responses without echoing provider content.
    const reader=r.body.getReader();let size=0;const chunks=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();throw new HttpError(502,'WealthFeed returned too much detail. Use a smaller group.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(502,'WealthFeed returned an unreadable response.');}
    if(!result||!Object.hasOwn(result,'data')){console.error('WealthFeed response shape failure',{status:r.status,contentType:r.headers.get('content-type')||'',keys:result&&typeof result==='object'?Object.keys(result).slice(0,10):[]});throw new HttpError(502,'WealthFeed returned an unexpected response.');}
    return result;
  }
  function locator(l) {
    const r={id:l.id};
    const mappings={firstName:'first_name',lastName:'last_name',city:'city',state:'state',address:'address',email:'email',linkedin:'linkedin_url'};
    for(const [key,field] of Object.entries(mappings))if(l[field])r[key]=String(l[field]).trim();
    const p=[l.phone,l.mobile_phone,l.business_phone].map(x=>String(x||'').replace(/\D/g,'')).find(x=>/^\d{10}$/.test(x)||/^1\d{10}$/.test(x));
    if(p)r.phone=p;
    if(!(r.email||r.phone||r.linkedin||(r.firstName&&r.lastName&&(r.address||(r.city&&r.state)))))throw new HttpError(422,'Each selected person needs an email, phone, LinkedIn profile, or full name with an address or city and state.');
    return r;
  }
  function plan(rows, leads, ids) {
    if(!Array.isArray(rows)||rows.length>100)throw new HttpError(502,'WealthFeed returned an unexpected number of results.');
    const used=new Set(), result=[];
    for(const r of rows){
      const id=String(r.inputId||'');
      if(!ids.includes(id)||used.has(id))throw new HttpError(502,'WealthFeed returned missing, repeated, or unrelated record references.');
      used.add(id);
      const l=leads.find(l=>l.id===id);
      if(!l)throw new HttpError(409,'A selected person is no longer assigned to you.');
      const item={row:result.length+1,lead_id:id,changes:{},conflicts:[],invalid:[],status:'review'};
      if(r.validMatch!==1){item.reason='WealthFeed did not confirm a match.';result.push(item);continue;}
      if(!r.firstName||!r.lastName||[ ['firstName','first_name'],['lastName','last_name'] ].some(([a,b])=>!l[b]||String(r[a]).trim().toLowerCase()!==String(l[b]).trim().toLowerCase())){
        item.reason='Returned name does not match the selected person.';result.push(item);continue;
      }
      const incoming={company:r.currentCompany,current_title:r.currentJobTitle,email:r.email1,phone:r.phone1,linkedin_url:r.linkedinUrl,city:r.city,state:r.state,address:r.address,postal_code:r.zip};
      if(r.age!=null){if(!Number.isInteger(r.age)||r.age<18||r.age>120)item.invalid.push('age');else incoming.estimated_age_range=String(r.age);}
      const phoneChecks={};
      for(const n of [1,2]){if(r['phone'+n]!=null&&String(r['phone'+n]).trim()){
        const p=callNumber(String(r['phone'+n]));if(!p)item.invalid.push('phone'+n);
        else phoneChecks[p]={status:r['phone'+n+'Dnc']===0?'clear':r['phone'+n+'Dnc']===1?'blocked':'unknown',observed_at:new Date().toISOString(),source:'WealthFeed'};
      }}
      for(const [k,v] of Object.entries(incoming)){
        if(v==null||String(v).trim()==='')continue;const value=String(v).trim();
        if(value.length>1000||(k==='phone'&&!callNumber(value))||(k==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))||(k==='linkedin_url'&&!/^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+\/?$/.test(value))){item.invalid.push(k);continue;}
        if(!l[k])item.changes[k]=value;
        else if((k==='phone'?callNumber(l[k])!==callNumber(value):String(l[k]).trim().toLowerCase()!==value.toLowerCase()))item.conflicts.push({field:k,current:l[k],incoming:value});
      }
      item.provider_id=Number.isSafeInteger(r.leadId)&&r.leadId>0?String(r.leadId):null;
      if(item.provider_id&&l.source_record_ids?.wealthfeed&&String(l.source_record_ids.wealthfeed)!==item.provider_id)item.conflicts.push({field:'WealthFeed record',current:l.source_record_ids.wealthfeed,incoming:item.provider_id});
      item.phone_checks=phoneChecks;
      item.status=item.invalid.length||item.conflicts.length?'review':Object.keys(item.changes).length||Object.keys(phoneChecks).length||item.provider_id?'ready':'unchanged';
      result.push(item);
    }
    for(const id of ids)if(!used.has(id))result.push({row:result.length+1,lead_id:id,status:'review',changes:{},conflicts:[],invalid:[],reason:'WealthFeed did not return this person.'});
    return {provider:'wealthfeed',source:'WealthFeed API',recognized:true,results:result,counts:result.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})};
  }
  return {seal,open,call,locator,plan};
})();

async function wealthfeedRoutes(request,env,user,path){
  const db=env.DB, connection=await one(db,'SELECT * FROM wealthfeed_connections WHERE user_id=?',user.user_id);
  if(path==='/api/wealthfeed/status'&&request.method==='GET')return json({connected:!!connection,secure_storage_ready:!!env.PROVIDER_ENCRYPTION_KEY,jobs:await many(db,'SELECT id,provider_job_id,status,created_at FROM wealthfeed_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 20',user.user_id)});
  if(request.method!=='POST')throw new HttpError(404,'Page not found.');
  const body=await requestJSON(request);
  if(path==='/api/wealthfeed/connect'){
    const key=typeof body.key==='string'?body.key.trim():'';
    if(!key||key.length>1024||/[\s\x00-\x1f\x7f]/.test(key))throw new HttpError(422,'Enter the API key shown in your WealthFeed account.');
    const encrypted=await WF.seal(key,user.user_id,env);
    await WF.call(key,'/v1/leads?page=1&pageSize=1');
    const cid=crypto.randomUUID();
    await execute(db,'INSERT INTO wealthfeed_connections(user_id,encrypted_key,connection_id,connected_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,connection_id=excluded.connection_id,connected_at=excluded.connected_at,next_request_at=0',user.user_id,encrypted,cid,new Date().toISOString());
    return json({connected:true});
  }
  if(path==='/api/wealthfeed/disconnect'){await execute(db,'DELETE FROM wealthfeed_connections WHERE user_id=?',user.user_id);return json({connected:false});}
  if(!connection)throw new HttpError(409,'Connect your WealthFeed account first.');
  const owned=(await visibleLeadRows(db,user)).filter(({row})=>row.owner_user_id===user.user_id||lower(row.owner_email)===lower(user.email));
  const key=await WF.open(connection.encrypted_key,user.user_id,env);
  async function provider(path,body){
    // Atomic per-user pace control also persists WealthFeed Retry-After across requests.
    const time=Date.now();
    const slot=await one(db,'UPDATE wealthfeed_connections SET next_request_at=? WHERE user_id=? AND connection_id=? AND next_request_at<=? RETURNING user_id',time+1000,user.user_id,connection.connection_id,time);
    if(!slot)throw new HttpError(429,'Please wait before checking WealthFeed again.');
    try{return await WF.call(key,path,body);}catch(e){if(e.retryAfter)await execute(db,'UPDATE wealthfeed_connections SET next_request_at=? WHERE user_id=? AND connection_id=?',Date.now()+e.retryAfter*1000,user.user_id,connection.connection_id);throw e;}
  }
  if(path==='/api/wealthfeed/submit'){
    if(typeof body.request_id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.request_id))throw new HttpError(422,'Refresh the page before submitting.');
    const previous=await one(db,'SELECT id,status FROM wealthfeed_jobs WHERE id=? AND user_id=?',body.request_id,user.user_id);
    if(previous)return json({...previous,replayed:true});
    const ids=Array.isArray(body.lead_ids)?[...new Set(body.lead_ids)]:[];
    if(!ids.length||ids.length>100||ids.some(id=>!owned.some(x=>x.lead.id===id)))throw new HttpError(422,'Select 1 to 100 people assigned to you.');
    const records=ids.map(id=>WF.locator(owned.find(x=>x.lead.id===id).lead));
    // Claim before sending: uncertain submissions are never automatically sent a second time.
    const claimed=await one(db,'INSERT INTO wealthfeed_jobs(id,user_id,connection_id,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id',body.request_id,user.user_id,connection.connection_id,'sending',JSON.stringify({ids}));
    if(!claimed)throw new HttpError(409,'This request is already being processed. Refresh the job list.');
    let data;
    try{data=(await provider('/v1/enrich/persons/direct',records)).data;if(!Number.isSafeInteger(data?.id)||data.id<=0)throw new HttpError(502,'WealthFeed did not confirm a job reference. Check your account before resubmitting.');}
    catch(e){await execute(db,'UPDATE wealthfeed_jobs SET status=? WHERE id=? AND user_id=?',['429','401','403','422'].includes(String(e.status))?'rejected':'uncertain',body.request_id,user.user_id);throw e;}
    await execute(db,'UPDATE wealthfeed_jobs SET status=?,provider_job_id=? WHERE id=? AND user_id=?','queued',String(data.id),body.request_id,user.user_id);
    return json({id:body.request_id,status:'queued'});
  }
  if(path==='/api/wealthfeed/check'){
    const job=await one(db,'SELECT * FROM wealthfeed_jobs WHERE id=? AND user_id=?',body.id,user.user_id);
    if(!job)throw new HttpError(404,'This job is unavailable.');
    if(job.connection_id!==connection.connection_id)throw new HttpError(409,'This job belongs to the previous connection. Use that provider account to check its results.');
    if(!job.provider_job_id)throw new HttpError(409,'Receipt was not confirmed. Check your WealthFeed account before submitting again.');
    const saved=JSON.parse(job.payload);
    if(job.status==='preview'){
      const batch=await one(db,'SELECT status,payload FROM enrichment_batches WHERE id=? AND user_id=?',saved.preview_id,user.user_id);
      if(batch)return json({status:batch.status==='complete'?'complete':'preview',batch_id:saved.preview_id,...JSON.parse(batch.payload).plan});
    }
    const {data}=await provider('/v1/enrich/result/'+job.provider_job_id);
    if(String(data?.id)!==job.provider_job_id||!['created','processing','complete','failed'].includes(data.status))throw new HttpError(502,'WealthFeed returned an unexpected job.');
    if(data.status!=='complete'){await execute(db,'UPDATE wealthfeed_jobs SET status=? WHERE id=? AND user_id=?',data.status,job.id,user.user_id);return json({status:data.status});}
    const plan=WF.plan(data.result?.data,owned.map(x=>x.lead),saved.ids);
    const targets=new Set(plan.results.filter(r=>r.status==='ready').map(r=>r.lead_id));
    const snapshot=await Promise.all(owned.filter(x=>targets.has(x.lead.id)).map(async x=>({id:x.row.id,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x.row.payload)))).map(n=>n.toString(16).padStart(2,'0')).join('')})));
    const previewId='wf-'+job.id;
    const stored=JSON.stringify({plan,snapshot,applied:0});
    if(new TextEncoder().encode(stored).length>1800000)throw new HttpError(422,'These results contain too much detail. Contact support.');
    await db.batch([
      db.prepare('INSERT INTO enrichment_batches(id,user_id,provider,status,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(previewId,user.user_id,'wealthfeed','preview',stored),
      db.prepare('UPDATE wealthfeed_jobs SET status=?,payload=? WHERE id=? AND user_id=?').bind('preview',JSON.stringify({...saved,preview_id:previewId}),job.id,user.user_id)
    ]);
    const actual=await one(db,'SELECT status,payload FROM enrichment_batches WHERE id=? AND user_id=?',previewId,user.user_id);
    return json({status:actual.status==='complete'?'complete':'preview',batch_id:previewId,...JSON.parse(actual.payload).plan});
  }
  throw new HttpError(404,'Page not found.');
}
