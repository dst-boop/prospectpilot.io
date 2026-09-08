// Google/PostgreSQL-only optimizations, applied on every generated build.
export function patchPerformance(worker){
 const old='  const visible = await visibleLeadRows(db, user);';
 const replacement=`  const visible = (await many(db, "SELECT id,owner_user_id,owner_email,payload,created_at,updated_at FROM discovery_leads WHERE team=? AND (owner_user_id=? OR lower(owner_email)=lower(?)) ORDER BY updated_at DESC", TEAM, user.user_id, user.email)).map(row=>{const lead=leadFromRow(row);return {row,lead:lead?qualifyLead(lead):null};}).filter(item=>item.lead&&isUsableStoredLead(item.lead)&&canReadLead(item.row,item.lead,user));`;
 if(worker.includes(old))worker=worker.replace(old,replacement);
 else if(!worker.includes('WHERE team=? AND (owner_user_id=? OR lower(owner_email)=lower(?))'))throw new Error('Weekly lead retrieval shape changed; review the performance patch');
 return worker;
}
