import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import pg from 'pg';
import {nameKey} from '../lead-quality.mjs';
const file = process.argv[2];
if (!file) throw Error('Usage: node scripts/import-plan-catalog.mjs plan-catalog.jsonl');
const pool = new pg.Pool({max:1,connectionTimeoutMillis:10000});
let batch=[], total=0;
async function flush() {
  if (!batch.length) return;
  // A single atomic batch; older runs cannot overwrite a newer filing for the same plan.
  await pool.query(`INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload)
    SELECT p->>'id',p->>'sponsor_key',p->>'state',(p->>'plan_year')::int,p
    FROM jsonb_array_elements($1::jsonb) p
    ON CONFLICT(id) DO UPDATE SET sponsor_key=EXCLUDED.sponsor_key,state=EXCLUDED.state,plan_year=EXCLUDED.plan_year,payload=EXCLUDED.payload,imported_at=now()
    WHERE COALESCE(employer_plan_catalog.payload->>'filed_at','') <= COALESCE(EXCLUDED.payload->>'filed_at','')`, [JSON.stringify(batch)]);
  total+=batch.length;batch=[];
}
try {
  for await (const line of createInterface({input:createReadStream(file),crlfDelay:Infinity})) {
    if (!line.trim()) continue;
    const p=JSON.parse(line);
    if (!p.id || !p.sponsor || p.scope!=='employer_plan' || p.individual_balance!==null || !Number.isInteger(p.plan_year)) throw Error('Invalid plan catalog record');
    batch.push({...p,sponsor_key:nameKey(p.sponsor)});
    if (batch.length===500) await flush();
  }
  await flush();console.log(JSON.stringify({employer_plans_processed:total,individual_leads:0}));
} finally {await pool.end();}
