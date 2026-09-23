import {nameKey} from './lead-quality.mjs';
export async function importPlanRecords(client, records) {
  let batch=[], total=0, written=0;
  async function flush() {
    if(!batch.length)return;
    const result=await client.query(`INSERT INTO employer_plan_catalog(id,sponsor_key,state,plan_year,payload)
      SELECT p->>'id',p->>'sponsor_key',p->>'state',(p->>'plan_year')::int,p FROM jsonb_array_elements($1::jsonb) p
      ON CONFLICT(id) DO UPDATE SET sponsor_key=EXCLUDED.sponsor_key,state=EXCLUDED.state,plan_year=EXCLUDED.plan_year,payload=EXCLUDED.payload,imported_at=now()
      WHERE COALESCE(employer_plan_catalog.payload->>'filed_at','') < COALESCE(EXCLUDED.payload->>'filed_at','')
      OR (COALESCE(employer_plan_catalog.payload->>'filed_at','') = COALESCE(EXCLUDED.payload->>'filed_at','')
      AND COALESCE(employer_plan_catalog.payload->>'ack_id','') <= COALESCE(EXCLUDED.payload->>'ack_id',''))`,[JSON.stringify(batch)]);
    total+=batch.length;written+=result.rowCount??result.affectedRows??0;batch=[];
  }
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query('SELECT pg_advisory_xact_lock(505003)');
    for await(const p of records){
      if(!p.id||!p.sponsor||p.scope!=='employer_plan'||p.individual_balance!==null||!Number.isInteger(p.plan_year))throw Error('Invalid plan catalog record');
      batch.push({...p,sponsor_key:nameKey(p.sponsor)});
      if(batch.length===500)await flush();
    }
    await flush();
    if(!total)throw Error('Empty plan catalog; previous catalog retained');
    if(written)await client.query(`INSERT INTO employer_plan_catalog_summary(id,plans,filings,latest_plan_year,imported_at)
      SELECT 1,count(DISTINCT (payload->>'ein',payload->>'plan_number'))::int,count(*)::int,max(plan_year),max(imported_at) FROM employer_plan_catalog
      ON CONFLICT(id) DO UPDATE SET plans=EXCLUDED.plans,filings=EXCLUDED.filings,
      latest_plan_year=EXCLUDED.latest_plan_year,imported_at=EXCLUDED.imported_at,calculated_at=now()`);
    await client.query('COMMIT');
    return {employer_plans_processed:total,filings_written:written,older_filings_skipped:total-written,individual_leads:0};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function catalogSummary(pool) {
  const row=(await pool.query('SELECT plans,filings,latest_plan_year,imported_at,calculated_at FROM employer_plan_catalog_summary WHERE id=1')).rows[0];
  if(!row)throw Error('Catalog summary migration is required.');
  return row;
}

export async function matchPlans(pool, lead) {
  const names = [...new Set([lead.company, ...(lead.former_employers || [])].filter(Boolean).map(nameKey))].slice(0, 20);
  if (!names.length) return [];
  // Find candidate plan identities using the sponsor index, then inspect each
  // identity's latest filing. Filtering the latest row by name afterward keeps
  // renamed sponsors from matching an old employer name.
  const keys=(await pool.query(`SELECT DISTINCT payload->>'ein' AS ein,payload->>'plan_number' AS plan_number
    FROM employer_plan_catalog WHERE sponsor_key=ANY($1::text[])`,[names])).rows;
  if(!keys.length)return [];
  const result = keys.every(k=>k.ein!==null&&k.plan_number!==null)
    ? await pool.query(`SELECT latest.payload FROM jsonb_to_recordset($2::jsonb) AS keys(ein text,plan_number text)
      CROSS JOIN LATERAL (SELECT c.* FROM employer_plan_catalog c
        WHERE c.payload->>'ein'=keys.ein AND c.payload->>'plan_number'=keys.plan_number
        ORDER BY c.plan_year DESC,c.payload->>'period_start' DESC,c.payload->>'filed_at' DESC,c.id DESC LIMIT 1) latest
      WHERE latest.sponsor_key=ANY($1::text[]) ORDER BY latest.plan_year DESC,latest.id LIMIT 30`,[names,JSON.stringify(keys)])
    // Preserve existing grouping for legacy records without complete plan IDs.
    : await pool.query(`WITH latest AS (
    SELECT DISTINCT ON(payload->>'ein',payload->>'plan_number') * FROM employer_plan_catalog
    ORDER BY payload->>'ein',payload->>'plan_number',plan_year DESC,payload->>'period_start' DESC,payload->>'filed_at' DESC,id DESC)
    SELECT payload FROM latest WHERE sponsor_key=ANY($1::text[])
    ORDER BY plan_year DESC,id LIMIT 30`, [names]);
  return result.rows.map(r => ({...r.payload, match_basis:'Exact normalized employer name; confirm entity before relying on this plan.', scope:'employer_plan'}));
}
export async function selectEmployers(pool, {states = [], max_companies = 10, employers = []} = {}, userId='') {
  const names = employers.map(nameKey);
  const result = await pool.query(`WITH latest_plan AS (
    SELECT DISTINCT ON(payload->>'ein',payload->>'plan_number') * FROM employer_plan_catalog
    ORDER BY payload->>'ein',payload->>'plan_number',plan_year DESC,payload->>'period_start' DESC,payload->>'filed_at' DESC,id DESC
    ), latest AS (SELECT DISTINCT ON(sponsor_key) payload FROM latest_plan p
    WHERE ($1::text[]='{}' OR state=ANY($1::text[])) AND ($2::text[]='{}' OR sponsor_key=ANY($2::text[]))
    AND COALESCE((payload->>'all_assets_distributed')::boolean,false)=false
    AND plan_year>=EXTRACT(YEAR FROM now())::int-2
    AND plan_year<=EXTRACT(YEAR FROM now())::int
    AND ($2::text[]<>'{}' OR NOT EXISTS(SELECT 1 FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id
      WHERE r.user_id=$3 AND r.created_at>now()-interval '7 days' AND t.payload->>'company'=p.payload->>'sponsor'))
    ORDER BY sponsor_key, plan_year DESC, (payload->>'net_assets')::numeric DESC NULLS LAST)
    SELECT payload FROM latest ORDER BY
    (COALESCE((payload->>'separated_future_benefits')::bigint,0)>0) DESC,
    COALESCE((payload->>'in_service_distributions_reported')::boolean,false) DESC,
    (payload->>'participants_with_balances')::bigint DESC NULLS LAST,payload->>'sponsor' LIMIT $4`, [states, names, userId, max_companies]);
  return result.rows.map(r => r.payload);
}
