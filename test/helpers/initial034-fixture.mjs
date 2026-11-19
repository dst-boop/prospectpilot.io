// Synthetic029 fixtures copied unchanged from full-upgrade.rehearsal.mjs.
import assert from 'node:assert/strict';
import {rollsBack} from './full-upgrade.mjs';
export const owner = {uid: 'upgrade-owner', email: 'owner@example.test'};
const other = {uid: 'upgrade-other', email: 'other@example.test'};
const csv = 'First Name,Last Name,Company,Email,Country,State\nJordan,Fixture,Original Synthetic Company,jordan@example.test,US,MA';
const aliasCSV = 'First Name,Last Name,Company,Country,State\nJordan,Fixture,Private Synthetic Company,US,MA';
const captureInput = {request_key: 'upgrade-request-0001', kind: 'warm_introduction', context: 'PRIVATE SYNTHETIC MEETING',
  note: 'PRIVATE SYNTHETIC NOTE', referrer: {name: 'PRIVATE SYNTHETIC REFERRER', context: 'Synthetic context'},
  person: {first_name: 'Jordan', last_name: 'Fixture', company: 'Private Synthetic Company', email: 'JORDAN@example.test',
    linkedin_url: 'https://www.linkedin.com/in/upgrade-private-fixture', country: 'US', state: 'MA'}};
const count = async (db, table) => (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const privatePattern = /PRIVATE SYNTHETIC|Private Synthetic Company|upgrade-private-fixture/;
const normalizedSQL = sql => sql.replaceAll('\r\n', '\n').replace(/^\uFEFF/, '');

export async function seed029(db, historical) {
  await historical.migrate(db.pool);
  assert.equal(await count(db, 'prospectpilot_migrations'), 29);
  const app = historical.createProspectWorkspace({pool: db.pool});
  const imported = await app.importCSV(owner, {csv, source: 'Synthetic legacy import'});
  assert.equal(imported.added, 1);
  const id = (await app.search(owner)).contacts[0].id;
  await app.importCSV(other, {csv});
  const otherId = (await app.search(other)).contacts[0].id;
  const list = await app.createList(owner, {name: 'Synthetic legacy list'});
  await app.membership(owner, list.id, {ids: [id]});
  await db.query("INSERT INTO prospect_list_shares(list_id,recipient_uid,recipient_email,owner_email,role) VALUES($1,$2,$3,$4,'viewer')", [list.id,other.uid,other.email,owner.email]);
  await db.query("INSERT INTO discovery_leads(id,team,owner_user_id,owner_email,payload) VALUES('legacy-lead','synthetic-team',$1,$2,$3)", [owner.uid,owner.email,JSON.stringify({first_name:'Avery',last_name:'Fixture',company:'Synthetic Company',evidence:[{source:'fixture-only',confidence:0.7}],qualification:71})]);
  for (const field of ['age','residence','retirement','contact','net_worth','movable_assets']) {
    await db.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('legacy-lead',$1,$2,$3)", [owner.uid,field,JSON.stringify({value:'synthetic evidence',source_url:'https://example.invalid/evidence',confidence:0.7})]);
  }
  await db.query("INSERT INTO lab_qualification(lead_id,user_id,status,score,identity_signature,rule_version) VALUES('legacy-lead',$1,'qualified',71,'synthetic-signature','synthetic-rule')", [owner.uid]);
  await db.query("INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status) VALUES('legacy-run',$1,$2,'discovery','legacy-run-key','completed')", [owner.uid,owner.email]);
  await db.query("INSERT INTO lab_run_leads(run_id,lead_id,is_new,source) VALUES('legacy-run','legacy-lead',true,'synthetic')");
  await db.query("INSERT INTO lab_costs(id,run_id,user_id,category,amount_micros,basis) VALUES('legacy-cost','legacy-run',$1,'provider',123456,'actual')", [owner.uid]);
  await db.query("INSERT INTO advisor_activities(id,lead_id,user_id,idempotency_key,outcome,note) VALUES('legacy-activity','legacy-lead',$1,'legacy-activity-key','meeting','Synthetic history')", [owner.uid]);
  await db.query("INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('legacy-job',$1,'enrich','legacy-job-key','synthetic-hash',200)", [owner.uid]);
  await db.query("INSERT INTO prospect_tasks(id,job_id,user_id,action,provider,contact_id,payload,status) VALUES('legacy-task','legacy-job',$1,'enrich','synthetic',$2,'{}','completed')", [owner.uid,id]);
  await db.query("INSERT INTO prospect_charges(task_id,user_id,provider,reserved_micros) VALUES('legacy-task',$1,'synthetic',200)", [owner.uid]);
  await db.query("INSERT INTO prospect_external_usage(user_id,provider,usage_key,units,lead_id) SELECT $1,'zoominfo','legacy-usage-key',2,id FROM lead_acquisitions WHERE contact_id=$2", [owner.uid,id]);
  await db.query("INSERT INTO prospect_forgotten(user_id,key_hash) VALUES($1,$2)", [owner.uid,'a'.repeat(64)]);
  assert.equal(await count(db, 'lead_acquisitions'), 3, 'two contacts and one research discovery');
  return {id, otherId, list};
}

async function expectSQLFailure(db, sql, values, code, constraint) {
  await rollsBack(db, () => assert.rejects(db.query(sql, values), error => {
    assert.equal(error.code, code);
    if (constraint) assert.equal(error.constraint, constraint);
    return true;
  }));
}

export async function verifyKeys(db, fixture) {
  await expectSQLFailure(db, 'INSERT INTO prospect_lists(id,user_id,name) VALUES($1,$2,$3)', ['collision',owner.uid,fixture.list.name], '23505', 'prospect_lists_user_id_name_key');
  await expectSQLFailure(db, "INSERT INTO prospect_imports(id,user_id,fingerprint,source,result) SELECT 'collision',user_id,fingerprint,source,result FROM prospect_imports WHERE user_id=$1 LIMIT 1", [owner.uid], '23505', 'prospect_imports_user_id_fingerprint_key');
  await expectSQLFailure(db, "INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status) VALUES('collision',$1,$2,'import','legacy-run-key','completed')", [owner.uid,owner.email], '23505', 'lab_runs_user_id_idempotency_key_key');
  await expectSQLFailure(db, "INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('collision',$1,'enrich','legacy-job-key','x',0)", [owner.uid], '23505', 'prospect_jobs_user_id_idempotency_key_key');
  await expectSQLFailure(db, "INSERT INTO lead_acquisitions(user_id,channel,source,contact_id) VALUES($1,'contacts','csv_import',$2)", [owner.uid,fixture.id], '23505', 'lead_acquisitions_contact');
  await expectSQLFailure(db, "INSERT INTO prospect_external_usage(user_id,provider,usage_key,units) VALUES($1,'zoominfo','legacy-usage-key',2)", [owner.uid], '23505', 'prospect_external_usage_user_id_provider_usage_key_key');
  await expectSQLFailure(db, "INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('legacy-lead',$1,'age','{}')", [owner.uid], '23505', 'lab_observations_pkey');
}


// Copy of pinned catalog queries, without a compatibility verdict or ledger spoof.
const queries={
 relations:`SELECT c.relname AS name,c.relkind AS kind,c.relpersistence AS persistence,c.relrowsecurity AS row_security,c.relforcerowsecurity AS force_row_security,c.relreplident AS replica_identity,c.reloptions AS options FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname`,
 columns:`SELECT c.relname AS relation,a.attnum AS position,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,COALESCE((SELECT bool_and(k.convalidated) FROM pg_constraint k WHERE k.conrelid=a.attrelid AND k.contype='n' AND a.attnum=ANY(k.conkey)),true) AS not_null_validated,a.attidentity AS identity,a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS default_expression,cn.nspname AS collation_schema,co.collname AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation LEFT JOIN pg_namespace cn ON cn.oid=co.collnamespace WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
 constraints:`SELECT c.relname AS relation,k.conname AS name,k.contype AS type,k.condeferrable AS deferrable,k.condeferred AS deferred,k.convalidated AS validated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND k.contype<>'n' ORDER BY c.relname,k.conname`,
 indexes:`SELECT c.relname AS relation,i.relname AS name,x.indisvalid AS valid,x.indisready AS ready,x.indisunique AS unique,x.indisprimary AS primary,x.indisexclusion AS exclusion,pg_get_indexdef(x.indexrelid) AS definition FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() ORDER BY c.relname,i.relname`,
 triggers:`SELECT c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
 internal_triggers:`SELECT c.relname AS relation,k.conname AS constraint_name,rc.relname AS referenced_relation,t.tgtype AS type,t.tgenabled AS enabled,pn.nspname AS function_schema,p.proname AS function_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace LEFT JOIN pg_constraint k ON k.oid=t.tgconstraint LEFT JOIN pg_class rc ON rc.oid=t.tgconstrrelid WHERE n.nspname=current_schema() AND t.tgisinternal ORDER BY c.relname,k.conname,rc.relname,t.tgtype,p.proname`,
 functions:`SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_function_result(p.oid) AS result,l.lanname AS language,p.prokind AS kind,p.provolatile AS volatility,p.proisstrict AS strict,p.prosecdef AS security_definer,p.proleakproof AS leakproof,p.proparallel AS parallel,p.proconfig AS settings,p.prosrc AS source,p.probin AS binary FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname=current_schema() ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`,
 policies:`SELECT tablename AS relation,policyname AS name,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=current_schema() ORDER BY tablename,policyname`,
 sequences:`SELECT c.relname AS name,format_type(s.seqtypid,NULL) AS type,s.seqstart::text AS start,s.seqincrement::text AS increment,s.seqmax::text AS maximum,s.seqmin::text AS minimum,s.seqcache::text AS cache,s.seqcycle AS cycle FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() ORDER BY c.relname`,
};

export async function initialSchemaSnapshot(db){
 const result={};for(const [key,sql] of Object.entries(queries))result[key]=(await db.query(sql)).rows;
 result.ownershipAndPrivileges=(await db.query(`
 WITH objects AS (
 SELECT 'schema' AS kind,nspname AS name,nspowner AS owner,COALESCE(nspacl,acldefault('n',nspowner)) AS acl FROM pg_namespace WHERE nspname=current_schema()
 UNION ALL SELECT 'relation',c.relname,c.relowner,COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind IN ('r','p','v','m','f','S')
 UNION ALL SELECT 'function',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',p.proowner,COALESCE(p.proacl,acldefault('f',p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema()
 ) SELECT o.kind,o.name,pg_get_userbyid(o.owner) AS owner,pg_get_userbyid(a.grantor) AS grantor,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,a.privilege_type,a.is_grantable FROM objects o LEFT JOIN LATERAL aclexplode(o.acl) a ON true ORDER BY o.kind,o.name,grantor,grantee,a.privilege_type,a.is_grantable
 `)).rows;
 result.sequenceValues={};for(const row of result.sequences){assert.match(row.name,/^[a-z_]+$/);result.sequenceValues[row.name]=(await db.query(`SELECT last_value::text,is_called FROM "${row.name}"`)).rows;}
 return result;
}
