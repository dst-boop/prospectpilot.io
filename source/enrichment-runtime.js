const ENRICH=(()=>{
// Provider file exchange. No provider network requests, credentials or browser access.
const providers = Object.freeze({
  zoominfo: {name:'ZoomInfo', url:'https://app.zoominfo.com/', verified:false},
  wealthfeed: {name:'WealthFeed', url:'https://portal.wealthfeed.com/', verified:false}
});
const norm = v => String(v ?? '').normalize('NFKC').trim().toLowerCase();
const header = v => norm(v).replace(/[^a-z0-9]/g,'');
const aliases = {
  first_name:['first name','firstname'], last_name:['last name','lastname'],
  company:['company name','company','employer'], current_title:['job title','title','position'],
  email:['email','email address','business email'], business_phone:['direct phone number','direct phone','business phone'],
  mobile_phone:['mobile phone','mobile phone number'], city:['city','person city'], state:['state','person state'],
  postal_code:['zip','zip code','postal code'], address:['street address','address'],
  linkedin_url:['linkedin contact profile url','linkedin url','linkedin profile url'],
  company_domain:['company domain'], external_id:['external id','workspace lead id'],
  zoominfo_id:['zoominfo contact id','zoominfo person id'], wealthfeed_id:['wealthfeed id','wealthfeed contact id','wealthfeed person id'],
  estimated_net_worth:['estimated net worth','net worth','net worth range'], match_status:['match status']
};
const keys = new Map(Object.entries(aliases).flatMap(([k,v])=>v.map(a=>[header(a),k])));
const fields = ['email','business_phone','mobile_phone','current_title','company','city','state','postal_code','address','linkedin_url','company_domain','estimated_net_worth'];
function parseCSV(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 5*1024*1024) throw Error('Choose a CSV smaller than 5 MB.');
  source=source.replace(/^\uFEFF/,'');
  if (source.includes('\0')) throw Error('This file is not a supported UTF-8 CSV.');
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  const endCell=()=>{row.push(cell);cell='';closed=false;};
  const endRow=()=>{endCell();if(row.some(x=>x!==''))rows.push(row);row=[];if(rows.length>5001)throw Error('Choose at most 5,000 records.');};
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quoted){if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c==='"'){if(cell||closed)throw Error('Invalid CSV quoting.');quoted=true;}
    else if(c===',')endCell();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;endRow();}
    else {if(closed)throw Error('Unexpected text after a quoted CSV value.');cell+=c;}
    if(cell.length>20000||row.length>200)throw Error('CSV cells or columns exceed the supported size.');
  }
  if(quoted)throw Error('The CSV contains an unfinished quoted value.');
  if(cell||row.length||closed)endRow();
  if(rows.length<2)throw Error('The CSV needs headers and at least one record.');
  const headers=rows.shift();const names=headers.map(header);
  if(names.some(x=>!x)||new Set(names).size!==names.length)throw Error('CSV headers must be unique and nonempty.');
  const mapped=headers.map(h=>keys.get(header(h)));
  if(new Set(mapped.filter(Boolean)).size!==mapped.filter(Boolean).length)throw Error('Two columns describe the same field. Keep one before importing.');
  return {headers,rows:rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`Row ${i+2} has the wrong number of columns.`);return Object.fromEntries(mapped.flatMap((k,j)=>k?[[k,r[j].trim()]]:[]));})};
}
function recognize(headers) {
  const names=new Set(headers.map(header));
  const z=aliases.zoominfo_id.some(x=>names.has(header(x))), w=aliases.wealthfeed_id.some(x=>names.has(header(x)));
  if(z&&w)throw Error('This file contains identifiers from both providers. Export one provider at a time.');
  return z?'zoominfo':w?'wealthfeed':null;
}
function cell(v){let s=String(v??'');if(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCSV(provider,leads,template=null) {
  if(!providers[provider])throw Error('Choose a supported provider.');
  if(!leads.length||leads.length>5000)throw Error('Select between 1 and 5,000 leads.');
  // Draft defaults must not be described as verified provider templates.
  const headers=template||['First Name','Last Name','Company Name','Email','City','State','LinkedIn URL','External ID'];
  if(!Array.isArray(headers)||!headers.length||headers.some(h=>!keys.has(header(h))))throw Error('The provider template contains unsupported columns.');
  if(new Set(headers.map(header)).size!==headers.length)throw Error('Duplicate template columns.');
  const rows=leads.map(l=>headers.map(h=>cell(keys.get(header(h))==='external_id'?l.id:l[keys.get(header(h))])) .join(','));
  return '\uFEFF'+[headers.map(cell).join(','),...rows].join('\r\n');
}
function linkedin(v){try{const u=new URL(v);return u.protocol==='https:'&&/^(www\.)?linkedin\.com$/.test(u.hostname)&&/^\/in\/[^/]+\/?$/.test(u.pathname)?u.pathname.replace(/\/$/,'').toLowerCase():'';}catch{return '';}}
function valueValid(k,v){
  if(v.length>1000)return false;
  if(k==='email')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if(k==='linkedin_url')return !!linkedin(v);
  if(k.endsWith('phone'))return /^\+?[\d ().-]+$/.test(v)&&v.replace(/\D/g,'').length>=8&&v.replace(/\D/g,'').length<=15;
  return true;
}
function planImport(source,leads,{provider:chosen,batchIds=null}={}) {
  const parsed=parseCSV(source), detected=recognize(parsed.headers);
  if(chosen&&!providers[chosen])throw Error('Choose a supported provider.');
  if(detected&&chosen&&chosen!==detected)throw Error('The file belongs to a different provider.');
  const provider=detected||chosen;
  if(!provider)throw Error('Provider not recognized. Select the provider that exported this file.');
  const scoped=batchIds?leads.filter(l=>batchIds.includes(l.id)):leads;
  const results=[],seen=new Set(),matched=new Map();
  for(const [i,r] of parsed.rows.entries()){
    const item={row:i+2,status:'unmatched',lead_id:null,changes:{},conflicts:[],invalid:[]};
    const fingerprint=JSON.stringify(r);
    if(seen.has(fingerprint)){results.push({...item,status:'duplicate'});continue;}seen.add(fingerprint);
    if(r.match_status&&!['matched','match','exact match','exact','unique match'].includes(norm(r.match_status))){results.push({...item,status:'review',reason:'Provider did not report a unique match.'});continue;}
    const identifiers=[['external_id',l=>l.id],['email',l=>l.email],[provider+'_id',l=>l.source_record_ids?.[provider]],[ 'linkedin_url',l=>l.linkedin_url]];
    const sets=identifiers.filter(([k])=>r[k]).map(([k,get])=>scoped.filter(l=>{const a=k==='linkedin_url'?linkedin(r[k]):norm(r[k]);const b=k==='linkedin_url'?linkedin(get(l)):norm(get(l));return a&&b&&a===b;}));
    const candidates=new Map(sets.flat().map(l=>[l.id,l]));
    if(candidates.size!==1||sets.some(s=>s.length>1)){results.push({...item,status:candidates.size?'review':'unmatched',reason:'A unique shared identifier is required.'});continue;}
    const lead=[...candidates.values()][0];item.lead_id=lead.id;
    const contradictions=identifiers.filter(([k,get])=>r[k]&&get(lead)&& (k==='linkedin_url'?linkedin(r[k])!==linkedin(get(lead)):norm(r[k])!==norm(get(lead))));
    if(contradictions.length||['first_name','last_name'].some(k=>r[k]&&lead[k]&&norm(r[k])!==norm(lead[k]))){results.push({...item,status:'review',reason:'Identity details disagree.'});continue;}
    for(const k of fields){if(!r[k])continue;if(!valueValid(k,r[k])){item.invalid.push(k);continue;}if(!lead[k])item.changes[k]=r[k];else if(norm(lead[k])!==norm(r[k]))item.conflicts.push({field:k,current:lead[k],incoming:r[k]});}
    item.provider_id=r[provider+'_id']||null;
    item.status=item.conflicts.length||item.invalid.length?'review':Object.keys(item.changes).length||(item.provider_id&&!lead.source_record_ids?.[provider])?'ready':'unchanged';
    if(matched.has(lead.id)){const previous=matched.get(lead.id);previous.status='review';previous.reason='Multiple different rows target this person.';item.status='review';item.reason=previous.reason;}else matched.set(lead.id,item);
    results.push(item);
  }
  return {provider,recognized:!!detected,results,counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})};
}
function applyPlan(plan,leads,{batchId,now=new Date().toISOString()}={}) {
  if(!batchId)throw Error('An import batch reference is required.');
  const byId=new Map(plan.results.filter(r=>r.status==='ready').map(r=>[r.lead_id,r]));
  return leads.map(l=>{const r=byId.get(l.id);if(!r)return l;
    if(Object.keys(r.changes).some(k=>l[k]))throw Error('A lead changed after preview. Preview the file again.');
    const api=plan.source==='WealthFeed API';
    return {...l,...r.changes,...(api?{wealthfeed_phone_checks:{...l.wealthfeed_phone_checks,...r.phone_checks},evidence:[...(l.evidence||[]),...Object.entries(r.changes).map(([field,value])=>({id:batchId+':'+field,field,value,source:'WealthFeed',kind:'reported',observed_at:now,source_url:'',snippet:'Provider-reported information; not independently verified.'}))]}:{}),source_record_ids:{...l.source_record_ids,...(r.provider_id?{[plan.provider]:r.provider_id}:{})},enrichment_history:[...(l.enrichment_history||[]),{provider:plan.provider,batch_id:batchId,imported_at:now,fields:Object.keys(r.changes),source:plan.source||'user-uploaded CSV'}]};
  });
}
const releaseStatus = {ready:false,blockers:['ZoomInfo account CSV template and upload/download round trip not verified.','WealthFeed account CSV template and upload/download round trip not verified.','Provider-assisted browser workflow requires acceptance testing in the user’s own account.']};

return {providers,parseCSV,recognize,exportCSV,planImport,applyPlan,releaseStatus};})();
// Concatenate after worker-runtime.js with ENRICH namespace and ENRICHMENT_HTML.
async function enrichmentRoutes(request, env, user, path) {
  if (!path.startsWith('/api/enrichment/')) return null;
  const db=env.DB;
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(path==='/api/enrichment/status'&&request.method==='GET')return reply({providers:ENRICH.providers,release:ENRICH.releaseStatus,connection:'File exchange only. Your provider account is not connected.'});
  // Read access alone does not authorize enrichment writes or exporting shared leads.
  const owned=(await visibleLeadRows(db,user)).filter(({row})=>row.owner_user_id===user.user_id||lower(row.owner_email)===lower(user.email));
  if(path==='/api/enrichment/leads'&&request.method==='GET')return reply({leads:owned.map(({lead})=>{
    const phone=[lead.phone,lead.mobile_phone,lead.business_phone].some(callNumber);
    const locator=!!(lead.email||phone||lead.linkedin_url||(lead.first_name&&lead.last_name&&(lead.address||(lead.city&&lead.state))));
    const matchStrength=(lead.email?4:0)+(phone?4:0)+(lead.linkedin_url?3:0)+(lead.address?2:0)+(lead.city&&lead.state?1:0);
    const pageLabel=/^(privacy|news|disclosure|terms|careers?|contact|read more|learn more|home|about)(\s|$)/i.test(String(lead.first_name||'')+' '+String(lead.last_name||''));
    return {id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,eligible:locator&&!pageLabel&&lead.identity_status!=='excluded',identity_status:lead.identity_status,match_strength:matchStrength,priority_score:Number(lead.priority_score||0),missing_age:!lead.estimated_age_range,missing_phone:!phone,missing_linkedin:!lead.linkedin_url};
  })});
  if(request.method!=='POST')throw new HttpError(404,'Not found.');
  let body;try{body=JSON.parse(await readBody(request));}catch(e){throw new HttpError(422,e.message||'Choose a valid file.');}
  if(path==='/api/enrichment/export') {
    const ids=Array.isArray(body.lead_ids)?[...new Set(body.lead_ids)]:[];
    const selected=owned.filter(({lead})=>ids.includes(lead.id));
    if(!ids.length||selected.length!==ids.length)throw new HttpError(422,'Select available leads assigned to you.');
    let csv;try{csv=ENRICH.exportCSV(body.provider,selected.map(x=>x.lead));}catch(e){throw new HttpError(422,e.message);}
    const id=crypto.randomUUID();
    await execute(db,'INSERT INTO enrichment_batches(id,user_id,provider,status,payload) VALUES(?,?,?,?,?)',id,user.user_id,body.provider,'awaiting_upload',JSON.stringify({ids}));
    return reply({batch_id:id,csv,filename:body.provider+'-candidates.csv',status:'awaiting_upload',format_verified:false});
  }
  if(path==='/api/enrichment/preview') {
    let batch=null;
    if(body.batch_id){batch=await one(db,'SELECT * FROM enrichment_batches WHERE id=? AND user_id=?',body.batch_id,user.user_id);if(!batch)throw new HttpError(404,'This export is unavailable.');}
    let plan;try{plan=ENRICH.planImport(body.csv,owned.map(x=>x.lead),{provider:batch?.provider||body.provider||undefined,batchIds:batch?JSON.parse(batch.payload).ids:null});}catch(e){throw new HttpError(422,e.message);}
    const id=crypto.randomUUID(),targets=new Set(plan.results.filter(r=>r.status==='ready').map(r=>r.lead_id));
    if(targets.size>500)throw new HttpError(422,'Choose at most 500 ready leads per file.');
    const snapshot=await Promise.all(owned.filter(x=>targets.has(x.lead.id)).map(async x=>({id:x.row.id,hash:await hash(x.row.payload)})));
    const stored=JSON.stringify({plan,snapshot,export_id:batch?.id||null,applied:0});
    if(new TextEncoder().encode(stored).length>1800000)throw new HttpError(422,'This preview contains too much detail. Choose a smaller file.');
    await execute(db,'INSERT INTO enrichment_batches(id,user_id,provider,status,payload) VALUES(?,?,?,?,?)',id,user.user_id,plan.provider,'preview',stored);
    return reply({batch_id:id,...plan,status:'preview',message:'Only ready rows will fill empty fields. Review rows are held without changes.'});
  }
  if(path==='/api/enrichment/commit') {
    const batch=await one(db,'SELECT * FROM enrichment_batches WHERE id=? AND user_id=?',body.batch_id,user.user_id);
    if(!batch)throw new HttpError(404,'This preview is unavailable.');
    if(batch.status==='complete')return reply({status:'complete',replayed:true,applied:JSON.parse(batch.payload).applied||0});
    if(batch.status!=='preview')throw new HttpError(409,'Preview the file before applying it.');
    const saved=JSON.parse(batch.payload),{plan}=saved,remaining=saved.snapshot.slice(40);
    const snapshot=[];
    for(const original of saved.snapshot.slice(0,40)){const item=owned.find(x=>x.row.id===original.id);if(!item||await hash(item.row.payload)!==original.hash)throw new HttpError(409,'A lead changed or is no longer assigned to you. Earlier saved groups were kept. Preview the remaining file again.');snapshot.push({id:original.id,payload:item.row.payload});}
    if(!snapshot.length)throw new HttpError(422,'There are no ready rows to apply.');
    const merged=ENRICH.applyPlan(plan,snapshot.map(s=>({...JSON.parse(s.payload),id:s.id})),{batchId:batch.id});
    // The guard CHECK aborts the entire D1 batch if another writer changed any target.
    const conditions=snapshot.map(()=>'(SELECT payload FROM discovery_leads WHERE id=?) IS ?').join(' AND ');
    const params=snapshot.flatMap(s=>[s.id,s.payload]);
    const statements=[db.prepare(`INSERT INTO enrichment_commit_guards(id,ok) SELECT ?,CASE WHEN (${conditions}) AND (SELECT status FROM enrichment_batches WHERE id=?)='preview' AND (SELECT count(*) FROM discovery_leads WHERE id IN (SELECT value FROM json_each(?)) AND (owner_user_id=? OR lower(owner_email)=lower(?)))=? THEN 1 ELSE 0 END`).bind(batch.id,...params,batch.id,JSON.stringify(snapshot.map(s=>s.id)),user.user_id,user.email,snapshot.length)];
    merged.forEach(l=>statements.push(db.prepare('UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(l),l.id)));
    const applied=(saved.applied||0)+snapshot.length;
    const processed=new Set(snapshot.map(s=>s.id));
    const nextPlan={...plan,results:plan.results.map(r=>processed.has(r.lead_id)&&r.status==='ready'?{...r,status:'applied'}:r)};
    const nextPayload=remaining.length?{...saved,plan:nextPlan,snapshot:remaining,applied}:{counts:plan.counts,applied};
    statements.push(db.prepare('UPDATE enrichment_batches SET status=?,payload=? WHERE id=? AND user_id=?').bind(remaining.length?'preview':'complete',JSON.stringify(nextPayload),batch.id,user.user_id));
    statements.push(db.prepare('DELETE FROM enrichment_commit_guards WHERE id=?').bind(batch.id));
    try{await db.batch(statements);}catch{throw new HttpError(409,'The import could not be applied safely. Refresh and preview again.');}
    return reply({status:remaining.length?'partial':'complete',applied,remaining:remaining.length,held:plan.results.filter(r=>r.status==='review').length});
  }
  throw new HttpError(404,'Not found.');
}

export { ENRICH };
