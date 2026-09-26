// "Delete this person" — one action that removes a person and everything the
// app learned about them, wherever this user holds it: the contact directory
// record, the Research Lab lead it is linked to, their observations,
// qualification, advisor activity, rest periods, call records, research jobs,
// the inputs and results of provider tasks about them, and their name in
// import reports.
//
// Three things deliberately survive, each without the person in it:
//  - a do-not-call block keeps the phone and the reason (an opt-out that
//    vanished with the record would let the number be dialled again);
//  - provider charges keep the amount spent (the budget ledger), while the
//    task that holds the person's details is blanked;
//  - a tombstone of HASHED identity keys, so an import or a research run
//    cannot quietly bring the person back. Hashes, not keys: the deletion
//    record must not itself be a copy of the person.
//
// Ported from Lead Qualifier's /api/leads/forget (dst-boop/lead-qualifier,
// ADR and LEARNINGS "There was no way to delete one person").
import {createHash,createHmac} from 'node:crypto';
import {candidateKeys} from './lead-quality.mjs';

export const LEAD_TEAM='wealth-management';
// Who may see (and so delete) a Research Lab lead: its owner, or an admin.
export const LEAD_VISIBLE_SQL=`team=$1 AND (owner_user_id=$2 OR lower(owner_email)=lower($3) OR EXISTS(SELECT 1 FROM discovery_users WHERE user_id=$2 AND role='admin'))`;

const fail=(status,message)=>Object.assign(Error(message),{status});
const parse=value=>typeof value==='string'?JSON.parse(value):value||{};

// With FORGET_TOMBSTONE_KEY set (a server secret, e.g. from Secret Manager),
// tombstones are HMACs: a database snapshot alone cannot test guessed emails
// or names against them. Without it they fall back to a per-user salted hash.
// Lookups check both forms, so setting the key later keeps older tombstones.
const secret=()=>process.env.FORGET_TOMBSTONE_KEY||'';
const legacyTombstone=(uid,key)=>createHash('sha256').update(`prospectpilot-forget-v1\0${uid}\0${key}`).digest('hex');
export const tombstone=(uid,key)=>secret()?createHmac('sha256',secret()).update(`prospectpilot-forget-v2\0${uid}\0${key}`).digest('hex'):legacyTombstone(uid,key);

// The subset of keys this user has deleted a person under.
export async function forgottenKeys(client,uid,keys){
  const unique=[...new Set(keys.filter(Boolean))];
  if(!uid||!unique.length)return new Set();
  const forms=unique.map(key=>[...new Set([tombstone(uid,key),legacyTombstone(uid,key)])]);
  const hit=new Set((await client.query('SELECT key_hash FROM prospect_forgotten WHERE user_id=$1 AND key_hash=ANY($2::text[])',[uid,forms.flat()])).rows.map(row=>row.key_hash));
  return new Set(unique.filter((key,i)=>forms[i].some(hash=>hit.has(hash))));
}

// Must run inside the caller's transaction (client is a checked-out connection).
// contactKeys(payload) gives the directory's identity keys for a contact.
export async function forgetPerson(client,user,{contactId='',leadId=''},{contactKeys}){
  if(!contactId&&!leadId)throw fail(422,'Choose the person to delete.');
  const contacts=new Map(),leads=new Map();
  const leadParams=[LEAD_TEAM,user.uid,user.email||''];
  // Serialize with every writer that could bring this person back mid-delete:
  // Research Lab saves hold 505006, directory imports and provider results
  // hold prospect:<uid>. The global lock comes first, so deleters never cycle.
  const lockUser=uid=>client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`prospect:${uid}`]);
  await client.query('SELECT pg_advisory_xact_lock(505006)');
  await lockUser(user.uid);
  if(contactId){
    const row=(await client.query('SELECT id,payload FROM prospect_contacts WHERE id=$1 AND user_id=$2 FOR UPDATE',[contactId,user.uid])).rows[0];
    if(!row)throw fail(404,'Contact not found.');
    contacts.set(row.id,row);
  }
  if(leadId){
    const row=(await client.query(`SELECT id,payload,owner_user_id FROM discovery_leads WHERE ${LEAD_VISIBLE_SQL} AND id=$4 FOR UPDATE`,[...leadParams,leadId])).rows[0];
    if(!row)throw fail(404,'Lead not found.');
    leads.set(row.id,row);
  }
  // The same person on the other side of the link: the lead a contact was
  // linked to (only if this user may see it), and this user's contacts
  // linked to the lead.
  for(const id of [...contacts.keys()])
    for(const row of (await client.query(`SELECT id,payload,owner_user_id FROM discovery_leads WHERE ${LEAD_VISIBLE_SQL} AND id IN (SELECT lead_id FROM advisor_contact_links WHERE contact_id=$4 AND user_id=$2)`,[...leadParams,id])).rows)
      leads.set(row.id,row);
  for(const id of [...leads.keys()])
    for(const row of (await client.query('SELECT pc.id,pc.payload FROM prospect_contacts pc JOIN advisor_contact_links acl ON acl.contact_id=pc.id AND acl.user_id=pc.user_id WHERE acl.lead_id=$1 AND pc.user_id=$2',[id,user.uid])).rows)
      contacts.set(row.id,row);

  const contactIds=[...contacts.keys()],leadIds=[...leads.keys()];
  // Both identity formats from every record: the directory checks its own
  // keys and the Research Lab checks candidate keys, and an unlinked record
  // must block the person in both.
  const keys=[...new Set([...contacts.values(),...leads.values()].flatMap(row=>{const p=parse(row.payload);return [...contactKeys(p),...candidateKeys(p)];}))];
  // Tombstoned for the person deleting and, when an admin deletes someone
  // else's lead, for that lead's owner too, so neither brings them back.
  const holders=[...new Set([user.uid,...[...leads.values()].map(row=>row.owner_user_id).filter(Boolean)])];
  for(const uid of holders.filter(uid=>uid!==user.uid).sort())await lockUser(uid);
  if(keys.length)for(const uid of holders)
    await client.query('INSERT INTO prospect_forgotten(user_id,key_hash) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',[uid,keys.map(key=>tombstone(uid,key))]);

  if(contactIds.length){
    // Queued work about them is cancelled; finished work keeps its row (the
    // charge ledger references it) but loses the person's details.
    await client.query(`UPDATE prospect_tasks SET payload='{}'::jsonb,result='{}'::jsonb,status=CASE WHEN status IN ('pending','waiting') THEN 'skipped' ELSE status END WHERE user_id=$1 AND contact_id=ANY($2::text[])`,[user.uid,contactIds]);
  }
  // Import reports list each row by name. The contact's source history says
  // which import and row it came from, which survives a later name correction
  // and cannot catch a namesake; those rows lose the name and issues.
  const provenance=new Map();
  for(const row of contacts.values())for(const event of parse(row.payload).source_history||[])
    if(event?.import_id&&Number.isSafeInteger(event.row))provenance.set(event.import_id,[...(provenance.get(event.import_id)||[]),event.row]);
  for(const [importId,rows] of provenance)
    await client.query(`UPDATE prospect_imports SET result=jsonb_set(result,'{rows}',(SELECT COALESCE(jsonb_agg(CASE WHEN (r->>'row')::int=ANY($3::int[]) THEN r-'name'-'issues' ELSE r END ORDER BY i),'[]'::jsonb) FROM jsonb_array_elements(result->'rows') WITH ORDINALITY AS t(r,i))) WHERE user_id=$1 AND id=$2 AND jsonb_typeof(result->'rows')='array'`,[user.uid,importId,rows]);
  if(leadIds.length){
    await client.query('DELETE FROM research_jobs WHERE lead_id=ANY($1::text[])',[leadIds]);
    await client.query('DELETE FROM lead_call_records WHERE lead_id=ANY($1::text[])',[leadIds]);
    await client.query("UPDATE lead_call_blocks SET lead_id='' WHERE lead_id=ANY($1::text[])",[leadIds]);
    await client.query("UPDATE discovery_audit SET detail='' WHERE record_type='lead' AND record_id=ANY($1::text[])",[leadIds]);
    for(const id of leadIds)
      await client.query("INSERT INTO discovery_audit(team,actor_user_id,actor_email,action,record_type,record_id,detail) VALUES($1,$2,$3,'forget','lead',$4,'')",[LEAD_TEAM,user.uid,user.email||'',id]);
    // Cascades: lab_run_leads, lab_observations, lab_qualification,
    // advisor_activities, advisor_rest_periods, advisor_contact_links.
    await client.query('DELETE FROM discovery_leads WHERE id=ANY($1::text[])',[leadIds]);
  }
  if(contactIds.length){
    // Cascades: prospect_list_members, advisor_contact_links; tasks keep a NULL contact.
    await client.query('DELETE FROM prospect_contacts WHERE user_id=$1 AND id=ANY($2::text[])',[user.uid,contactIds]);
  }
  // Counts only: the log says a deletion happened, never who.
  console.log(JSON.stringify({event:'person_forgotten',contacts:contactIds.length,leads:leadIds.length,keys:keys.length}));
  return {deleted:true,contacts:contactIds.length,leads:leadIds.length};
}
