import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrate} from '../migrate.mjs';
import {createProspectWorkspace} from '../prospect-workspace.mjs';
import {createStagingDatabase, validateStagingDatabaseUrl} from './helpers/staging-database.mjs';
import {installSyntheticNetworkGuard} from './helpers/staging-network.mjs';
import {baselineCommit, targetCommit, rollbackCommit, historicalModules, assertPinnedTargetMigrations, tableSnapshot, schemaSnapshot, rollsBack} from './helpers/full-upgrade.mjs';

const owner = {uid: 'upgrade-owner', email: 'owner@example.test'};
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

async function seed029(db, historical) {
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

async function verifyKeys(db, fixture) {
  await expectSQLFailure(db, 'INSERT INTO prospect_lists(id,user_id,name) VALUES($1,$2,$3)', ['collision',owner.uid,fixture.list.name], '23505', 'prospect_lists_user_id_name_key');
  await expectSQLFailure(db, "INSERT INTO prospect_imports(id,user_id,fingerprint,source,result) SELECT 'collision',user_id,fingerprint,source,result FROM prospect_imports WHERE user_id=$1 LIMIT 1", [owner.uid], '23505', 'prospect_imports_user_id_fingerprint_key');
  await expectSQLFailure(db, "INSERT INTO lab_runs(id,user_id,user_email,kind,idempotency_key,status) VALUES('collision',$1,$2,'import','legacy-run-key','completed')", [owner.uid,owner.email], '23505', 'lab_runs_user_id_idempotency_key_key');
  await expectSQLFailure(db, "INSERT INTO prospect_jobs(id,user_id,action,idempotency_key,input_hash,max_cost_micros) VALUES('collision',$1,'enrich','legacy-job-key','x',0)", [owner.uid], '23505', 'prospect_jobs_user_id_idempotency_key_key');
  await expectSQLFailure(db, "INSERT INTO lead_acquisitions(user_id,channel,source,contact_id) VALUES($1,'contacts','csv_import',$2)", [owner.uid,fixture.id], '23505', 'lead_acquisitions_contact');
  await expectSQLFailure(db, "INSERT INTO prospect_external_usage(user_id,provider,usage_key,units) VALUES($1,'zoominfo','legacy-usage-key',2)", [owner.uid], '23505', 'prospect_external_usage_user_id_provider_usage_key_key');
  await expectSQLFailure(db, "INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('legacy-lead',$1,'age','{}')", [owner.uid], '23505', 'lab_observations_pkey');
}

for (const backend of ['pglite','postgres']) {
  const configured = Boolean(process.env.STAGING_DATABASE_URL || process.env.POSTGRES_TEST_URL);
  const skip = backend === 'postgres' && !configured && process.env.UPGRADE_REQUIRE_POSTGRES !== '1'
    ? 'Real PostgreSQL16 requires the explicit disposable loopback test database.' : false;
  test(`full upgrade ${backend}: pinned 029 -> 030–032 -> PR100 application rollback`, {skip, timeout: 180000}, async t => {
    assert.notEqual(process.env.NODE_ENV, 'production');
    const config = validateStagingDatabaseUrl(process.env);
    const network = installSyntheticNetworkGuard();
    if (config) network.allowPort(config.port);
    let db, historical, rollback;
    try {
      historical = await historicalModules(baselineCommit);
      rollback = await historicalModules(rollbackCommit);
      for (const {file,sql} of assertPinnedTargetMigrations()) {
        assert.equal(normalizedSQL(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')), normalizedSQL(sql), `Target SQL drifted: ${file}`);
      }
      db = await createStagingDatabase({backend});
      if (backend === 'postgres') assert.equal(Math.floor(Number((await db.query('SHOW server_version_num')).rows[0].server_version_num) / 10000),16);
      const fixture = await seed029(db, historical);
      const before = await tableSnapshot(db), structure = await schemaSnapshot(db);
      const assertLegacyIntact = async () => {
        const actual = await tableSnapshot(db, Object.keys(before));
        actual.prospectpilot_migrations = actual.prospectpilot_migrations.filter(row => row.id <= '029');
        assert.deepEqual(actual, before, 'Every baseline row, timestamp, evidence, key and cost must survive');
      };
      await verifyKeys(db, fixture);
      await expectSQLFailure(db, "INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('legacy-lead',$1,'personal_event','{}')", [owner.uid], '23514');
      for (const failureAt of ['030','031','032']) {
        const injected = {connect: async () => ({query: async (sql, values) => {
          const result = await db.query(sql, values);
          if (sql.startsWith('INSERT INTO prospectpilot_migrations') && values?.[0] === failureAt) await db.query('SELECT * FROM deliberately_missing_upgrade_relation');
          return result;
        },release() {}}),end: async () => {}};
        await assert.rejects(migrate(injected), /deliberately_missing_upgrade_relation/);
        await assertLegacyIntact();
        assert.deepEqual(await schemaSnapshot(db), structure, `DDL/history rollback after ${failureAt}`);
        assert.equal(await count(db,'prospectpilot_migrations'),29);
      }
      t.diagnostic('Injected failures after each of 030, 031 and 032 restore all baseline data, schema and migration history.');
      await migrate(db.pool);
      await assertLegacyIntact();
      assert.equal(await count(db,'prospectpilot_migrations'),32);
      const upgradedStructure = await schemaSnapshot(db);
      assert.deepEqual(upgradedStructure.indexes.filter(row => structure.tables.some(table => table.tablename === row.tablename)),structure.indexes);
      assert.deepEqual(upgradedStructure.constraints.filter(row => structure.tables.some(table => table.tablename === row.table_name) && row.conname !== 'lab_observations_field_check'), structure.constraints.filter(row => row.conname !== 'lab_observations_field_check'));
      await verifyKeys(db, fixture);
      const upgraded = await tableSnapshot(db);
      await migrate(db.pool);
      assert.deepEqual(await tableSnapshot(db), upgraded, 'Successful migration replay is a complete data no-op');
      assert.deepEqual(await schemaSnapshot(db), upgradedStructure);
      await expectSQLFailure(db, "INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('legacy-lead',$1,'inferred_relationship','{}')", [owner.uid], '23514');
      await db.query("INSERT INTO lab_observations(lead_id,user_id,field,payload) VALUES('legacy-lead',$1,'personal_event','{\"source\":\"synthetic\",\"reviewed\":false}')", [owner.uid]);
      await db.query("INSERT INTO prospect_autopilot_runs(id,user_id,list_id,steps,approved_micros) VALUES('new-run',$1,$2,'[]',0)", [owner.uid,fixture.list.id]);
      await expectSQLFailure(db, "INSERT INTO prospect_autopilot_runs(id,user_id,list_id,steps,approved_micros,status) VALUES('duplicate-run',$1,$2,'[]',0,'paused')", [owner.uid,fixture.list.id], '23505', 'prospect_autopilot_one_live');
      for (const [column,value] of [['cursor',-1],['approved_micros',-1],['status','unknown']]) await expectSQLFailure(db, `UPDATE prospect_autopilot_runs SET ${column}=$1 WHERE id='new-run'`, [value], '23514');
      await rollsBack(db, async () => {
        await db.query("INSERT INTO prospect_autopilot_runs(id,user_id,steps,approved_micros) VALUES('whole-workspace',$1,'[]',0)", [owner.uid]);
        await assert.rejects(db.query("INSERT INTO prospect_autopilot_runs(id,user_id,steps,approved_micros) VALUES('whole-workspace-duplicate',$1,'[]',0)", [owner.uid]), {code:'23505'});
      });
      const app = createProspectWorkspace({pool:db.pool});
      const contactBefore = (await db.query('SELECT * FROM prospect_contacts WHERE id=$1',[fixture.id])).rows;
      const captured = await app.captureNetworking(owner,captureInput);
      assert.equal(captured.capture.contact_id,fixture.id);
      assert.equal(captured.contact_unchanged,true);
      assert.deepEqual((await db.query('SELECT * FROM prospect_contacts WHERE id=$1',[fixture.id])).rows,contactBefore);
      assert.equal((await app.captureNetworking(owner,captureInput)).replayed,true);
      await assert.rejects(app.captureNetworking(owner,{...captureInput,note:'changed'}),{status:409});
      assert.equal(await count(db,'prospect_networking_captures'),1);
      assert.equal((await app.networkingHistory(other)).captures.length,0);
      assert.doesNotMatch(JSON.stringify(await app.search(owner)),privatePattern);
      assert.doesNotMatch(JSON.stringify(await app.route(new Request(`https://example.invalid/api/prospect/lists/${fixture.list.id}/contacts/${fixture.id}`),other)),privatePattern);
      await app.captureNetworking(other,captureInput);
      assert.equal(await count(db,'prospect_networking_captures'),2,'request keys are owner-scoped');
      await expectSQLFailure(db, "INSERT INTO prospect_networking_captures(id,user_id,contact_id,request_key,fingerprint,payload,result) SELECT 'duplicate',user_id,contact_id,request_key,fingerprint,payload,result FROM prospect_networking_captures WHERE user_id=$1", [owner.uid], '23505', 'prospect_networking_captures_user_id_request_key_key');
      await expectSQLFailure(db, "INSERT INTO prospect_networking_captures(id,user_id,contact_id,request_key,fingerprint,payload,result) VALUES('orphan',$1,'missing','another-request','hash','{}','{}')", [owner.uid], '23503');
      await expectSQLFailure(db, "UPDATE prospect_networking_captures SET contact_id=NULL WHERE user_id=$1", [owner.uid], '23502');
      await rollsBack(db, async () => {
        const n = await count(db,'lead_acquisitions');
        await db.query('DELETE FROM prospect_contacts WHERE id=$1',[fixture.id]);
        assert.equal(await count(db,'prospect_networking_captures'),1,'capture cascades');
        assert.equal(await count(db,'lead_acquisitions'),n,'acquisition history survives contact deletion');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM lead_acquisitions WHERE contact_id IS NULL AND channel=\'contacts\'')).rows[0].n,1);
      });
      t.diagnostic('Legacy rows/unique keys, 030 evidence check, 031 live-run constraints, 032 FK/owner keys and owner/list privacy pass.');
      const beforeRollback = await tableSnapshot(db);
      await rollback.migrate(db.pool);
      assert.deepEqual(await tableSnapshot(db),beforeRollback,'Application rollback retains 030–032 data and migration records');
      assert.deepEqual(await schemaSnapshot(db),upgradedStructure);
      const oldApp = rollback.createProspectWorkspace({pool:db.pool});
      assert.equal(oldApp.captureNetworking,undefined);
      assert.equal(oldApp.networkingHistory,undefined);
      assert.doesNotMatch(JSON.stringify(await oldApp.search(owner)),privatePattern);
      assert.doesNotMatch(JSON.stringify(await oldApp.route(new Request(`https://example.invalid/api/prospect/lists/${fixture.list.id}/contacts/${fixture.id}`),other)),privatePattern);
      assert.equal((await oldApp.importCSV(owner,{csv,source:'Synthetic legacy import'})).added,1,'legacy import returns original recorded result');
      assert.equal(await count(db,'prospect_contacts'),2,'legacy replay creates no duplicate');
      const beforeDelete = await tableSnapshot(db);
      const broken = rollback.createProspectWorkspace({pool:{...db.pool,connect:async()=>({query:async(sql,values)=>{
        const result = await db.query(sql,values);
        if (/^DELETE FROM prospect_contacts/.test(sql)) throw Error('Synthetic post-delete rollback');
        return result;
      },release(){}})}});
      await assert.rejects(broken.route(new Request(`https://example.invalid/api/prospect/contacts/${fixture.id}`,{method:'DELETE'}),owner),/Synthetic post-delete rollback/);
      assert.deepEqual(await tableSnapshot(db),beforeDelete);
      assert.equal((await oldApp.route(new Request(`https://example.invalid/api/prospect/contacts/${fixture.id}`,{method:'DELETE'}),owner)).deleted,true);
      assert.equal(await count(db,'prospect_networking_captures'),1);
      assert.equal((await oldApp.search(other)).total,1);
      assert.equal((await oldApp.importCSV(owner,{csv:aliasCSV})).rejected,1,'private captured aliases remain tombstoned by rollback candidate');
      const tombstones=(await db.query('SELECT * FROM prospect_forgotten')).rows;
      assert.ok(tombstones.every(row=>/^[a-f0-9]{64}$/.test(row.key_hash)));
      assert.doesNotMatch(JSON.stringify(tombstones),privatePattern);
      assert.equal(await count(db,'lead_acquisitions'),3);
      assert.equal(await count(db,'lab_costs'),1);
      assert.equal(await count(db,'prospect_charges'),1);
      assert.equal(await count(db,'prospect_autopilot_runs'),1);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM lab_observations WHERE field='personal_event'")).rows[0].n,1);
      const rollbackState = await tableSnapshot(db);
      await migrate(db.pool);
      assert.deepEqual(await tableSnapshot(db),rollbackState,'Roll-forward preserves rollback-era data and tombstones');
      assert.equal((await app.captureNetworking(owner,{...captureInput,request_key:'roll-forward-request-0001',person:{first_name:'Jordan',last_name:'Fixture',company:'Private Synthetic Company',country:'US',state:'MA'}})).rejected,1);
      assert.deepEqual(network.attempts,[],'No external provider/auth/network calls attempted');
      t.diagnostic(`Source baseline ${baselineCommit}; target ${targetCommit}; rollback ${rollbackCommit}. Not a claim about the deployed revision or production data.`);
    } finally {
      try { await db?.close(); } finally { network.restore(); await historical?.close(); await rollback?.close(); }
    }
  });
}
