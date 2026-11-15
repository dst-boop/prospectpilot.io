// ISOLATED, SERVER-ONLY READ-ONLY DRAFT. Never imported by the production app.
// No record lookup, owner proposal, claim, assignment, migration or write API.
export const LEGACY_OWNER_RECOVERY_VERSION = 'legacy-owner-recovery-count-1';
const localErrors = new WeakSet();
const fail = (status, message) => {
  const error = Object.assign(new Error(message), {status});
  localErrors.add(error);
  return error;
};
const denied = () => fail(403, 'Legacy ownership review is not authorized.');
const unavailable = () => fail(503, 'Legacy ownership review is unavailable.');
const uid = value => typeof value === 'string' && value.length <= 128 && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
const teamId = value => typeof value === 'string' && value.length <= 160 && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
// The ECMAScript trim whitespace set, passed as data rather than SQL. This only
// classifies all-whitespace legacy values; it never normalizes a nonblank UID.
const blankCharacters = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
const countSQL = `SELECT
  count(*) FILTER (WHERE owner_user_id IS NULL)::text AS null_uid,
  count(*) FILTER (WHERE owner_user_id = '')::text AS empty_uid,
  count(*) FILTER (WHERE owner_user_id <> '' AND btrim(owner_user_id,$2) = '')::text AS whitespace_uid
  FROM discovery_leads WHERE team=$1 AND (owner_user_id IS NULL OR btrim(owner_user_id,$2) = '')`;
const count = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw unavailable();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw unavailable();
  return number;
};

/**
 * Construct once per request with server-owned dependencies and configuration.
 * operatorUids is a narrow explicit allowlist, NOT a role grant: each selected
 * UID must also be an existing discovery_users administrator at both checks.
 * legacyTeam must be the trusted server-selected legacy scope, never a claimed
 * firm ID. No client roles, emails, filters, record IDs or target UIDs are used.
 * This draft requires separate production review/auditing before any activation.
 */
export function createLegacyOwnerRecoveryInspector({pool, auth, sessionCookie, operatorUids, legacyTeam} = {}) {
  if (typeof pool?.connect !== 'function' || typeof auth?.verifySessionCookie !== 'function' ||
      !teamId(legacyTeam) || !Array.isArray(operatorUids) || operatorUids.length === 0 ||
      operatorUids.length > 16 || operatorUids.some(value => !uid(value))) throw unavailable();
  const operators = new Set(operatorUids);
  let used = false;
  async function authenticate() {
    let claims;
    if (typeof sessionCookie !== 'string' || !sessionCookie || sessionCookie.length > 16384)
      throw fail(401, 'Sign in to review legacy ownership.');
    try { claims = await auth.verifySessionCookie(sessionCookie, true); }
    catch { throw fail(401, 'Sign in to review legacy ownership.'); }
    if (!uid(claims?.uid) || claims.email_verified !== true || typeof claims.email !== 'string' ||
        !claims.email.includes('@') || !['google.com', 'password'].includes(claims.firebase?.sign_in_provider))
      throw fail(401, 'Sign in to review legacy ownership.');
    if (!operators.has(claims.uid)) throw denied();
    return claims.uid;
  }
  return async function inspectLegacyOwnership(...args) {
    if (used) throw denied();
    used = true;
    if (args.length) throw fail(422, 'Legacy ownership review accepts no request filters.');
    const actorUid = await authenticate();
    let client, begun = false, broken = false;
    try {
      client = await pool.connect();
      async function begin(isolation) {
        // isolation is only supplied by the two fixed calls below.
        // BEGIN may execute before its acknowledgement is lost. Roll back and
        // evict on any rejection rather than return a possibly open transaction.
        begun = true;
        try { await client.query(`BEGIN ISOLATION LEVEL ${isolation} READ ONLY`); }
        catch { broken = true; throw unavailable(); }
        await client.query("SET LOCAL statement_timeout = '5s'");
        await client.query("SET LOCAL lock_timeout = '1s'");
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
        const rows = (await client.query(`SELECT current_setting('transaction_isolation') AS isolation,
          current_setting('transaction_read_only') AS read_only`)).rows;
        if (rows.length !== 1 || rows[0].isolation !== isolation.toLowerCase() || rows[0].read_only !== 'on')
          throw unavailable();
      }
      async function authorize() {
        const rows = (await client.query(`SELECT EXISTS(SELECT 1 FROM discovery_users
          WHERE user_id=$1 AND role='admin') AS authorized`, [actorUid])).rows;
        if (rows.length !== 1 || rows[0].authorized !== true) throw denied();
      }
      async function commit() {
        try { await client.query('COMMIT'); begun = false; }
        catch { broken = true; throw unavailable(); }
      }
      await begin('REPEATABLE READ');
      await authorize();
      const rows = (await client.query(countSQL, [legacyTeam, blankCharacters])).rows;
      if (rows.length !== 1) throw unavailable();
      const counts = {null_uid:count(rows[0].null_uid), empty_uid:count(rows[0].empty_uid), whitespace_uid:count(rows[0].whitespace_uid)};
      counts.total = counts.null_uid + counts.empty_uid + counts.whitespace_uid;
      if (!Number.isSafeInteger(counts.total)) throw unavailable();
      await commit();
      // A fresh read point refuses an administrator demoted during the count.
      // This is not atomic with Firebase and never authorizes a later mutation.
      await begin('READ COMMITTED');
      await authorize();
      if (await authenticate() !== actorUid) throw denied();
      await commit();
      return {
        version:LEGACY_OWNER_RECOVERY_VERSION,
        mode:'aggregate_count_only', scope:'server_selected_legacy_team', counts,
        read_only:true, can_execute:false, recovery_eligible:false, production_ready:false,
        coverage:{null_or_blank_uid:true, record_details:false, owner_identity:false,
          nonblank_uid_validity:false, sharing:false, related_records:false, firm_assignment:false},
        blockers:['independent_record_owner_evidence_required', 'durable_review_and_audit_required',
          'related_record_and_rights_review_required', 'production_recovery_not_implemented']
      };
    } catch (error) {
      if (client && begun) {
        try { await client.query('ROLLBACK'); }
        catch { broken = true; }
      }
      // Database/auth failures can contain row values, tokens or connection data.
      // Only errors created here may cross this boundary; do not attach causes.
      throw localErrors.has(error) ? error : unavailable();
    } finally {
      if (client) {
        try { client.release(broken ? new Error('Discard legacy review connection.') : undefined); }
        catch { throw unavailable(); }
      }
    }
  };
}
