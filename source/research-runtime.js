// Public-source research is separate from qualification and calling eligibility.
export const RESEARCH_SOURCES = [
 ['website','Company websites','person','team biography owner services',null],
 ['registry','Business registrations','company','business entity registration secretary of state','https://dos.ny.gov/corporation-and-business-entity-search-database'],
 ['license','Professional licenses','person','professional license lookup','https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx'],
 ['professional','Public professional profiles','person','professional profile career',null],
 ['announcement','Company announcements','company','newsroom promotion acquisition expansion',null],
 ['news','Local news and interviews','person','interview business news',null],
 ['association','Chambers and trade associations','company','chamber trade association directory',null],
 ['maps','Business listings and maps','company','business address directory','https://www.openstreetmap.org/'],
 ['sec','SEC filings','company','SEC EDGAR filings','https://www.sec.gov/edgar/search/'],
 ['expertise','Conferences, articles and patents','person','speaker author patent inventor','https://www.uspto.gov/patents/search/patent-public-search'],
 ['warn','WARN notices','company','WARN layoff notice','https://dol.ny.gov/warn-dashboard'],
 ['mwbe','MWBE business directories','company','MWBE certified business directory','https://www.mwbe.esd.ny.gov/']
].map(([id,label,scope,query,directory])=>({id,label,scope,query,directory,methods:['public_page','excerpt','csv'],note:id==='warn'?'Employer notice only. Does not establish that this person lost a job.':id==='mwbe'?'Business certification only. No personal demographic inference or scoring.':'Review identity and source date before relying on this record.'}));
const researchNorm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const researchHas=(hay,needle)=>needle.length>=3&&(' '+researchNorm(hay)+' ').includes(' '+researchNorm(needle)+' ');
export function researchMatch(lead,excerpt,scope){
 const company=knownCompany(lead.company)&&researchHas(excerpt,lead.company);
 const person=researchHas(excerpt,[lead.first_name,lead.last_name].filter(Boolean).join(' '));
 const location=researchHas(excerpt,lead.city||lead.location||'');
 return scope==='company'?Boolean(company):Boolean(person&&(company||location));
}
export function researchRecord(lead,body){
 const source=RESEARCH_SOURCES.find(s=>s.id===body.source);if(!source)throw new HttpError(422,'Choose a research source.');
 const url=safeTargetUrl(body.url);if(!url)throw new HttpError(422,'Use a public source URL.');
 const excerpt=text(body.excerpt,1500);if(!excerpt||!researchMatch(lead,excerpt,source.scope))throw new HttpError(422,source.scope==='company'?'The excerpt must name this business.':'The excerpt must name this person and their company or location.');
 const date=text(body.source_date,10);if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new HttpError(422,'Use a valid source date.');
 if(source.id==='warn'&&!date)throw new HttpError(422,'WARN records need the notice date.');
 return {id:uid('research'),source:source.id,label:source.label,scope:source.scope,url:url.href,excerpt,source_date:date||null,checked_at:now(),status:'reviewed_by_user',note:source.note};
}
export function researchCSV(csv){
 if(typeof csv!=='string'||new TextEncoder().encode(csv).length>1024*1024)throw new HttpError(422,'Choose a CSV up to 1 MB.');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')cell+=c;if(rows.length>1000)throw new HttpError(422,'Import at most 1,000 rows.');}
 if(quoted)throw new HttpError(422,'Unfinished CSV quote.');if(cell||row.length){row.push(cell);rows.push(row);}const headers=(rows.shift()||[]).map(h=>h.replace(/^\uFEFF/,'').trim());if(!headers.length||headers.some(h=>!h)||new Set(headers.map(researchNorm)).size!==headers.length)throw new HttpError(422,'CSV headers must be unique and nonempty.');
 return rows.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw new HttpError(422,'CSV row has the wrong number of columns.');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export async function researchMWBE(query){
 const q=text(query,120);if(q.length<3)throw new HttpError(422,'Enter at least three characters.');
 const endpoint=new URL('https://data.cityofnewyork.us/resource/ci93-uc8s.json');endpoint.searchParams.set('$q',q);endpoint.searchParams.set('$limit','30');
 // Explicit projection excludes personal demographic fields from this directory.
 endpoint.searchParams.set('$select','account_number,vendor_formal_name,vendor_dba,first_name,last_name,telephone,business_description,certification,cert_renewal_date,city,state,zip,website,naics_title');
 const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});if(!response.ok){await discardResponse(response);throw new HttpError(502,'The public directory is unavailable. Try again later.');}const rows=JSON.parse(await readLimitedResponse(response,4*1024*1024));if(!Array.isArray(rows))throw new HttpError(502,'The directory returned an unexpected format.');
 return rows.map(r=>({company:text(r.vendor_formal_name,200),contact:text([r.first_name,r.last_name].filter(Boolean).join(' '),160),location:text([r.city,r.state,r.zip].filter(Boolean).join(', '),200),website:safeTargetUrl(r.website)?.href||'',phone:text(r.telephone,80),description:text(r.business_description,600),certification:text(r.certification,100),renewal_date:text(r.cert_renewal_date,40),source_url:endpoint.href,record_id:text(r.account_number,100)}));
}
function researchSignature(lead){return JSON.stringify([lead.first_name,lead.last_name,lead.company,lead.city,lead.location,lead.company_location,lead.company_website]);}
async function researchRoutes(request,env,user,path,url){
 const db=env.DB;
 if(path==='/api/research/catalog'&&request.method==='GET')return json({sources:RESEARCH_SOURCES});
 if(path==='/api/research/leads'&&request.method==='GET'){
 const items=(await visibleLeadRows(db,user)).slice(0,500);const selected=url.searchParams.get('lead_id');if(selected&&!items.some(x=>x.lead.id===selected)){const r=await one(db,'SELECT * FROM discovery_leads WHERE id=? AND team=?',selected,TEAM);const l=leadFromRow(r);if(r&&l&&canReadLead(r,l,user))items.push({lead:l});}
 return json({leads:items.map(({lead})=>({id:lead.id,first_name:lead.first_name,last_name:lead.last_name,company:lead.company,location:lead.location}))});
}
 if(path==='/api/research/mwbe'&&request.method==='GET')return json({results:await researchMWBE(url.searchParams.get('q')),coverage:'NYC certified business dataset; not a nationwide directory. Use source links or imports for other jurisdictions.'});
 const body=request.method==='POST'?await requestJSON(request):{};const id=text(body.lead_id||url.searchParams.get('lead_id'),160);const row=await one(db,'SELECT * FROM discovery_leads WHERE id=? AND team=?',id,TEAM);const lead=leadFromRow(row);
 if(!row||!lead||!canReadLead(row,lead,user))throw new HttpError(404,'Lead not found.');
 if(path==='/api/research/records'&&request.method==='GET')return json({records:array(lead.research_records).filter(r=>r.status!=='machine_matched'||(r.engine_version===3&&r.subject_signature===researchSignature(lead))),native_research:Object.fromEntries(Object.entries(lead.native_research||{}).filter(([,v])=>v.engine_version===3&&v.signature===researchSignature(lead))),profile:researchProfile(lead)});
 if(path==='/api/research/job'&&request.method==='GET')return json({job:env.RESEARCH_JOBS?await env.RESEARCH_JOBS.status(id,user):null});
 if(request.method!=='POST')throw new HttpError(405,'Method not allowed.');
 if(user.role!=='admin'&&row.owner_user_id!==user.user_id&&lower(row.owner_email)!==lower(user.email))throw new HttpError(403,'Only the lead owner can add research.');
 if(path==='/api/research/job'){if(!env.RESEARCH_JOBS)throw new HttpError(503,'Background research is not configured.');return json({job:await env.RESEARCH_JOBS.enqueue(id,user,researchSignature(lead))},202);}
 const source=RESEARCH_SOURCES.find(s=>s.id===body.source);if(!source)throw new HttpError(422,'Choose a source.');
 if(path==='/api/research/auto'){
   if(!env.NATIVE_RESEARCH)throw new HttpError(503,'Automatic research is not available on this deployment.');
   const signature=researchSignature(lead);
   if(body.identity_signature&&body.identity_signature!==signature)throw new HttpError(409,'Lead identity changed. Start a new research job.');
   const cached=lead.native_research?.[source.id];
   if(cached?.engine_version===3&&cached?.signature===signature&&(source.id!=='warn'||cached.feed_version===2)&&Date.now()-Date.parse(cached.checked_at)<(cached.status==='partial'?60000:3600000))return json({...cached,cached:true});
   const result=await env.NATIVE_RESEARCH(lead,source.id);
   const fresh=await one(db,'SELECT * FROM discovery_leads WHERE id=? AND team=?',id,TEAM);const current=leadFromRow(fresh);
   if(!current||!canReadLead(fresh,current,user)||(user.role!=='admin'&&fresh.owner_user_id!==user.user_id&&lower(fresh.owner_email)!==lower(user.email)))throw new HttpError(403,'Lead access changed.');
   if(researchSignature(current)!==signature)throw new HttpError(409,'Lead details changed. Research this lead again.');
   const records=array(current.research_records).filter(r=>r.status!=='machine_matched'||(r.engine_version===3&&r.subject_signature===signature));
   const persisted=[];let omitted=0;
   for(const record of result.records){const duplicate=records.find(r=>r.source===source.id&&(record.event?.id?r.event?.id===record.event.id:r.url===record.url&&r.excerpt===record.excerpt));if(duplicate){persisted.push(duplicate);continue;}if(records.length>=100){omitted++;continue;}const saved={...record,subject_signature:signature,engine_version:3,id:uid('research'),label:source.label};records.push(saved);persisted.push(saved);}
   result.records=persisted;result.engine_version=3;result.omitted_records=omitted;
   if(omitted){result.limitations=[...(result.limitations||[]),omitted+' records could not be saved because the profile is full.'];if(!persisted.length)result.status='partial';}
   current.native_research={...(current.native_research||{}),[source.id]:{...result,signature}};
   current.research_records=records;
   const updated=await db.prepare('UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=? AND payload=?').bind(JSON.stringify(current),id,TEAM,fresh.payload).run();
   if(updated.meta.changes!==1)throw new HttpError(409,'Another change was saved. Retry research to resume.');
   return json(result);
 }
 if(path==='/api/research/preview'){
   let content=text(body.excerpt,1500),resolved=safeTargetUrl(body.url)?.href,method='user_excerpt';
   if(body.csv){const records=researchCSV(body.csv);const matches=records.map(r=>Object.entries(r).filter(([k])=>!/ethnic|race|gender|sex|religio/i.test(k)).map(([k,v])=>k+': '+v).join(' | ')).filter(t=>researchMatch(lead,t,source.scope));return json({matches:matches.slice(0,20).map(t=>t.slice(0,1500)),total:matches.length,note:'Imported rows are unverified. Select a matching row and confirm its source date.'});}
   if(!content){
     const target=safeTargetUrl(body.url);if(!target)throw new HttpError(422,'Enter a public page URL.');if(restrictedCrawlReason(target))throw new HttpError(422,'Use an authorized export or short excerpt for this source.');
     try{const robots=await fetchPublicPage(new URL('/robots.txt',target).href,5000);if(!robotsAllowed(robots.html,target.pathname))throw new HttpError(422,'This website does not allow this crawler. Use an authorized excerpt.');}catch(e){if(e instanceof HttpError)throw e;if(!/^HTTP 40[04]/.test(e.message))throw new HttpError(422,'Could not check website access. Use an authorized excerpt.');}
     let page;try{page=await fetchPublicPage(target.href,12000);}catch{throw new HttpError(422,'Could not read this public HTML page. For PDF or interactive sources, use a short excerpt or CSV export.');}resolved=page.url;const plain=htmlText(page.html);const needle=source.scope==='company'?lead.company:[lead.first_name,lead.last_name].join(' ');const at=plain.toLowerCase().indexOf(String(needle).toLowerCase());content=plain.slice(Math.max(0,at-150),Math.max(0,at-150)+1200);method='fetched_page';
   }
   return json({excerpt:content,url:resolved,match:researchMatch(lead,content,source.scope),method,note:source.note});
 }
 if(path==='/api/research/save'){
   const record=researchRecord(lead,body);const previous=array(lead.research_records);if(previous.some(r=>r.source===record.source&&r.url===record.url&&r.excerpt===record.excerpt))return json({saved:false,duplicate:true});if(previous.length>=100)throw new HttpError(422,'This profile already contains 100 research records.');lead.research_records=[...previous,{...record,reviewed_by:user.email}];
   const result=await db.prepare('UPDATE discovery_leads SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND team=? AND payload=?').bind(JSON.stringify(lead),id,TEAM,row.payload).run();if(result.meta.changes!==1)throw new HttpError(409,'This lead changed. Reload before saving research.');return json({saved:true,record});
 }
 throw new HttpError(404,'Research action not found.');
}


export function researchProfile(lead){
 const records=array(lead.research_records).filter(r=>r.status!=='machine_matched'||(r.engine_version===3&&r.subject_signature===researchSignature(lead)));
 const groups=RESEARCH_SOURCES.map(s=>({label:s.label,source:s.id,records:records.filter(r=>r.source===s.id).slice(0,5)})).filter(g=>g.records.length);
 const urls=new Set(records.map(r=>r.url));const gaps=[];
 if(!records.some(r=>r.scope==='person'))gaps.push('No person-level identity evidence has been saved.');
 if(!records.some(r=>r.source_date))gaps.push('No dated source evidence has been saved.');
 const warnings=['Saved lead details are input data, not newly verified facts.','Employer events do not establish individual circumstances or intent.'];
 if(records.some(r=>r.source==='warn'))warnings.push('Confirm the affected worksite and whether this person is involved before discussing a WARN event.');
 const facts=[];for(const r of records)for(const f of array(r.facts)){if(typeof f.field==='string'&&typeof f.value==='string')facts.push({...f,scope:r.scope,url:r.url,date:r.source_date,status:r.status});}
 const conflicts=[...new Set(facts.map(f=>f.field))].filter(field=>new Set(facts.filter(f=>f.field===field).map(f=>lower(f.value))).size>1);
 return {facts,conflicts,identity:{name:[lead.first_name,lead.last_name].filter(Boolean).join(' '),company:lead.company||'Unknown',role:lead.current_title||'Unknown',location:lead.location||lead.city||'Unknown'},groups,source_pages:urls.size,gaps,warnings};
}
