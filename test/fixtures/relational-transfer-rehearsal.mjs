// TEST ONLY: a bounded synthetic universe, not a complete legacy snapshot loader.
// No production module may import this file. All protected manifests below are
// synthetic rows; they do not assert completeness of real legacy relationships.
import {createHash} from 'node:crypto';
import {createFirmTransferAuthority} from '../../firm-transfer-authority.mjs';
import {REASSIGNMENT_EXECUTION_VERSION as contract,REASSIGNMENT_PRESERVED_COLLECTIONS as collections,fingerprintReassignmentSnapshot} from '../../advisor-reassignment-execution.mjs';
import {prepareAuthorityFixture,scope,records} from './firm-transfer-authority-fixture.mjs';
export {scope};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const conflict=()=>Object.assign(new Error('Synthetic rehearsal requires a new review'),{status:409,code:'reassignment_conflict'});
const specs={contact:['firm_contact_assignments','contact_id','prospect_contacts','user_id'],list:['firm_list_assignments','list_id','prospect_lists','user_id'],lead:['firm_lead_assignments','lead_id','discovery_leads','owner_user_id']};
export async function prepareRelationalRehearsal(db){
 await prepareAuthorityFixture(db);
 await db.exec(`CREATE TABLE synthetic_transfer_scope(firm_id TEXT PRIMARY KEY,version BIGINT NOT NULL);
 CREATE TABLE synthetic_transfer_manifests(firm_id TEXT NOT NULL,category TEXT NOT NULL,payload JSONB NOT NULL,PRIMARY KEY(firm_id,category));
 INSERT INTO synthetic_transfer_scope VALUES('firm-a',1),('firm-b',1);`);
 for(const category of collections)await db.query('INSERT INTO synthetic_transfer_manifests VALUES($1,$2,$3)',['firm-a',category,JSON.stringify(category==='jobs'?[]:[{synthetic:true,originalAuthor:'source',category}])]);
}
export function relationalRehearsalAdapter(options={}){
 const authority=createFirmTransferAuthority({firmId:'firm-a'});
 const adapter={...authority};
 adapter.loadAndLockSnapshot=async(client,request,{phase})=>{
  await authority.authorizeAndLock(client,request);
  const version=(await client.query('SELECT version::text FROM synthetic_transfer_scope WHERE firm_id=$1 FOR UPDATE',[request.firmId])).rows[0]?.version;
  if(!version)throw conflict();
  if(phase==='before')await authority.loadAndLockRights(client,request,records);
  const firm=(await client.query("SELECT id,status,incarnation||':'||version::text AS version FROM firm_workspaces WHERE id=$1",[request.firmId])).rows[0];
  const members=(await client.query("SELECT user_id AS uid,firm_id AS \"firmId\",role,status,incarnation||':'||version::text AS version FROM firm_members WHERE firm_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id",[request.firmId,[...new Set([request.actorUid,request.sourceUid,request.targetUid])]])).rows;
  const fence=(await client.query("SELECT incarnation||':'||version::text AS version FROM firm_transfer_fences WHERE firm_id=$1 AND source_uid=$2 AND target_uid=$3",[request.firmId,request.sourceUid,request.targetUid])).rows[0];
  const manifests=(await client.query('SELECT category,payload FROM synthetic_transfer_manifests WHERE firm_id=$1 ORDER BY category FOR UPDATE',[request.firmId])).rows;
  if(manifests.length!==collections.length||manifests.some(r=>!collections.includes(r.category)||!Array.isArray(r.payload)))throw conflict();
  const result=[];
  for(const {kind,id} of records){
   const [assignment,key,table,owner]=specs[kind];
   const rows=(await client.query(`SELECT a.advisor_uid,a.incarnation||':'||a.version::text AS version,to_jsonb(r) AS content FROM ${assignment} a JOIN ${table} r ON r.id=a.${key} AND r.${owner}=a.advisor_uid WHERE a.firm_id=$1 AND a.${key}=$2 FOR UPDATE OF a,r`,[request.firmId,id])).rows;
   if(rows.length!==1)throw conflict();const row=rows[0];
   const right=(await client.query("SELECT decision,incarnation||':'||version::text AS version,reference_digest,expires_at>clock_timestamp() AS fresh FROM firm_transfer_rights WHERE firm_id=$1 AND record_kind=$2 AND record_id=$3 AND source_uid=$4 AND target_uid=$5 FOR UPDATE",[request.firmId,kind,id,request.sourceUid,request.targetUid])).rows[0];
   if(!right?.fresh||right.decision!=='allowed')throw conflict();
   delete row.content[owner];
   result.push({kind,id,firmId:request.firmId,advisorUid:row.advisor_uid,version:row.version,contentDigest:digest(row.content),rights:{decision:right.decision,firmId:request.firmId,sourceUid:request.sourceUid,targetUid:request.targetUid,version:right.version,referenceDigest:right.reference_digest}});
  }
  return {contract,complete:true,scope:{firmId:request.firmId,sourceUid:request.sourceUid,targetUid:request.targetUid,version},firm,members,
   access:{sourceUid:request.sourceUid,targetUid:request.targetUid,sourceFenced:true,sessionsRevoked:true,workersFenced:true,targetActive:true,targetEmailVerified:true,version:fence.version},
   preserved:Object.fromEntries(manifests.map(r=>[r.category,{authoritative:true,version:'synthetic-1',digest:digest(r.payload),count:r.payload.length}])),records:result,jobs:[],
   review:{identityCollisions:0,unresolvedIdentities:0,externalReferences:0,unreviewedShares:0,serviceContinuity:'approved',version:'synthetic-only-1'}};
 };
 adapter.compareAndSwap=async(client,request,expected)=>{
  if(options.beforeCas)await options.beforeCas(client);
  const before=await adapter.loadAndLockSnapshot(client,request,{phase:'before'});
  if(fingerprintReassignmentSnapshot(before,request)!==expected.beforeFingerprint)throw conflict();
  let count=0;
  for(const r of expected.records){
   const [assignment,key,table,owner]=specs[r.kind];
   const updated=await client.query(`UPDATE ${assignment} SET advisor_uid=$1 WHERE firm_id=$2 AND ${key}=$3 AND advisor_uid=$4 AND incarnation||':'||version::text=$5`,[request.targetUid,request.firmId,r.id,request.sourceUid,r.version]);
   if((updated.rowCount??updated.affectedRows)!==1)throw conflict();
   const legacy=await client.query(`UPDATE ${table} SET ${owner}=$1 WHERE id=$2 AND ${owner}=$3`,[request.targetUid,r.id,request.sourceUid]);
   if((legacy.rowCount??legacy.affectedRows)!==1)throw conflict();count++;
  }
  const changed=await client.query('UPDATE synthetic_transfer_scope SET version=version+1 WHERE firm_id=$1 AND version::text=$2',[request.firmId,expected.scopeVersion]);
  if((changed.rowCount??changed.affectedRows)!==1)throw conflict();
  if(options.afterCas)await options.afterCas(client);
  return count;
 };
 if(options.auditFailure)adapter.insertReceipt=async()=>{throw Error('synthetic audit failure');};
 return adapter;
}
