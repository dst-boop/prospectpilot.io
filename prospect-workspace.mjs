import {randomUUID} from 'node:crypto';
import {nameKey,hash,csvCell,publicURL} from './lead-quality.mjs';
import {normalizeContact,parseContactCSV,normalizeCountry,normalizeState,countryAliases,stateAliases,sharedMailbox,contactQuality} from './prospect-data-quality.mjs';
export {normalizeContact} from './prospect-data-quality.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const text=(v,max=200)=>String(v??'').normalize('NFKC').trim().slice(0,max);
export function contactIdentities(c){return [c.linkedin_url&&`linkedin:${c.linkedin_url}`,c.email&&!sharedMailbox(c.email)&&`email:${c.email}`,c.company&&`person:${nameKey(c.first_name)}|${nameKey(c.last_name)}|${nameKey(c.company)}|${nameKey(normalizeCountry(c.country))}|${nameKey(normalizeState(c.state,c.country))}|${nameKey(c.city)}`].filter(Boolean);}
export function identityLookupKeys(c){return [...new Set([...contactIdentities(c),...(c.company?countryAliases(c.country).flatMap(country=>stateAliases(c.state,c.country).map(state=>`person:${nameKey(c.first_name)}|${nameKey(c.last_name)}|${nameKey(c.company)}|${nameKey(country)}|${nameKey(state)}|${nameKey(c.city)}`)):[])])];}
const identities=contactIdentities;
export function searchFilters(input={}) {
 const allowed=['q','title','company','country','state','city','industry','seniority','email_status','has_email','has_phone','list_id','suppressed'];
 const filters=Object.fromEntries(allowed.map(k=>[k,text(input[k],150)]));
 if(filters.email_status&&!['missing','unverified','valid','invalid','catch_all','unknown'].includes(filters.email_status))throw fail(422,'Invalid email status.');
 for(const key of ['has_email','has_phone','suppressed'])if(filters[key]&&!['true','false'].includes(filters[key]))throw fail(422,'Invalid contact filter.');
 filters.country=normalizeCountry(filters.country);filters.state=normalizeState(filters.state,filters.country);
 return filters;
}
async function tx(pool,fn){const c=await pool.connect();let broken;try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){try{await c.query('ROLLBACK');}catch(error){broken=error;}throw e;}finally{c.release(broken);}}
export function createProspectWorkspace({pool,jobs}) {
 async function expireVerification(user){const now=new Date(),cutoff=new Date(now.getTime()-30*86400000).toISOString();await pool.query(`UPDATE prospect_contacts SET payload=jsonb_set(payload,'{email_status}','"unverified"'),updated_at=now() WHERE user_id=$1 AND payload->>'email_status' IN ('valid','invalid','catch_all','unknown') AND (payload->'email_verification'->>'email' IS DISTINCT FROM payload->>'email' OR COALESCE(payload->'email_verification'->>'checked_at','')<$2 OR payload->'email_verification'->>'checked_at'>$3)`,[user.uid,cutoff,now.toISOString()]);}
 const ownedList=async(c,user,id)=>{const row=(await c.query('SELECT * FROM prospect_lists WHERE id=$1 AND user_id=$2',[id,user.uid])).rows[0];if(!row)throw fail(404,'List not found.');return row;};
 async function lists(user){return {lists:(await pool.query(`SELECT l.*,count(m.contact_id)::int AS contacts FROM prospect_lists l LEFT JOIN prospect_list_members m ON m.list_id=l.id WHERE l.user_id=$1 GROUP BY l.id ORDER BY l.created_at DESC,l.id`,[user.uid])).rows};}
 async function createList(user,input){const name=text(input.name,100);if(!name)throw fail(422,'Name your list.');try{return (await pool.query('INSERT INTO prospect_lists(id,user_id,name) VALUES($1,$2,$3) RETURNING *',[randomUUID(),user.uid,name])).rows[0];}catch(e){if(e.code==='23505')throw fail(409,'A list with this name already exists.');throw e;}}
 function ids(input){if(!Array.isArray(input)||!input.length||input.length>5000||input.some(v=>typeof v!=='string'||v.length>100))throw fail(422,'Choose 1–5,000 contacts.');return [...new Set(input)];}
 async function membership(user,listId,input,remove=false){const selected=ids(input.ids);return tx(pool,async c=>{await ownedList(c,user,listId);const owned=(await c.query('SELECT id FROM prospect_contacts WHERE user_id=$1 AND id=ANY($2::text[])',[user.uid,selected])).rows;if(owned.length!==selected.length)throw fail(404,'One or more contacts are unavailable.');if(remove)await c.query('DELETE FROM prospect_list_members WHERE list_id=$1 AND contact_id=ANY($2::text[])',[listId,selected]);else await c.query('INSERT INTO prospect_list_members(list_id,contact_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[listId,selected]);return {affected:selected.length};});}
 async function search(user,input={}) {
  await expireVerification(user);
  const filters=searchFilters(input),limit=Number(input.limit??50),offset=Number(input.offset??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000000)throw fail(422,'Invalid page.');
  if(filters.list_id)await ownedList(pool,user,filters.list_id);
  const values=[user.uid],where=['c.user_id=$1'];
  const bind=value=>{values.push(value);return '$'+values.length;};
  for(const key of ['title','company','city','industry','seniority'])if(filters[key])where.push(`strpos(lower(COALESCE(c.payload->>'${key}','')),lower(${bind(filters[key])}))>0`);
  for(const key of ['country','state'])if(filters[key])where.push(`lower(COALESCE(c.payload->>'${key}',''))=ANY(${bind((key==='country'?countryAliases(filters.country):stateAliases(filters.state,filters.country)).map(value=>value.toLowerCase()))}::text[])`);
  if(filters.q){const q=bind(filters.q);where.push(`strpos(lower(concat_ws(' ',c.payload->>'first_name',c.payload->>'last_name',c.payload->>'company',c.payload->>'title',c.payload->>'email')),lower(${q}))>0`);}
  if(filters.email_status)where.push(`c.payload->>'email_status'=${bind(filters.email_status)}`);
  for(const [flag,key] of [['has_email','email'],['has_phone','phone']])if(filters[flag])where.push(`COALESCE(c.payload->>'${key}','')${filters[flag]==='true'?'<>':'='}''`);
  if(filters.suppressed)where.push(`COALESCE(c.payload->>'suppressed','false')=${bind(filters.suppressed)}`);
  if(filters.list_id)where.push(`EXISTS(SELECT 1 FROM prospect_list_members m WHERE m.contact_id=c.id AND m.list_id=${bind(filters.list_id)})`);
  const condition=where.join(' AND ');
  const total=Number((await pool.query(`SELECT count(*) AS n FROM prospect_contacts c WHERE ${condition}`,values)).rows[0].n);
  const pagination=[...values,limit,offset];
  const contacts=(await pool.query(`SELECT c.id,c.payload,c.created_at,c.updated_at FROM prospect_contacts c WHERE ${condition} ORDER BY c.created_at DESC,c.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,pagination)).rows.map(r=>({id:r.id,...r.payload,created_at:r.created_at,updated_at:r.updated_at,quality:contactQuality({...r.payload,created_at:r.created_at})}));
  return {contacts,total,offset,limit,filters};
 }
 async function importCSV(user,input,{preview=false}={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail(422,'Provide a CSV import object.');
  const format=input.format||'generic';if(!['generic','zoominfo'].includes(format))throw fail(422,'Choose a supported CSV format.');
  const parsed=parseContactCSV(input.csv),{headers,records}=parsed;
  const source=text(input.source)||(format==='zoominfo'?'ZoomInfo CSV export':'CSV import');
  const sourceURL=input.source_url?publicURL(input.source_url):'';
  if(input.source_url&&(!sourceURL||sourceURL.length>1000))throw fail(422,'Provide a public HTTP or HTTPS source URL without credentials.');
  const observed=input.source_observed_at||'';
  if(observed&&(!/^\d{4}-\d{2}-\d{2}$/.test(observed)||!Number.isFinite(Date.parse(observed))||new Date(observed).toISOString().slice(0,10)!==observed||observed>new Date().toISOString().slice(0,10)))throw fail(422,'Use a valid source date, no later than today.');
  const fingerprint=hash(input.csv+'\0'+source+'\0'+text(input.list_id)+(format==='zoominfo'?'\0zoominfo':'')+(sourceURL||observed?'\0'+sourceURL+'\0'+observed:''));
  return tx(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect:${user.uid}`]);
   if(input.list_id)await ownedList(c,user,input.list_id);
   const previous=(await c.query('SELECT result FROM prospect_imports WHERE user_id=$1 AND fingerprint=$2',[user.uid,fingerprint])).rows[0];if(previous)return {...previous.result,replayed:true,preview};
   const result={id:randomUUID(),added:0,duplicates:0,conflicts:0,rejected:0,errors:[],rows:[],preview,replayed:false,total:records.length,mapped_columns:parsed.mapped_columns,ignored_columns:parsed.ignored_columns};
   const prepared=records.map(({cells,row})=>{
    try{
     if(cells.length!==headers.length)throw fail(422,'Row has the wrong number of columns.');
     const contact=normalizeContact(Object.fromEntries(headers.map((h,i)=>[h,cells[i]])),source);
     if(format==='zoominfo')contact.source_kind='zoominfo_csv';
     const keys=identities(contact);if(!keys.length)throw fail(422,'Include company, individual work email or LinkedIn URL.');
     return {row,contact,keys:identityLookupKeys(contact)};
    }catch(error){return {row,error:error.message};}
   });
   const allKeys=[...new Set(prepared.flatMap(record=>record.keys||[]))];
   const existing=allKeys.length?(await c.query('SELECT id,payload,identity_keys FROM prospect_contacts WHERE user_id=$1 AND identity_keys ?| $2::text[] FOR UPDATE',[user.uid,allKeys])).rows:[];
   const byId=new Map(existing.map(row=>[row.id,row])),byKey=new Map();
   const changed=new Map();
   const indexRow=row=>{byId.set(row.id,row);for(const key of row.identity_keys){if(!byKey.has(key))byKey.set(key,new Set());byKey.get(key).add(row.id);}};
   existing.forEach(indexRow);
   const report=(row,status,message,contact)=>{
    result.rows.push({row,status,message,name:contact?`${contact.first_name} ${contact.last_name}`:'',issues:contact?contactQuality(contact).issues:[]});
    if(['rejected','conflict'].includes(status)&&result.errors.length<50)result.errors.push({row,message});
   };
   const now=new Date().toISOString();
   for(const record of prepared){
    if(record.error){result.rejected++;report(record.row,'rejected',record.error);continue;}
    const {contact,keys}=record;
    const matches=[...new Set(keys.flatMap(key=>[...(byKey.get(key)||[])]))].map(id=>byId.get(id));
    if(matches.length>1){result.conflicts++;report(record.row,'conflict','Identifiers match more than one existing contact. Review the identity before importing.',contact);continue;}
    let id=matches[0]?.id||randomUUID();
    const evidence={source,kind:contact.source_kind,import_id:result.id,row:record.row,imported_at:now,observed_at:observed||null,url:sourceURL||null};
    contact.source_observed_at=observed||null;contact.last_seen_at=now;
    if(matches.length){const old=matches[0].payload;
     if(['first_name','last_name','linkedin_url','email'].some(k=>old[k]&&contact[k]&&(k==='email'||k==='linkedin_url'?old[k]!==contact[k]:nameKey(old[k])!==nameKey(contact[k])))){result.conflicts++;report(record.row,'conflict','Matched identifier has a different name, email or LinkedIn profile. Existing record preserved.',contact);continue;}
     const strong=keys.some(key=>(key.startsWith('email:')||key.startsWith('linkedin:'))&&identities(old).includes(key));
     const newIdentity=['email','linkedin_url','phone'].some(key=>contact[key]&&contact[key]!==old[key]);
     if(!strong&&newIdentity){result.conflicts++;report(record.row,'conflict','Name and company match only; a new contact identifier needs review to avoid merging namesakes.',contact);continue;}
     const merged={...old};for(const [k,v] of Object.entries(contact))if(!merged[k]&&v&&k!=='source_kind')merged[k]=v;
     // Never overwrite verification or clear a suppression through a CSV import.
     merged.suppressed=old.suppressed||contact.suppressed;
     if(!old.email&&merged.email)merged.email_status='unverified';if(!old.phone&&merged.phone)merged.phone_status='unverified';
     const differing=['title','company','country','state','city','phone'].filter(key=>old[key]&&contact[key]&&nameKey(old[key])!==nameKey(contact[key]));
     merged.source_history=[...(old.source_history||[{source:old.source,kind:old.source_kind,imported_at:null,observed_at:old.source_observed_at||null}]),{...evidence,differing_fields:differing}].slice(-20);
     merged.last_seen_at=now;
     merged.field_sources={...(old.field_sources||{})};for(const key of Object.keys(contact))if(!old[key]&&contact[key]&&parsed.mapped_columns.includes(key))merged.field_sources[key]=evidence;
     // Import recency never refreshes the observation date of existing field values.
     merged.source_observed_at=old.source_observed_at||null;
     changed.set(id,{id,payload:merged,identity_keys:identities(merged)});
     indexRow({id,payload:merged,identity_keys:identities(merged)});result.duplicates++;
     report(record.row,'duplicate',differing.length?`Existing values preserved; source differs in: ${differing.join(', ')}.`:'Matched an existing contact; missing fields can be added without replacing verified data.',merged);
    }else{
     contact.source_history=[evidence];contact.field_sources=Object.fromEntries(parsed.mapped_columns.filter(key=>contact[key]).map(key=>[key,evidence]));
     changed.set(id,{id,payload:contact,identity_keys:identities(contact)});
     indexRow({id,payload:contact,identity_keys:identities(contact)});result.added++;report(record.row,'added','New contact; imported contact channels remain unverified.',contact);
    }
   }
   if(!preview){
    // Keep one atomic import while avoiding a database round trip for every row.
    const writes=[...changed.values()];
    for(let start=0;start<writes.length;start+=100)await c.query(`INSERT INTO prospect_contacts(id,user_id,payload,identity_keys)
     SELECT value->>'id',$1,value->'payload',value->'identity_keys' FROM jsonb_array_elements($2::jsonb)
     ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,identity_keys=EXCLUDED.identity_keys,updated_at=now()
     WHERE prospect_contacts.user_id=$1`,[user.uid,JSON.stringify(writes.slice(start,start+100))]);
    if(input.list_id&&writes.length)await c.query('INSERT INTO prospect_list_members(list_id,contact_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[input.list_id,writes.map(row=>row.id)]);
   }
   if(!preview)await c.query('INSERT INTO prospect_imports(id,user_id,fingerprint,source,result) VALUES($1,$2,$3,$4,$5::jsonb)',[result.id,user.uid,fingerprint,source,JSON.stringify(result)]);return result;
  });
 }
 async function exportCSV(user,input){await expireVerification(user);const selected=ids(input.ids),rows=(await pool.query('SELECT id,payload FROM prospect_contacts WHERE user_id=$1 AND id=ANY($2::text[]) ORDER BY id',[user.uid,selected])).rows;if(rows.length!==selected.length)throw fail(404,'One or more contacts are unavailable.');const fields=['first_name','last_name','title','company','company_domain','industry','seniority','city','state','country','email','email_status','phone','phone_status','linkedin_url','source'];const included=rows.filter(r=>r.payload.suppressed!==true);return new Response('\uFEFF'+[fields,...included.map(r=>fields.map(k=>r.payload[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="prospectpilot-contacts.csv"','Cache-Control':'private, no-store','X-Excluded-Suppressed':String(rows.length-included.length)}});}
 async function qualitySummary(user){
  await expireVerification(user);
  const summary=(await pool.query(`SELECT count(*)::int AS contacts,
   count(*) FILTER(WHERE payload->>'email_status'='valid')::int AS verified_emails,
   count(*) FILTER(WHERE payload->>'email_status'='unverified')::int AS unverified_emails,
   count(*) FILTER(WHERE payload->>'email_status'='invalid')::int AS invalid_emails,
   count(*) FILTER(WHERE payload->>'suppressed'='true')::int AS suppressed,
   count(*) FILTER(WHERE COALESCE(payload->>'email','')='' AND COALESCE(payload->>'phone','')='' AND COALESCE(payload->>'linkedin_url','')='')::int AS no_contact_route,
   count(*) FILTER(WHERE COALESCE(payload->>'source_observed_at','')='')::int AS source_date_unknown,
   count(*) FILTER(WHERE COALESCE(payload->>'source_observed_at','')<>'' AND payload->>'source_observed_at'<$2)::int AS source_older_than_180_days
   FROM prospect_contacts WHERE user_id=$1`,[user.uid,new Date(Date.now()-180*86400000).toISOString().slice(0,10)])).rows[0];
  const sources=(await pool.query(`SELECT source,count(*)::int AS imports,max(created_at) AS last_import,
   COALESCE(sum((result->>'added')::int),0)::int AS added,COALESCE(sum((result->>'duplicates')::int),0)::int AS duplicates,
   COALESCE(sum((result->>'conflicts')::int),0)::int AS conflicts,COALESCE(sum((result->>'rejected')::int),0)::int AS rejected
   FROM prospect_imports WHERE user_id=$1 GROUP BY source ORDER BY max(created_at) DESC LIMIT 50`,[user.uid])).rows;
  const imports=(await pool.query(`SELECT id,source,created_at,result-'rows' AS summary FROM prospect_imports WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20`,[user.uid])).rows;
  const coverage=(await pool.query(`SELECT COALESCE(NULLIF(payload->>'source',''),'Unknown source') AS source,
   count(*)::int AS contacts,count(*) FILTER(WHERE COALESCE(payload->>'email','')<>'')::int AS emails,
   count(*) FILTER(WHERE payload->>'email_status'='valid')::int AS valid_emails,
   count(*) FILTER(WHERE payload->>'email_status'='invalid')::int AS invalid_emails,
   count(*) FILTER(WHERE payload->>'suppressed'='true')::int AS suppressed,
   count(*) FILTER(WHERE COALESCE(payload->>'source_observed_at','')='')::int AS unknown_dates
   FROM prospect_contacts WHERE user_id=$1 GROUP BY 1 ORDER BY count(*) DESC,1 LIMIT 50`,[user.uid])).rows;
  return {summary,sources,coverage,imports,limits:{sources:50,imports:20}};
 }
 async function route(request,user){if(!user?.uid)throw fail(401,'Sign in.');const url=new URL(request.url),path=url.pathname,method=request.method;const body=async()=>{try{return await request.json();}catch{throw fail(422,'Invalid JSON.');}};
  if(jobs && (path==='/api/prospect/providers'||path.startsWith('/api/prospect/jobs')))return jobs.route(request,user);
  if(path==='/api/prospect/contacts'&&method==='GET')return search(user,Object.fromEntries(url.searchParams));
  if(path==='/api/prospect/data-quality'&&method==='GET')return qualitySummary(user);
  const importReport=path.match(/^\/api\/prospect\/imports\/([^/]+)$/);
  if(importReport&&method==='GET'){
   const row=(await pool.query('SELECT id,source,created_at,result FROM prospect_imports WHERE id=$1 AND user_id=$2',[importReport[1],user.uid])).rows[0];
   if(!row)throw fail(404,'Import report not found.');return row;
  }
  const contact=path.match(/^\/api\/prospect\/contacts\/([^/]+)$/);
  if(contact&&method==='GET'){
   await expireVerification(user);
   const row=(await pool.query('SELECT id,payload,created_at,updated_at FROM prospect_contacts WHERE id=$1 AND user_id=$2',[contact[1],user.uid])).rows[0];
   if(!row)throw fail(404,'Contact not found.');
   const memberships=(await pool.query('SELECT l.id,l.name FROM prospect_lists l JOIN prospect_list_members m ON m.list_id=l.id WHERE m.contact_id=$1 AND l.user_id=$2 ORDER BY l.name',[row.id,user.uid])).rows;
   return {contact:{id:row.id,...row.payload,created_at:row.created_at,updated_at:row.updated_at,quality:contactQuality({...row.payload,created_at:row.created_at})},lists:memberships};
  }
  if(contact&&method==='PATCH'){
   const input=await body();if(typeof input.suppressed!=='boolean'||Object.keys(input).some(k=>k!=='suppressed'))throw fail(422,'Provide only a boolean suppression setting.');
   const result=await pool.query("UPDATE prospect_contacts SET payload=jsonb_set(payload,'{suppressed}',$1::jsonb),updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING id",[JSON.stringify(input.suppressed),contact[1],user.uid]);
   if(!result.rows.length)throw fail(404,'Contact not found.');return {id:contact[1],suppressed:input.suppressed};
  }
  if(path==='/api/prospect/lists'&&method==='GET')return lists(user);
  if(path==='/api/prospect/lists'&&method==='POST')return createList(user,await body());
  const list=path.match(/^\/api\/prospect\/lists\/([^/]+)$/);
  if(list&&method==='PATCH'){const name=text((await body()).name,100);if(!name)throw fail(422,'Name your list.');try{const row=(await pool.query('UPDATE prospect_lists SET name=$1 WHERE id=$2 AND user_id=$3 RETURNING *',[name,list[1],user.uid])).rows[0];if(!row)throw fail(404,'List not found.');return row;}catch(e){if(e.code==='23505')throw fail(409,'A list with this name already exists.');throw e;}}
  if(list&&method==='DELETE'){return tx(pool,async c=>{await ownedList(c,user,list[1]);await c.query('DELETE FROM prospect_lists WHERE id=$1 AND user_id=$2',[list[1],user.uid]);await c.query("UPDATE prospect_saved_searches SET filters=filters-'list_id' WHERE user_id=$1 AND filters->>'list_id'=$2",[user.uid,list[1]]);return {deleted:true};});}
  if(path==='/api/prospect/import'&&method==='POST')return importCSV(user,await body());
  if(path==='/api/prospect/import/preview'&&method==='POST')return importCSV(user,await body(),{preview:true});
  if(path==='/api/prospect/export'&&method==='POST')return exportCSV(user,await body());
  const member=path.match(/^\/api\/prospect\/lists\/([^/]+)\/members$/);
  if(member&&['POST','DELETE'].includes(method))return membership(user,member[1],await body(),method==='DELETE');
  if(path==='/api/prospect/saved-searches'&&method==='GET')return {searches:(await pool.query('SELECT * FROM prospect_saved_searches WHERE user_id=$1 ORDER BY created_at DESC',[user.uid])).rows};
  const saved=path.match(/^\/api\/prospect\/saved-searches\/([^/]+)$/);
  if(saved&&method==='DELETE'){const result=await pool.query('DELETE FROM prospect_saved_searches WHERE id=$1 AND user_id=$2 RETURNING id',[saved[1],user.uid]);if(!result.rows.length)throw fail(404,'Saved search not found.');return {deleted:true};}
  if(path==='/api/prospect/saved-searches'&&method==='POST'){const input=await body(),name=text(input.name,100);if(!name)throw fail(422,'Name your search.');try{return (await pool.query('INSERT INTO prospect_saved_searches(id,user_id,name,filters) VALUES($1,$2,$3,$4::jsonb) RETURNING *',[randomUUID(),user.uid,name,JSON.stringify(searchFilters(input.filters))])).rows[0];}catch(e){if(e.code==='23505')throw fail(409,'A search with this name exists.');throw e;}}
  throw fail(404,'Prospect endpoint not found.');
 }
 return {route,search,lists,createList,membership,importCSV,exportCSV,qualitySummary};
}
