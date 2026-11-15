// Exact historical source fixtures, not production data or a production assertion.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join, dirname, resolve, sep} from 'node:path';
export const baselineCommit = 'b543fa4e52ee40f2e78a793733b9fbc3f6d29d50';
export const targetCommit = '6fb7209a425a6b92c8ca52f4fdf22d247c9e8a3f';
export const rollbackCommit = '402e079d7d31297bd56412d4c236bec18d98d130';
const root = fileURLToPath(new URL('../../', import.meta.url));
function git(args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true});
}
export async function historicalModules(commit) {
  assert.ok([baselineCommit, rollbackCommit].includes(commit), 'Only reviewed fixed commits are allowed');
  assert.equal(git(['rev-parse', `${commit}^{commit}`]).trim(), commit, 'Missing pinned commit; fetch repository history first');
  // A child of the checkout so Node resolves the same locked dependencies.
  const directory = await mkdtemp(join(root, '.upgrade-fixture-'));
  try {
    const files = git(['ls-tree', '-r', '--name-only', commit]).trim().split('\n')
      .filter(file => /^[a-zA-Z0-9-]+\.mjs$/.test(file) || file === 'generated/schema.sql' || /^migrations\/\d{3}-[a-z0-9-]+\.sql$/.test(file));
    for (const file of files) {
      const destination = join(directory, file);
      assert.ok(resolve(destination).startsWith(resolve(directory) + sep));
      await mkdir(dirname(destination), {recursive: true});
      await writeFile(destination, git(['show', `${commit}:${file}`]));
    }
    const migration = await import(pathToFileURL(join(directory, 'migrate.mjs')));
    const workspace = await import(pathToFileURL(join(directory, 'prospect-workspace.mjs')));
    return {migrate: migration.migrate, ...workspace, close: () => rm(directory, {recursive: true, force: true})};
  } catch (error) { await rm(directory, {recursive: true, force: true}); throw error; }
}
export function assertPinnedTargetMigrations() {
  const planned = git(['show', `${targetCommit}:migrate.mjs`]);
  assert.equal(readFileSync(join(root, 'migrate.mjs'), 'utf8').replaceAll('\r\n', '\n'), planned.replaceAll('\r\n', '\n'), 'Target migration runner drifted from pinned PR97');
  assert.match(planned, /\['029','migrations\/029-lab-lead-ledger.sql'\],\['030'/);
  return ['030-personal-events.sql', '031-autopilot.sql', '032-networking-capture.sql'].map(file => ({file, sql: git(['show', `${targetCommit}:migrations/${file}`])}));
}
export async function tableSnapshot(db, names) {
  const tables = names || (await db.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).rows.map(row => row.tablename);
  const result = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.row);
  }
  return result;
}
export async function schemaSnapshot(db) {
  return {
    tables: (await db.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).rows,
    indexes: (await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() ORDER BY indexname")).rows,
    constraints: (await db.query("SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() ORDER BY c.relname,k.conname")).rows,
  };
}
export async function rollsBack(db, work) {
  await db.query('BEGIN');
  try { return await work(); } finally { await db.query('ROLLBACK'); }
}
