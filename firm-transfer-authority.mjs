// ISOLATED DRAFT. Never imported by a live route. This provides relational
// authorization/rights/audit ports, NOT a complete legacy ownership adapter.
// No loader/CAS is exported: a complete locked manifest and legacy writer fence
// must be independently implemented before composing the execution service.
const fail=(status,code)=>Object.assign(new Error(status===403?'Firm transfer is not authorized.':'Firm transfer requires a new authoritative review.'),{status,code});
const deny=()=>fail(403,'reassignment_denied');
const conflict=()=>fail(409,'reassignment_conflict');
const id=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const kinds={contact:{assignment:'firm_contact_assignments',key:'contact_id',table:'prospect_contacts',owner:'user_id'},list:{assignment:'firm_list_assignments',key:'list_id',table:'prospect_lists',owner:'user_id'},lead:{assignment:'firm_lead_assignments',key:'lead_id',table:'discovery_leads',owner:'owner_user_id'}};
export function createFirmTransferAuthority({firmId}={}) {
 if(!id(firmId))throw fail(503,'reassignment_unconfigured');
 const authorized=new WeakMap();
 const same=(a,b)=>['firmId','actorUid','sourceUid','targetUid'].every(k=>a[k]===b[k]);
 async function authorizeAndLock(client,request) {
  authorized.delete(client);
  if(!request||request.firmId!==firmId||['actorUid','sourceUid','targetUid'].some(k=>!id(request[k]))||request.sourceUid===request.targetUid)throw deny();
  const settings=(await client.query("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only,txid_current()::text AS transaction_id")).rows[0];
  if(settings?.isolation!=='serializable'||settings?.read_only!=='off')throw conflict();
  const firm=(await client.query("SELECT id,status,incarnation||':'||version::text AS version FROM firm_workspaces WHERE id=$1 FOR UPDATE",[firmId])).rows[0];
  if(firm?.status!=='active')throw deny();
  const uids=[...new Set([request.actorUid,request.sourceUid,request.targetUid])].sort();
  const members=(await client.query("SELECT user_id,role,status,incarnation||':'||version::text AS version FROM firm_members WHERE firm_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE",[firmId,uids])).rows;
  const member=uid=>members.find(r=>r.user_id===uid),actor=member(request.actorUid);
  if(actor?.status!=='active'||!['owner','supervisor'].includes(actor.role)||member(request.sourceUid)?.status!=='departed'||member(request.targetUid)?.status!=='active')throw deny();
  const fence=(await client.query(`SELECT f.*,f.expires_at>clock_timestamp() AS fresh,m.status AS reviewer_status,m.role AS reviewer_role
    FROM firm_transfer_fences f JOIN firm_members m ON m.firm_id=f.firm_id AND m.user_id=f.reviewed_by
    WHERE f.firm_id=$1 AND f.source_uid=$2 AND f.target_uid=$3 FOR UPDATE OF f,m`,[firmId,request.sourceUid,request.targetUid])).rows[0];
  if(!fence||!fence.fresh||!fence.source_fenced||!fence.sessions_revoked||!fence.workers_fenced||!fence.target_active||!fence.target_email_verified||fence.reviewer_status!=='active'||!['owner','supervisor'].includes(fence.reviewer_role))throw conflict();
  authorized.set(client,{...request,transactionId:settings.transaction_id});
  return {approved:true,scope:'advisor-reassignment-execute',firmId,actorUid:request.actorUid,sourceUid:request.sourceUid,targetUid:request.targetUid};
 }
 const requireGrant=async(client,request)=>{
  const grant=authorized.get(client);if(!grant||!same(grant,request))throw deny();
  const row=(await client.query("SELECT txid_current()::text AS transaction_id,current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only")).rows[0];
  if(row?.transaction_id!==grant.transactionId||row.isolation!=='serializable'||row.read_only!=='off'){authorized.delete(client);throw deny();}
  // ROLLBACK TO SAVEPOINT can release locks without changing txid. Reacquire
  // authority on every port; a cached transaction ID alone is not a grant.
  await authorizeAndLock(client,request);
 };
 async function loadAndLockRights(client,request,records) {
  await requireGrant(client,request);
  if(!Array.isArray(records)||!records.length||records.length>1000||records.some(r=>!r||!Object.hasOwn(kinds,r.kind)||!id(r.id))||new Set(records.map(r=>r.kind+':'+r.id)).size!==records.length)throw conflict();
  const out=[];
  for(const record of [...records].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id))) {
   const spec=kinds[record.kind];
   const assignment=(await client.query(`SELECT a.incarnation||':'||a.version::text AS version FROM ${spec.assignment} a JOIN ${spec.table} r ON r.id=a.${spec.key} AND r.${spec.owner}=a.advisor_uid
     WHERE a.firm_id=$1 AND a.${spec.key}=$2 AND a.advisor_uid=$3 FOR UPDATE OF a,r`,[firmId,record.id,request.sourceUid])).rows;
   if(assignment.length!==1)throw conflict();
   const rights=(await client.query(`SELECT x.decision,x.incarnation||':'||x.version::text AS version,x.reference_digest,x.expires_at>clock_timestamp() AS fresh,m.role,m.status
     FROM firm_transfer_rights x JOIN firm_members m ON m.firm_id=x.firm_id AND m.user_id=x.reviewed_by
     WHERE x.firm_id=$1 AND x.record_kind=$2 AND x.record_id=$3 AND x.source_uid=$4 AND x.target_uid=$5 FOR UPDATE OF x,m`,[firmId,record.kind,record.id,request.sourceUid,request.targetUid])).rows;
   const r=rights[0];if(rights.length!==1||r.decision!=='allowed'||!r.fresh||r.status!=='active'||!['owner','supervisor'].includes(r.role))throw conflict();
   out.push({kind:record.kind,id:record.id,assignmentVersion:String(assignment[0].version),rights:{decision:'allowed',firmId,sourceUid:request.sourceUid,targetUid:request.targetUid,version:String(r.version),referenceDigest:r.reference_digest}});
  }
  return out;
 }
 async function findReceipt(client,key) {
  const grant=authorized.get(client);if(!grant||key.firmId!==firmId||key.actorUid!==grant.actorUid||!id(key.idempotencyKey))throw deny();
  await requireGrant(client,grant);
  return (await client.query('SELECT receipt FROM firm_transfer_receipts WHERE firm_id=$1 AND actor_uid=$2 AND idempotency_key=$3',[firmId,key.actorUid,key.idempotencyKey])).rows[0]?.receipt??null;
 }
 async function insertReceipt(client,receipt) {
  await requireGrant(client,receipt);
  if(!id(receipt.idempotencyKey)||receipt.version!=='advisor-reassignment-execution-1'||receipt.status!=='applied')throw conflict();
  const fields=['version','status','firmId','actorUid','idempotencyKey','sourceUid','targetUid','transferId','requestHash','beforeFingerprint','afterFingerprint','preservedFingerprint','recordCount','changes','recordedAt'];
  const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(Object.keys(receipt).length!==fields.length||Object.keys(receipt).some(k=>!fields.includes(k))||!id(receipt.transferId)||
    ['requestHash','beforeFingerprint','afterFingerprint','preservedFingerprint'].some(k=>!digest(receipt[k]))||
    !Number.isSafeInteger(receipt.recordCount)||receipt.recordCount<1||receipt.recordCount>1000||
    !Array.isArray(receipt.changes)||receipt.changes.length!==receipt.recordCount||receipt.changes.some(r=>!r||Object.keys(r).length!==4||
      Object.keys(r).some(k=>!['kind','id','beforeVersion','afterVersion'].includes(k))||!Object.hasOwn(kinds,r.kind)||!id(r.id)||!id(r.beforeVersion)||!id(r.afterVersion)||r.beforeVersion===r.afterVersion)||
    new Set(receipt.changes.map(r=>r.kind+':'+r.id)).size!==receipt.recordCount||
    typeof receipt.recordedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt.recordedAt)||!Number.isFinite(Date.parse(receipt.recordedAt))||new Date(receipt.recordedAt).toISOString()!==receipt.recordedAt)throw conflict();
  const result=await client.query('INSERT INTO firm_transfer_receipts(firm_id,actor_uid,idempotency_key,receipt) VALUES($1,$2,$3,$4)',[firmId,receipt.actorUid,receipt.idempotencyKey,receipt]);
  return result.rowCount??result.affectedRows;
 }
 return Object.freeze({authorizeAndLock,loadAndLockRights,findReceipt,insertReceipt});
}
