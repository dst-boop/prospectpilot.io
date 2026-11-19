import {createHash,createHmac,randomUUID} from 'node:crypto';
import {identitySecret,identitySecrets,identityKeyVersion} from './identity-keyring.mjs';
import {sharedMailbox} from './prospect-data-quality.mjs';
import {candidateKeys,hash,nameKey} from './lead-quality.mjs';

// Separate domain from definitive current-identity tombstones: these tokens
// warrant owner review, never proof that an arrival is the deleted person.
const token=(uid,key,secret='')=>(secret?createHmac('sha256',secret):createHash('sha256'))
 .update(`prospectpilot-historical-v1\0${uid}\0${key}`).digest('hex');
const secret=identitySecret;
const strongKeys=p=>[...new Set([...candidateKeys(p).filter(k=>(k.startsWith('email:')&&!sharedMailbox(k.slice(6)))||k.startsWith('linkedin:')),
 ...(p.zoominfo?.contact_id?[`zoominfo:${p.zoominfo.contact_id}`]:[])])];
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const historicalCandidateHash=candidate=>hash(JSON.stringify(canonical(candidate)));
export const historicalIdentitySignature=p=>hash(JSON.stringify([strongKeys(p).sort(),...['first_name','last_name','company','country','state','city'].map(k=>nameKey(p[k]||''))]));
export const historicalTokens=(uid,p)=>strongKeys(p).map(k=>token(uid,k,secret()));
const lookupTokens=(uid,p)=>[...new Set(strongKeys(p).flatMap(k=>[...identitySecrets().map(s=>token(uid,k,s)),token(uid,k)]))];

// Call in the same transaction/owner lock as the successful original write or
// correction. The association is server generated, never supplied by clients.
export async function captureIdentityEvidence(c,uid,kind,id,...snapshots){
 const tokens=[...new Set(snapshots.flatMap(p=>historicalTokens(uid,p)))];
 if(tokens.length)await c.query(`INSERT INTO prospect_identity_evidence(user_id,token_owner_id,record_kind,record_id,key_hash,key_version)
  SELECT $1,$1,$2,$3,unnest($4::text[]),$5 ON CONFLICT DO NOTHING`,[uid,kind,id,tokens,identityKeyVersion(secret())]);
}
const arrivalKey=p=>JSON.stringify(strongKeys(p).sort());
export async function historicalMatchesMany(c,uid,people){
 const available=new Set(['legacy',...identitySecrets().map(identityKeyVersion)]);
 // token_owner_id is an explicit grant made ONLY when the authenticated owner
 // or verified admin deletes that exact record. Never scan arbitrary owners.
 const profiles=(await c.query('SELECT DISTINCT token_owner_id,key_version FROM prospect_historical_identifiers WHERE user_id=$1',[uid])).rows;
 if(profiles.some(r=>!available.has(r.key_version)))throw Object.assign(Error('Historical identity checks need operator review after a key change. No arrival was saved.'),{status:503});
 const namespaces=[...new Set(profiles.map(r=>r.token_owner_id))];
 if(namespaces.length>1000||namespaces.length*people.length>50000)throw Object.assign(Error('Historical identity checks require a smaller import batch or operator review. No arrival was saved.'),{status:503});
 const hits=new Set();
 for(const namespace of namespaces){
  const tokens=[...new Set(people.flatMap(p=>lookupTokens(namespace,p)))];if(!tokens.length)continue;
  for(const r of (await c.query('SELECT key_hash FROM prospect_historical_identifiers WHERE user_id=$1 AND token_owner_id=$2 AND key_hash=ANY($3::text[])',[uid,namespace,tokens])).rows)hits.add(r.key_hash);
 }
 return new Map(people.map(p=>[arrivalKey(p),[...new Set(namespaces.flatMap(namespace=>lookupTokens(namespace,p)).filter(k=>hits.has(k)))]]));
}
export async function historicalMatches(c,uid,p){return (await historicalMatchesMany(c,uid,[p])).get(arrivalKey(p))||[];}
export async function captureIdentityBatch(c,uid,kind,rows){
 const version=identityKeyVersion(secret());
 const evidence=rows.flatMap(r=>historicalTokens(uid,r.payload).map(key_hash=>({record_id:r.id,key_hash,key_version:version})));
 for(let start=0;start<evidence.length;start+=1000)await c.query("INSERT INTO prospect_identity_evidence(user_id,token_owner_id,record_kind,record_id,key_hash,key_version) SELECT $1,$1,$2,v->>'record_id',v->>'key_hash',v->>'key_version' FROM jsonb_array_elements($3::jsonb) v ON CONFLICT DO NOTHING",[uid,kind,JSON.stringify(evidence.slice(start,start+1000))]);
}
export async function holdHistoricalArrival(c,uid,destination,candidate,payload,{preview=false,approvedCandidateHash=null,knownMatches=null}={}){
 const matches=knownMatches?(knownMatches.get(arrivalKey(candidate))||[]):await historicalMatches(c,uid,candidate);if(!matches.length)return null;
 if(approvedCandidateHash===historicalCandidateHash(candidate))return null;
 // An earlier explicit decision only covers that still-live, unchanged person,
 // not the identifier globally and not a deleted/corrected replacement.
 const approvals=(await c.query("SELECT resolution FROM prospect_historical_reviews WHERE user_id=$1 AND destination=$2 AND status='resolved' AND key_hashes && $3::text[]",[uid,destination,lookupTokens(uid,candidate)])).rows;
 for(const {resolution} of approvals){
  if(resolution.identity_signature!==historicalIdentitySignature(candidate))continue;
  const sql=destination==='contact'?'SELECT payload FROM prospect_contacts WHERE id=$1 AND user_id=$2':'SELECT payload FROM discovery_leads WHERE id=$1 AND owner_user_id=$2';
  const live=(await c.query(sql,[resolution.result_id,uid])).rows[0];
  if(live&&historicalIdentitySignature(live.payload)===resolution.identity_signature)return null;
 }
 if(preview)return {id:null,preview:true};
 const fingerprint=hash(JSON.stringify([destination,canonical(candidate),canonical(payload)]));
 const id=randomUUID(),tokens=historicalTokens(uid,candidate);
 const row=(await c.query(`INSERT INTO prospect_historical_reviews(id,user_id,destination,fingerprint,candidate,payload,key_hashes,matched_key_hashes)
  VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::text[],$8::text[])
  ON CONFLICT(user_id,fingerprint) WHERE status='open' DO UPDATE SET matched_key_hashes=ARRAY(SELECT DISTINCT h FROM unnest(prospect_historical_reviews.matched_key_hashes||EXCLUDED.matched_key_hashes) h)
  RETURNING id`,[id,uid,destination,fingerprint,JSON.stringify(candidate),JSON.stringify(payload),tokens,matches])).rows[0];
 return {id:row.id};
}
export async function retireIdentityEvidence(c,uid,kind,id,payload,{additionalHolders=[]}={}){
 // Legacy rows have no durable coverage before adoption. Recover only exact
 // recorded pre-correction identifiers, never guessed names or associations.
 const prior=[];
 for(const e of payload.source_history||[])if(e?.kind==='manual_review'&&e.changes){
  const p={};for(const key of ['email','linkedin_url'])if(typeof e.changes[key]?.before==='string')p[key]=e.changes[key].before;
  prior.push(p);
 }
 await captureIdentityEvidence(c,uid,kind,id,payload,...prior);
 const tokens=(await c.query('SELECT token_owner_id,key_hash,key_version FROM prospect_identity_evidence WHERE user_id=$1 AND record_kind=$2 AND record_id=$3',[uid,kind,id])).rows;
 const evidence=tokens;
 const hashes=evidence.map(r=>r.key_hash);
 for(const holder of [...new Set([uid,...additionalHolders])]){
  if(hashes.length)await c.query("INSERT INTO prospect_historical_identifiers(user_id,token_owner_id,key_hash,key_version) SELECT $1,v->>'token_owner_id',v->>'key_hash',v->>'key_version' FROM jsonb_array_elements($2::jsonb) v ON CONFLICT DO NOTHING",[holder,JSON.stringify(evidence)]);
  const cleared=(await c.query(`UPDATE prospect_historical_reviews SET candidate='{}',payload='{}',status='discarded',resolution='{"reason":"associated_record_deleted"}',resolved_at=now()
   WHERE user_id=$1 AND (key_hashes && $2::text[] OR matched_key_hashes && $2::text[] OR ($1=$5 AND destination=$3 AND (payload->>'existing_contact_id'=$4 OR payload->>'existing_lead_id'=$4 OR resolution->>'result_id'=$4))) AND status IN ('open','resolved') RETURNING id`,[holder,hashes,kind,id,uid])).rows.map(r=>r.id);
  if(cleared.length)await scrubHistoricalReports(c,holder,cleared);
 }
 await c.query('DELETE FROM prospect_identity_evidence WHERE user_id=$1 AND record_kind=$2 AND record_id=$3',[uid,kind,id]);
}
export async function scrubHistoricalReports(c,uid,reviewIds,contactId=null){
 const touched=(await c.query(`UPDATE prospect_imports SET result=jsonb_set(result,'{rows}',
  (SELECT jsonb_agg(CASE WHEN r->>'historical_review_id'=ANY($2::text[]) THEN
   CASE WHEN $3::text IS NULL THEN (r-'name'-'issues'-'historical_review_id') || '{"status":"discarded","message":"Identity review discarded."}'::jsonb
   ELSE (r-'historical_review_id') || jsonb_build_object('contact_id',$3::text,'status','reviewed','message','Saved after owner identity review.') END ELSE r END ORDER BY i)
   FROM jsonb_array_elements(result->'rows') WITH ORDINALITY t(r,i)))
  WHERE user_id=$1 AND jsonb_typeof(result->'rows')='array'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r->>'historical_review_id'=ANY($2::text[])) RETURNING id,result`,[uid,reviewIds,contactId])).rows;
 for(const {id,result} of touched){
  const rows=result.rows;
  const updated={...result,added:rows.filter(r=>['added','reviewed'].includes(r.status)).length,duplicates:rows.filter(r=>r.status==='duplicate').length,conflicts:rows.filter(r=>['conflict','identity_review'].includes(r.status)).length,rejected:rows.filter(r=>['rejected','discarded'].includes(r.status)).length,errors:rows.filter(r=>['conflict','rejected'].includes(r.status)).slice(0,50).map(r=>({row:r.row,message:r.message}))};
  await c.query('UPDATE prospect_imports SET result=$1::jsonb WHERE id=$2 AND user_id=$3',[JSON.stringify(updated),id,uid]);
 }
}

// Only call after the existing merge authorization and row locks succeed.
// Preserve the ORIGINAL cryptographic namespace through an authorized merge;
// do not invent/rekey old identifiers or grant access to unrelated records.
export async function transferIdentityEvidence(c,uid,kind,fromId,toId,toUid=uid){
 if(uid===toUid&&fromId===toId)return;
 await c.query(`INSERT INTO prospect_identity_evidence(user_id,token_owner_id,record_kind,record_id,key_hash,key_version)
  SELECT $5,token_owner_id,record_kind,$4,key_hash,key_version FROM prospect_identity_evidence
  WHERE user_id=$1 AND record_kind=$2 AND record_id=$3 ON CONFLICT DO NOTHING`,[uid,kind,fromId,toId,toUid]);
 await c.query('DELETE FROM prospect_identity_evidence WHERE user_id=$1 AND record_kind=$2 AND record_id=$3',[uid,kind,fromId]);
}
