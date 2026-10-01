#!/usr/bin/env node
// Daily rollover leads: the steps the morning routine runs around its
// ZoomInfo calls. Work files live in a scratch directory, never in the repo.
//
//   node scripts/daily-leads/run.mjs plan      --date 2026-09-28
//   node scripts/daily-leads/run.mjs layoff-employers --work DIR
//   node scripts/daily-leads/run.mjs scoop-ids --work DIR
//   node scripts/daily-leads/run.mjs select    --work DIR --date D [--ledger FILE]
//   node scripts/daily-leads/run.mjs finalize  --work DIR --date D [--ledger FILE] [--csv-url U] [--app-url U]
import {sourcingPlan} from './rollover.mjs';
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {select, finalize, toCSV, digest, readLedger, appendLedger, enrichmentRecords, scoopSignals} from './engine.mjs';

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const [command, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((pairs, value, i, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
const fail = message => { console.error(message); process.exit(1); };
const day = args.date || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail('Use --date YYYY-MM-DD.');
const minus = (days, from = day) => new Date(Date.parse(from) - days * 86400000).toISOString().slice(0, 10);
const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
const work = () => { if (!args.work || !existsSync(args.work)) fail('Use --work with an existing scratch directory.'); if (resolve(args.work).startsWith(resolve(fileURLToPath(new URL('../..', import.meta.url))))) fail('Keep work files outside the repository: lead data is never committed.'); return args.work; };
const files = (dir, prefix) => readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort().map(f => readJSON(join(dir, f)));
const ledgerText = () => args.ledger && existsSync(args.ledger) ? readFileSync(args.ledger, 'utf8') : '';

if (command === 'plan') {
  // Rotate through the employer list so each weekday covers different ones.
  const list = config.layoff_employers, n = Math.min(config.employers_per_day, list.length);
  const index = Math.floor(Date.parse(day) / 86400000) * n % list.length;
  const extra = args.extra ? args.extra.split(',').map(s => s.trim()).filter(Boolean) : [];
  const employers = [...extra, ...Array.from({length: n}, (_, i) => list[(index + i) % list.length])]
    .filter((e, i, all) => all.findIndex(x => x.toLowerCase() === e.toLowerCase()) === i).slice(0, n + 4);
  const common = {requiredFieldsList: config.required_fields, state: config.states};
  const queries = [
    {file: 'scoops-moves.json', tool: 'search_scoops', meta: {kind: 'scoops'}, params: {scoopTypes: config.scoop_types, publishedStartDate: minus(config.scoop_days), country: 'United States', managementLevels: config.management_levels, pageSize: 100}},
    {file: 'scoops-layoffs.json', tool: 'search_scoops', meta: {kind: 'scoops'}, params: {scoopTypes: ['Layoffs'], publishedStartDate: minus(14), country: 'United States', pageSize: 50}},
    ...employers.flatMap((employer, i) => [
      {file: `search-b-${i}.json`, tool: 'search_contacts', meta: {kind: 'search', tier: 'B', employer, layoff: extra.includes(employer)}, params: {...common, companyName: employer, companyPastOrPresent: 'past', positionStartDateMin: minus(config.job_change_days), managementLevelList: config.management_levels, pageSize: 25}},
      {file: `search-c-${i}.json`, tool: 'search_contacts', meta: {kind: 'search', tier: 'C', employer, layoff: extra.includes(employer)}, params: {...common, companyName: employer, companyPastOrPresent: 'present', positionStartDateMax: minus(Math.round(config.tenure_years_min * 365.25)), managementLevelList: ['C Level Exec', 'VP Level Exec', 'Director'], pageSize: 10}},
    ]),
  ];
  console.log(JSON.stringify({date: day, rollover_sourcing:sourcingPlan({employers,schools:config.alumni_schools||[],today:day,target:config.rollover_target}), employers, credit_cap: config.enrich_credit_cap, deliver_target: config.deliver_target, kept_goal: config.kept_goal, queries}, null, 1));
} else if (command === 'layoff-employers') {
  // Employers named in recent layoff scoops, fed to `plan --extra`.
  const names = [];
  for (const f of files(work(), 'scoops-')) for (const n of scoopSignals(f.response).layoffEmployers) if (!names.includes(n)) names.push(n);
  console.log(names.filter(n => !/\b(school|county|city of|university|authority|state of)\b/i.test(n)).slice(0, 4).join(','));
} else if (command === 'scoop-ids') {
  // The people named in departure scoops, checked for a mobile and email next.
  const ids = new Set();
  for (const f of files(work(), 'scoops-')) for (const id of scoopSignals(f.response).byPerson.keys()) ids.add(id);
  const batches = []; const all = [...ids]; for (let i = 0; i < all.length; i += 50) batches.push(all.slice(i, i + 50));
  console.log(JSON.stringify({count: all.length, batches, params: {requiredFieldsList: config.required_fields, state: config.states, pageSize: 50}, meta: {kind: 'search', tier: 'A'}}));
} else if (command === 'select') {
  const dir = work(), ledger = readLedger(ledgerText(), {today: day, days: config.ledger_days});
  const result = select([...files(dir, 'scoops-'), ...files(dir, 'search-'), ...files(dir, 'evidence-')], {config, ledger, today: day, target: Number(args.target) || config.deliver_target});
  writeFileSync(join(dir, 'selected.json'), JSON.stringify(result.selected));
  writeFileSync(join(dir, 'select-counts.json'), JSON.stringify(result.counts));
  const ids = result.selected.map(c => c.person_id), batches = [];
  for (let i = 0; i < Math.min(ids.length, config.enrich_credit_cap); i += 10) batches.push(ids.slice(i, Math.min(i + 10, config.enrich_credit_cap)));
  // Counts only on stdout: names and numbers stay in the work files.
  console.log(JSON.stringify({date: day, counts: result.counts, excluded_reasons: result.excluded.reduce((m, e) => ({...m, [e.reason]: (m[e.reason] || 0) + 1}), {}), layoff_employers_seen: result.layoff_employers, enrich_batches: batches}));
} else if (command === 'finalize') {
  const dir = work(), selected = readJSON(join(dir, 'selected.json'));
  const enrichment = new Map();
  for (const f of readdirSync(dir).filter(f => f.startsWith('enrich-') && f.endsWith('.json')).sort()) for (const [id, e] of enrichmentRecords(readFileSync(join(dir, f), 'utf8'))) enrichment.set(id, e);
  // Enrichment can show someone is based abroad; they leave the day's list.
  const all = finalize(selected, enrichment, {today: day}), leads = all.filter(l => !l.abroad);
  const csvName = `daily-leads-${day}.csv`;
  writeFileSync(join(dir, csvName), toCSV(leads, {today: day}));
  const selectSummary = existsSync(join(dir, 'select-counts.json')) ? readJSON(join(dir, 'select-counts.json')) : null;
  const counts = selectSummary || {found: leads.length, already_delivered: 0, excluded: 0, employers: new Set(leads.map(l => (l.signal?.employer || l.company).toLowerCase())).size};
  const mail = digest(leads, {today: day, counts, goal: config.kept_goal, links: {csv: args['csv-url'], app: args['app-url'] || 'https://prospectpilot.io/prospect'}});
  writeFileSync(join(dir, 'digest.html'), mail.html); writeFileSync(join(dir, 'digest.txt'), mail.text);
  writeFileSync(join(dir, 'ledger.csv'), appendLedger(ledgerText(), leads, {today: day}));
  // Counts only, kept with the day's files so spend is never lost with the scratch directory.
  const run = {date: day, delivered: leads.length, with_mobile_and_email: leads.filter(l => l.enriched).length, dropped_abroad: all.length - leads.length, credits_used: all.reduce((n, l) => n + l.credits, 0)};
  writeFileSync(join(dir, `daily-leads-run-${day}.json`), JSON.stringify(run));
  console.log(JSON.stringify({...run, csv: join(dir, csvName), subject: mail.subject, tiers: ['A', 'B', 'C'].map(t => [t, leads.filter(l => l.tier === t).length])}));
} else fail('Commands: plan, layoff-employers, scoop-ids, select, finalize.');
