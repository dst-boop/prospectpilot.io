import {randomUUID} from 'node:crypto';
import {emailAddress,phoneNumber,linkedinURL,nameKey,hash,csvCell} from './lead-quality.mjs';
import {csvRows} from './warn.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const text=(v,max=200)=>String(v??'').normalize('NFKC').trim().slice(0,max);
const ALIASES={first_name:['first name','firstname','contact first name'],last_name:['last name','lastname','contact last name'],company:['company','company name','employer'],title:['title','job title','position','current title'],email:['email','work email','email address','business email','contact email'],phone:['phone','business phone','direct phone','direct phone number'],linkedin_url:['linkedin url','linkedin profile url','linkedin contact profile url'],country:['country','contact country'],state:['state','region','contact state'],city:['city','contact city'],company_domain:['company domain','domain','company website'],industry:['industry','primary industry'],seniority:['seniority','seniority level','management level'],suppressed:['suppressed','do not contact']};
const canonical=v=>nameKey(v).replaceAll(' ','');
const aliasMap=new Map(Object.entries(ALIASES).flatMap(([key,values])=>[key,...values].map(v=>[canonical(v),key])));
export function normalizeContact(raw,source) {
 const mapped=Object.fromEntries(Object.entries(raw).flatMap(([key,value])=>aliasMap.has(canonical(key))?[[aliasMap.get(canonical(key)),value]]:[]));
 const contact=Object.fromEntries(Object.keys(ALIASES).map(key=>[key,text(mapped[key])]));
 if(!contact.first_name||!contact.last_name)throw fail(422,'First and last name are required.');
 contact.email=emailAddress(mapped.email);contact.phone=phoneNumber(mapped.phone);contact.linkedin_url=linkedinURL(mapped.linkedin_url);
 if(mapped.email&&!contact.email)throw fail(422,'Invalid email address.');
 if(mapped.phone&&!contact.phone)throw fail(422,'Use a valid US phone number.');
 if(mapped.linkedin_url&&!contact.linkedin_url)throw fail(422,'Use a LinkedIn person profile URL.');
 contact.company_domain=contact.company_domain.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
 if(contact.company_domain&&!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(contact.company_domain))throw fail(422,'Company domain must be a hostname without a path.');
 contact.suppressed=/^(true|yes|1|do not contact)$/i.test(text(mapped.suppressed));
 contact.email_status=contact.email?'unverified':'missing';contact.phone_status=contact.phone?'unverified':'missing';
 contact.source=text(source)||'CSV import';contact.source_kind='import';
 return contact;
}
export function contactIdentities(c){return [c.linkedin_url&&`linkedin:${c.linkedin_url}`,c.email&&!/^(info|sales|hello|contact|support|office|admin)@/.test(c.email)&&`email:${c.email}`,c.company&&`person:${nameKey(c.first_name)}|${nameKey(c.last_name)}|${nameKey(c.company)}|${nameKey(c.country)}|${nameKey(c.state)}|${nameKey(c.city)}`].filter(Boolean);}
const identities=contactIdentities;
export function searchFilters(input={}) {
 const allowed=['q','title','company','country','state','city','industry','seniority','email_status','has_email','has_phone','list_id'];
 const filters=Object.fromEntries(allowed.map(k=>[k,text(input[k],150)]));
 if(filters.email_status&&!['missing','unverified','valid','invalid','catch_all','unknown'].includes(filters.email_status))throw fail(422,'Invalid email status.');
 for(const key of ['has_email','has_phone'])if(filters[key]&&!['true','false'].includes(filters[key]))throw fail(422,'Invalid contact filter.');
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
  for(const key of ['title','company','country','state','city','industry','seniority'])if(filters[key])where.push(`strpos(lower(COALESCE(c.payload->>'${key}','')),lower(${bind(filters[key])}))>0`);
  if(filters.q){const q=bind(filters.q);where.push(`strpos(lower(concat_ws(' ',c.payload->>'first_name',c.payload->>'last_name',c.payload->>'company',c.payload->>'title',c.payload->>'email')),lower(${q}))>0`);}
  if(filters.email_status)where.push(`c.payload->>'email_status'=${bind(filters.email_status)}`);
  for(const [flag,key] of [['has_email','email'],['has_phone','phone']])if(filters[flag])where.push(`COALESCE(c.payload->>'${key}','')${filters[flag]==='true'?'<>':'='}''`);
  if(filters.list_id)where.push(`EXISTS(SELECT 1 FROM prospect_list_members m WHERE m.contact_id=c.id AND m.list_id=${bind(filters.list_id)})`);
  const condition=where.join(' AND ');
  const total=Number((await pool.query(`SELECT count(*) AS n FROM prospect_contacts c WHERE ${condition}`,values)).rows[0].n);
  const pagination=[...values,limit,offset];
  const contacts=(await pool.query(`SELECT c.id,c.payload,c.created_at,c.updated_at FROM prospect_contacts c WHERE ${condition} ORDER BY c.created_at DESC,c.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,pagination)).rows.map(r=>({id:r.id,...r.payload,created_at:r.created_at,updated_at:r.updated_at}));
  return {contacts,total,offset,limit,filters};
 }
 async function importCSV(user,input){
  const format=input.format||'generic';if(!['generic','zoominfo'].includes(format))throw fail(422,'Choose a supported CSV format.');
  if(typeof input.csv!=='string'||Buffer.byteLength(input.csv)>4000000)throw fail(422,'Choose a CSV up to 4 MB.');
  let rows;try{rows=csvRows(input.csv);}catch{throw fail(422,'Malformed CSV quoting.');}
  if(rows.length<2||rows.length>5001)throw fail(422,'Include headers and 1–5,000 rows.');
  const headers=rows.shift().map(h=>h.replace(/^\uFEFF/,''));
  const known=headers.map(h=>aliasMap.get(canonical(h))).filter(Boolean);
  if(new Set(known).size!==known.length||new Set(headers.map(canonical)).size!==headers.length)throw fail(422,'Duplicate CSV columns.');
  if(!known.includes('first_name')||!known.includes('last_name'))throw fail(422,'Include First Name and Last Name columns.');
  const source=text(input.source)||(format==='zoominfo'?'ZoomInfo CSV export':'CSV import'),fingerprint=hash(input.csv+'\0'+source+'\0'+text(input.list_id)+(format==='zoominfo'?'\0zoominfo':''));
  return tx(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect:${user.uid}`]);
   if(input.list_id)await ownedList(c,user,input.list_id);
   const previous=(await c.query('SELECT result FROM prospect_imports WHERE user_id=$1 AND fingerprint=$2',[user.uid,fingerprint])).rows[0];if(previous)return {...previous.result,replayed:true};
   const result={id:randomUUID(),added:0,duplicates:0,conflicts:0,rejected:0,errors:[],replayed:false};
   for(const [index,row] of rows.entries()){
    let contact,keys;try{if(row.length!==headers.length)throw fail(422,'Row has the wrong number of columns.');const raw=Object.fromEntries(headers.map((h,i)=>[h,format==='zoominfo'&&/^(n\/a|not available|--|-)$/i.test(row[i].trim())?'':row[i]]));contact=normalizeContact(raw,source);if(format==='zoominfo')contact.source_kind='zoominfo_csv';keys=identities(contact);if(!keys.length)throw fail(422,'Include company, individual work email or LinkedIn URL.');}catch(e){result.rejected++;if(result.errors.length<50)result.errors.push({row:index+2,message:e.message});continue;}
    const matches=(await c.query('SELECT id,payload FROM prospect_contacts WHERE user_id=$1 AND identity_keys ?| $2::text[]',[user.uid,keys])).rows;
    if(matches.length>1){result.conflicts++;continue;}
    let id=matches[0]?.id||randomUUID();
    if(matches.length){const old=matches[0].payload;
     if(['first_name','last_name','linkedin_url','email'].some(k=>old[k]&&contact[k]&&(k==='email'||k==='linkedin_url'?old[k]!==contact[k]:nameKey(old[k])!==nameKey(contact[k])))){result.conflicts++;continue;}
     const merged={...old};for(const [k,v] of Object.entries(contact))if(!merged[k]&&v&&k!=='source_kind')merged[k]=v;
     // Never overwrite verification or clear a suppression through a CSV import.
     merged.suppressed=old.suppressed||contact.suppressed;
     if(!old.email&&merged.email)merged.email_status='unverified';if(!old.phone&&merged.phone)merged.phone_status='unverified';
     await c.query('UPDATE prospect_contacts SET payload=$1::jsonb,identity_keys=$2::jsonb,updated_at=now() WHERE id=$3 AND user_id=$4',[JSON.stringify(merged),JSON.stringify(identities(merged)),id,user.uid]);result.duplicates++;
    }else{await c.query('INSERT INTO prospect_contacts(id,user_id,payload,identity_keys) VALUES($1,$2,$3::jsonb,$4::jsonb)',[id,user.uid,JSON.stringify(contact),JSON.stringify(keys)]);result.added++;}
    if(input.list_id)await c.query('INSERT INTO prospect_list_members(list_id,contact_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[input.list_id,id]);
   }
   await c.query('INSERT INTO prospect_imports(id,user_id,fingerprint,source,result) VALUES($1,$2,$3,$4,$5::jsonb)',[result.id,user.uid,fingerprint,source,JSON.stringify(result)]);return result;
  });
 }
 async function exportCSV(user,input){await expireVerification(user);const selected=ids(input.ids),rows=(await pool.query('SELECT id,payload FROM prospect_contacts WHERE user_id=$1 AND id=ANY($2::text[]) ORDER BY id',[user.uid,selected])).rows;if(rows.length!==selected.length)throw fail(404,'One or more contacts are unavailable.');const fields=['first_name','last_name','title','company','company_domain','industry','seniority','city','state','country','email','email_status','phone','phone_status','linkedin_url','source'];const included=rows.filter(r=>r.payload.suppressed!==true);return new Response('\uFEFF'+[fields,...included.map(r=>fields.map(k=>r.payload[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="prospectpilot-contacts.csv"','Cache-Control':'private, no-store','X-Excluded-Suppressed':String(rows.length-included.length)}});}
 async function route(request,user){if(!user?.uid)throw fail(401,'Sign in.');const url=new URL(request.url),path=url.pathname,method=request.method;const body=async()=>{try{return await request.json();}catch{throw fail(422,'Invalid JSON.');}};
  if(jobs && (path==='/api/prospect/providers'||path.startsWith('/api/prospect/jobs')))return jobs.route(request,user);
  if(path==='/api/prospect/contacts'&&method==='GET')return search(user,Object.fromEntries(url.searchParams));
  const contact=path.match(/^\/api\/prospect\/contacts\/([^/]+)$/);
  if(contact&&method==='GET'){
   await expireVerification(user);
   const row=(await pool.query('SELECT id,payload,created_at,updated_at FROM prospect_contacts WHERE id=$1 AND user_id=$2',[contact[1],user.uid])).rows[0];
   if(!row)throw fail(404,'Contact not found.');
   const memberships=(await pool.query('SELECT l.id,l.name FROM prospect_lists l JOIN prospect_list_members m ON m.list_id=l.id WHERE m.contact_id=$1 AND l.user_id=$2 ORDER BY l.name',[row.id,user.uid])).rows;
   return {contact:{id:row.id,...row.payload,created_at:row.created_at,updated_at:row.updated_at},lists:memberships};
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
  if(path==='/api/prospect/export'&&method==='POST')return exportCSV(user,await body());
  const member=path.match(/^\/api\/prospect\/lists\/([^/]+)\/members$/);
  if(member&&['POST','DELETE'].includes(method))return membership(user,member[1],await body(),method==='DELETE');
  if(path==='/api/prospect/saved-searches'&&method==='GET')return {searches:(await pool.query('SELECT * FROM prospect_saved_searches WHERE user_id=$1 ORDER BY created_at DESC',[user.uid])).rows};
  const saved=path.match(/^\/api\/prospect\/saved-searches\/([^/]+)$/);
  if(saved&&method==='DELETE'){const result=await pool.query('DELETE FROM prospect_saved_searches WHERE id=$1 AND user_id=$2 RETURNING id',[saved[1],user.uid]);if(!result.rows.length)throw fail(404,'Saved search not found.');return {deleted:true};}
  if(path==='/api/prospect/saved-searches'&&method==='POST'){const input=await body(),name=text(input.name,100);if(!name)throw fail(422,'Name your search.');try{return (await pool.query('INSERT INTO prospect_saved_searches(id,user_id,name,filters) VALUES($1,$2,$3,$4::jsonb) RETURNING *',[randomUUID(),user.uid,name,JSON.stringify(searchFilters(input.filters))])).rows[0];}catch(e){if(e.code==='23505')throw fail(409,'A search with this name exists.');throw e;}}
  throw fail(404,'Prospect endpoint not found.');
 }
 return {route,search,lists,createList,membership,importCSV,exportCSV};
}
