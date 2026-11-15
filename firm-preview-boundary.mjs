// Opt-in preview authorization only. Not imported by server.mjs. The caller must
// already have verified the actor's Firebase session (including revocation).
// Construct a NEW instance for each authenticated request; never cache/reuse it.
// firmId is server-selected configuration, not a role/team supplied by a client.
// No snapshot loader or ownership-changing operation is provided.
const fail = (status, message) => Object.assign(new Error(message), {status});
const denied = () => fail(403, 'Firm preview is not authorized.');
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const supervisorRoles = new Set(['owner','supervisor']);
const sourceStatuses = new Set(['active','departed']);
const catalog = Object.freeze({
  contact:{assignment:'firm_contact_assignments', key:'contact_id', table:'prospect_contacts', owner:'user_id'},
  list:{assignment:'firm_list_assignments', key:'list_id', table:'prospect_lists', owner:'user_id'},
  lead:{assignment:'firm_lead_assignments', key:'lead_id', table:'discovery_leads', owner:'owner_user_id'}
});

export function createFirmPreviewAdapters({pool, firmId, actor, resolveAccount} = {}) {
  if (!pool || typeof pool.query !== 'function' || !identifier(firmId)) throw fail(503, 'Firm preview is not configured.');
  const actorUid = actor?.uid;
  if (!identifier(actorUid)) throw fail(401, 'Sign in to review the firm.');
  let pair = null, attempted = false, invalidated = false;
  const sameActor = candidate => {
    if (candidate?.uid !== actorUid) throw denied();
  };
  async function supervisor() {
    const rows = (await pool.query(`SELECT m.role,m.status FROM firm_members m
      JOIN firm_workspaces f ON f.id=m.firm_id
      WHERE m.firm_id=$1 AND m.user_id=$2 AND f.status='active'`, [firmId,actorUid])).rows;
    if (rows.length !== 1 || rows[0].status !== 'active' || !supervisorRoles.has(rows[0].role)) throw denied();
  }
  async function eligiblePair(sourceUid, targetUid) {
    if (!identifier(sourceUid) || !identifier(targetUid) || sourceUid === targetUid) throw denied();
    await supervisor();
    const rows = (await pool.query(`SELECT user_id,status FROM firm_members
      WHERE firm_id=$1 AND user_id=ANY($2::text[])`, [firmId,[sourceUid,targetUid]])).rows;
    const source = rows.find(row => row.user_id === sourceUid), target = rows.find(row => row.user_id === targetUid);
    if (rows.length !== 2 || !sourceStatuses.has(source?.status) || target?.status !== 'active') throw denied();
  }
  async function account(uid) {
    if (typeof resolveAccount !== 'function') throw fail(503, 'The account directory is not configured.');
    const result = await resolveAccount(uid);
    if (result?.uid !== uid || typeof result.disabled !== 'boolean' || typeof result.emailVerified !== 'boolean')
      throw fail(503, 'The account directory could not be verified.');
    // Never expose email, provider identities, token metadata, claims or other
    // Firebase fields through the team directory or planner fingerprint.
    return {uid, disabled:result.disabled, emailVerified:result.emailVerified};
  }
  return {
    authorizeSupervisor:async ({actor:requestedActor}) => {
      sameActor(requestedActor); await supervisor();
      return {approved:true, scope:'team-lead-hub-preview', actorUid, team:firmId};
    },
    listAdvisors:async ({actor:requestedActor, team}) => {
      sameActor(requestedActor);
      if (team !== firmId) throw denied();
      await supervisor();
      const rows = (await pool.query(`SELECT user_id,label,status FROM firm_members WHERE firm_id=$1
        AND status IN ('active','departed') ORDER BY user_id LIMIT 201`, [firmId])).rows;
      if (rows.length > 200) throw fail(413, 'The firm directory needs a bounded review.');
      const roster = [];
      for (const row of rows) roster.push({...await account(row.user_id), label:row.label});
      // Recheck after potentially slow directory calls. This is not a cached
      // supervisor permission and does not claim to authorize a future transfer.
      await supervisor();
      const current = (await pool.query(`SELECT user_id,label,status FROM firm_members WHERE firm_id=$1
        AND status IN ('active','departed') ORDER BY user_id LIMIT 201`, [firmId])).rows;
      if (JSON.stringify(current) !== JSON.stringify(rows)) throw fail(409, 'The firm directory changed. Refresh and retry.');
      return roster;
    },
    plannerAdapters:{
      authorize:async ({actor:requestedActor, sourceUid, targetUid}) => {
        // One instance is one request/pair; a failed or repeated authorization
        // cannot leave an earlier pair usable by a different request.
        if (attempted) { invalidated = true; pair = null; throw denied(); }
        attempted = true;
        sameActor(requestedActor);
        await eligiblePair(sourceUid,targetUid);
        if (invalidated) throw denied();
        pair = Object.freeze({sourceUid,targetUid});
        return {approved:true, scope:'advisor-reassignment-preview', team:firmId, sourceUid,targetUid};
      },
      resolveAccount:async uid => {
        const selected = pair;
        if (!selected || ![selected.sourceUid,selected.targetUid].includes(uid)) throw denied();
        await eligiblePair(selected.sourceUid,selected.targetUid);
        if (pair !== selected) throw denied();
        const result = await account(uid);
        if (pair !== selected) throw denied();
        await eligiblePair(selected.sourceUid,selected.targetUid);
        if (pair !== selected) throw denied();
        return result;
      }
    },
    // A read gate for a future snapshot loader, not a complete snapshot, transfer
    // grant, proof of licensing, or permission to expose arbitrary child rows.
    assertRecordScope:async ({sourceUid,targetUid,records}) => {
      if (!Array.isArray(records) || records.length > 1000 || records.some(row => !row ||
          !Object.hasOwn(catalog,row.kind) || !identifier(row.id) ||
          ![sourceUid,targetUid].includes(row.advisorUid) || (row.advisorUid === targetUid && row.kind !== 'contact')) ||
          new Set(records.map(row => `${row.kind}:${row.id}`)).size !== records.length)
        throw fail(422, 'Provide a bounded, distinct record inventory.');
      await eligiblePair(sourceUid,targetUid);
      for (const [kind, spec] of Object.entries(catalog)) {
        const selected = records.filter(row => row.kind === kind);
        if (!selected.length) continue;
        // Identifiers come only from this module's fixed catalog. IDs and UIDs
        // are parameters. The stored legacy owner must still match the explicit
        // assignment; membership alone can never expose their private records.
        const rows = (await pool.query(`SELECT a.${spec.key} AS id,a.advisor_uid FROM ${spec.assignment} a
          JOIN ${spec.table} r ON r.id=a.${spec.key} AND r.${spec.owner}=a.advisor_uid
          WHERE a.firm_id=$1 AND a.${spec.key}=ANY($2::text[])`, [firmId,selected.map(row => row.id)])).rows;
        if (rows.length !== selected.length || selected.some(row => !rows.some(found => found.id === row.id && found.advisor_uid === row.advisorUid))) throw denied();
      }
      await eligiblePair(sourceUid,targetUid);
      return {approved:true, scope:'firm-record-preview', team:firmId, count:records.length};
    }
  };
}
