import {createHash} from 'node:crypto';

// ISOLATED SERVER-ONLY DRAFT. No production route imports this module.
// This is an explicitly assigned firm inventory, NOT a complete UID inventory.
export const FIRM_SNAPSHOT_VERSION = 'firm-assignment-snapshot-1';
const fail = (status, message) => Object.assign(new Error(message), {status});
const denied = () => fail(403, 'Firm snapshot is not authorized.');
const incomplete = () => fail(409, 'The assigned inventory needs a scoped resource review.');
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const canonical = value => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
};
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const roots = {
  contacts: {assignment:'firm_contact_assignments', key:'contact_id', table:'prospect_contacts', owner:'user_id'},
  lists: {assignment:'firm_list_assignments', key:'list_id', table:'prospect_lists', owner:'user_id'},
  discoveryLeads: {assignment:'firm_lead_assignments', key:'lead_id', table:'discovery_leads', owner:'owner_user_id'}
};

/**
 * Construct once per HTTP request. auth is the server Firebase Admin SDK, and
 * sessionCookie must come from that request's __session cookie. firmId comes
 * from trusted server configuration or an independently validated selector.
 * No role, actor, record IDs, team, or rows are accepted from the client.
 * The returned function is single-use, including failed and concurrent calls.
 */
export function createFirmScopedSnapshotLoader({pool, firmId, auth, sessionCookie} = {}) {
  if (!pool || typeof pool.connect !== 'function' || !identifier(firmId) ||
      typeof auth?.verifySessionCookie !== 'function' || typeof auth?.getUser !== 'function')
    throw fail(503, 'Firm snapshot is not configured.');
  let used = false;
  async function authenticate() {
    let claims;
    try { claims = await auth.verifySessionCookie(sessionCookie,true); }
    catch { throw fail(401, 'Sign in to review the firm.'); }
    if (!identifier(claims?.uid) || claims.email_verified !== true ||
        typeof claims.email !== 'string' || !claims.email.includes('@') ||
        !['google.com','password'].includes(claims.firebase?.sign_in_provider))
      throw fail(401, 'Sign in to review the firm.');
    return claims.uid;
  }
  return async function loadFirmSnapshot({sourceUid, targetUid} = {}) {
    if (used) throw denied();
    used = true;
    if (!identifier(sourceUid) || !identifier(targetUid) || sourceUid === targetUid)
      throw fail(422, 'Choose two different advisor account IDs.');
    const actorUid = await authenticate();
    let client, begun = false, broken;
    try {
      client = await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      begun = true;
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      // Defensive: an incompatible pool/adapter must not silently downgrade us.
      const transaction = (await client.query(`SELECT current_setting('transaction_isolation') AS isolation,
        current_setting('transaction_read_only') AS read_only`)).rows[0];
      if (transaction?.isolation !== 'repeatable read' || transaction?.read_only !== 'on')
        throw fail(503, 'A read-only consistent snapshot is required.');
      async function authorize() {
        const rows = (await client.query(`SELECT m.user_id,m.role,m.status,m.updated_at FROM firm_members m
          JOIN firm_workspaces f ON f.id=m.firm_id WHERE m.firm_id=$1 AND f.status='active'
          AND m.user_id=ANY($2::text[]) ORDER BY m.user_id`, [firmId,[...new Set([actorUid,sourceUid,targetUid])]])).rows;
        const actor = rows.find(row => row.user_id === actorUid);
        const source = rows.find(row => row.user_id === sourceUid);
        const target = rows.find(row => row.user_id === targetUid);
        if (actor?.status !== 'active' || !['owner','supervisor'].includes(actor.role) ||
            !['active','departed'].includes(source?.status) || target?.status !== 'active') throw denied();
        return rows;
      }
      const membership = await authorize();
      const accounts = Object.create(null);
      for (const uid of [sourceUid,targetUid]) {
        let row;
        try { row = await auth.getUser(uid); } catch { throw fail(503,'An advisor account could not be verified.'); }
        if (row?.uid !== uid || typeof row.disabled !== 'boolean' || typeof row.emailVerified !== 'boolean')
          throw fail(503,'An advisor account could not be verified.');
        accounts[uid] = {uid,disabled:row.disabled,emailVerified:row.emailVerified};
      }
      if (accounts[targetUid].disabled || !accounts[targetUid].emailVerified)
        throw fail(422,'The receiving advisor needs an active, verified account.');
      let count = 0;
      async function rows(sql, values) {
        // Every collection is bounded in SQL, never silently truncated.
        const found = (await client.query(sql+' LIMIT 1001',values)).rows;
        count += found.length;
        if (found.length > 1000 || count > 5000) throw fail(413,'The assigned inventory needs a bounded review.');
        return found;
      }
      async function refuseIf(sql, values) {
        if ((await client.query('SELECT EXISTS('+sql+') AS blocked',values)).rows[0]?.blocked !== false) throw incomplete();
      }
      async function root(name, uid) {
        const spec = roots[name];
        const found = await rows(`SELECT r.id,r.${spec.owner},${name === 'contacts' ? 'r.identity_keys,' : ''}
          ${name === 'discoveryLeads' ? 'r.team AS legacy_team,' : ''}
          a.rights_basis,a.reviewed_at,md5(a.rights_reference) AS rights_reference_digest,
          md5(a.reviewed_by) AS reviewer_digest
          FROM ${spec.assignment} a LEFT JOIN ${spec.table} r ON r.id=a.${spec.key}
          WHERE a.firm_id=$1 AND a.advisor_uid=$2 ORDER BY a.${spec.key}`, [firmId,uid]);
        if (found.some(row => !identifier(row.id) || row[spec.owner] !== uid)) throw incomplete();
        return found;
      }
      const contacts = await root('contacts',sourceUid);
      const targetContacts = await root('contacts',targetUid);
      const lists = await root('lists',sourceUid);
      const discoveryLeads = await root('discoveryLeads',sourceUid);
      let keyCount = 0;
      for (const row of [...contacts,...targetContacts]) {
        if (!Array.isArray(row.identity_keys) || row.identity_keys.some(key => typeof key !== 'string' || !key)) throw incomplete();
        keyCount += row.identity_keys.length;
        if (row.identity_keys.length > 32 || keyCount > 100000 || row.identity_keys.some(key => key.length > 2048))
          throw fail(413,'The assigned identity inventory needs a bounded review.');
      }
      const contactIds = contacts.map(row=>row.id), listIds = lists.map(row=>row.id), leadIds = discoveryLeads.map(row=>row.id);
      // Later merges append provenance without updating the acquisition ledger.
      // Refuse embedded run/import/job references too, without reading payloads.
      for (const [table,ids,payload] of [['prospect_contacts',contactIds,'payload'],['discovery_leads',leadIds,'payload::jsonb']])
        await refuseIf(`SELECT 1 FROM ${table} WHERE id=ANY($1::text[]) AND
          (jsonb_path_exists(${payload}, '$.**.import_id') OR jsonb_path_exists(${payload}, '$.**.job_id') OR
           jsonb_path_exists(${payload}, '$.**.run_id'))`,[ids]);
      // Check cross-boundary edges using only existence, never retrieve the
      // private endpoint, even if it belongs to the same Firebase UID.
      await refuseIf(`SELECT 1 FROM prospect_list_members WHERE
        (list_id=ANY($1::text[]) AND NOT(contact_id=ANY($2::text[]))) OR
        (contact_id=ANY($2::text[]) AND NOT(list_id=ANY($1::text[])))`,[listIds,contactIds]);
      await refuseIf(`SELECT 1 FROM advisor_contact_links WHERE
        (contact_id=ANY($1::text[]) OR lead_id=ANY($2::text[])) AND
        (user_id<>$3 OR NOT(contact_id=ANY($1::text[])) OR NOT(lead_id=ANY($2::text[])))`,[contactIds,leadIds,sourceUid]);
      for (const table of ['lab_observations','lab_qualification','advisor_activities','advisor_rest_periods','lead_call_records','lead_call_blocks'])
        await refuseIf(`SELECT 1 FROM ${table} WHERE lead_id=ANY($1::text[]) AND user_id<>$2`,[leadIds,sourceUid]);
      // These parents/queues lack explicit firm assignment. A linked child is
      // not authority to read a whole job, import, run, review, or budget.
      for (const [sql,values] of [
        ['SELECT 1 FROM prospect_tasks WHERE contact_id=ANY($1::text[])',[contactIds]],
        ['SELECT 1 FROM research_jobs WHERE lead_id=ANY($1::text[])',[leadIds]],
        ['SELECT 1 FROM lab_run_leads WHERE lead_id=ANY($1::text[])',[leadIds]],
        ['SELECT 1 FROM prospect_autopilot_runs WHERE list_id=ANY($1::text[])',[listIds]],
        ['SELECT 1 FROM lab_identity_reviews WHERE lead_id=ANY($1::text[]) OR match_ids && $1::text[]',[leadIds]],
        [`SELECT 1 FROM lead_acquisitions WHERE (contact_id=ANY($1::text[]) OR lab_lead_id=ANY($2::text[]))
          AND (import_id IS NOT NULL OR job_id IS NOT NULL OR run_id IS NOT NULL)`,[contactIds,leadIds]]
      ]) await refuseIf(sql,values);
      await refuseIf(`SELECT 1 FROM lead_acquisitions WHERE (contact_id=ANY($1::text[]) OR lab_lead_id=ANY($2::text[]))
        AND ((contact_id IS NOT NULL AND NOT(contact_id=ANY($1::text[]))) OR
             (lab_lead_id IS NOT NULL AND NOT(lab_lead_id=ANY($2::text[]))))`,[contactIds,leadIds]);
      const children = {};
      children.listMembers = await rows('SELECT list_id,contact_id,added_at FROM prospect_list_members WHERE list_id=ANY($1::text[]) ORDER BY list_id,contact_id',[listIds]);
      children.shares = await rows('SELECT list_id,recipient_uid,role,created_at FROM prospect_list_shares WHERE list_id=ANY($1::text[]) ORDER BY list_id,recipient_uid',[listIds]);
      children.contactLinks = await rows('SELECT contact_id,lead_id,user_id FROM advisor_contact_links WHERE contact_id=ANY($1::text[]) ORDER BY contact_id,user_id',[contactIds]);
      const leaf = {
        observations:['lab_observations','lead_id,user_id,field,updated_at','lead_id,user_id,field'],
        qualifications:['lab_qualification','lead_id,user_id,status,score,rule_version,evaluated_at','lead_id,user_id'],
        activities:['advisor_activities','id,lead_id,user_id,outcome,next_at,created_at,channel,step,direction','id'],
        restPeriods:['advisor_rest_periods','lead_id,user_id,reason,started_at,resume_at','lead_id,user_id'],
        callRecords:['lead_call_records','id,lead_id,user_id,week_start,outcome,created_at','id'],
        callBlocks:['lead_call_blocks','lead_id,user_id,reason,created_at','lead_id,user_id,created_at']
      };
      for (const [name,[table,columns,order]] of Object.entries(leaf))
        children[name] = await rows(`SELECT ${columns} FROM ${table} WHERE lead_id=ANY($1::text[]) AND user_id=$2 ORDER BY ${order}`,[leadIds,sourceUid]);
      children.acquisitions = await rows(`SELECT id,user_id,actor_user_id,channel,source,contact_id,lab_lead_id,acquired_at
        FROM lead_acquisitions WHERE contact_id=ANY($1::text[]) OR lab_lead_id=ANY($2::text[]) ORDER BY id`,[contactIds,leadIds]);
      if (children.acquisitions.some(row =>
        (row.contact_id !== null && !contactIds.includes(row.contact_id)) ||
        (row.lab_lead_id !== null && !leadIds.includes(row.lab_lead_id)))) throw incomplete();
      const acquisitionIds = children.acquisitions.map(row=>row.id);
      // No task/credit metadata is returned without an authoritative job scope.
      await refuseIf('SELECT 1 FROM prospect_charges WHERE lead_id=ANY($1::text[])',[acquisitionIds]);
      await refuseIf('SELECT 1 FROM prospect_external_usage WHERE lead_id=ANY($1::text[])',[acquisitionIds]);
      // Verify session revocation again before releasing any inventory. This is
      // not a distributed transaction with Firebase and never permits mutation.
      if (await authenticate() !== actorUid) throw denied();
      const snapshot = {
        version:FIRM_SNAPSHOT_VERSION, complete:false, inventory_complete:true,
        scope:{kind:'explicit_firm_assignments',firm_id:firmId,actor_uid:actorUid,source_uid:sourceUid,target_uid:targetUid},
        isolation:'repeatable read', read_only:true, can_execute:false,
        coverage:{account_wide:false,private_contacts:false,other_firms:false,identity_collisions:'assigned_target_contacts_only',payloads:false},
        accounts, membership, contacts,targetContacts,lists,discoveryLeads,...children,
        blockers:[
          {code:'account_offboarding_incomplete',message:'Account-wide schedules, detached work, tombstones and global suppression are not firm-scoped; no full offboarding claim is possible.'},
          {code:'private_collision_coverage_unavailable',message:'Private and other-firm contacts were not queried; duplicates outside the assigned receiving inventory remain unknown.'},
          {code:'service_continuity_unverified',message:'Existing serviced accounts, service ownership and continuity have not been verified; do not treat this inventory as available prospects.'},
          {code:'rights_review_required',message:'Explicit assignment is not proof of consent or provider redistribution rights.'},
          {code:'apply_not_implemented',message:'This inventory is read-only and cannot authorize transfer, account revocation or outreach.'}
        ]
      };
      if (Buffer.byteLength(JSON.stringify(snapshot)) > 2_000_000) throw fail(413,'The assigned inventory needs a bounded review.');
      snapshot.fingerprint = hash(snapshot);
      await client.query('COMMIT');
      begun = false;
      // Fresh authorization after the consistent read detects membership changes
      // committed while the snapshot was built. Inventory remains the earlier
      // read point; this check is not a claim of atomic cross-service revocation.
      await client.query('BEGIN READ ONLY');
      begun = true;
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      if (hash(await authorize()) !== hash(membership)) throw denied();
      await client.query('COMMIT');
      begun = false;
      return snapshot;
    } catch (error) {
      if (client && begun) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { broken = rollbackError; }
      }
      if (error?.status) throw error;
      throw fail(503,'The firm snapshot could not be verified.');
    } finally { client?.release(broken); }
  };
}
