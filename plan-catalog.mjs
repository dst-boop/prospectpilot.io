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
  const result = keys.every(k=>k.ein&&k.plan_number)
    ? await pool.query(`SELECT latest.payload FROM jsonb_to_recordset($2::jsonb) AS keys(ein text,plan_number text)
      CROSS JOIN LATERAL (SELECT c.* FROM employer_plan_catalog c
        WHERE c.payload->>'ein'=keys.ein AND c.payload->>'plan_number'=keys.plan_number
        ORDER BY c.plan_year DESC,c.payload->>'period_start' DESC,c.payload->>'filed_at' DESC,c.id DESC LIMIT 1) latest
      WHERE latest.sponsor_key=ANY($1::text[]) ORDER BY latest.plan_year DESC,latest.id LIMIT 30`,[names,JSON.stringify(keys)])
    // Missing plan identifiers cannot establish a shared plan identity; retain each filing.
    : await pool.query(`WITH latest AS (
    SELECT DISTINCT ON(plan_identity_key) * FROM (SELECT *,CASE WHEN NULLIF(payload->>'ein','') IS NOT NULL AND NULLIF(payload->>'plan_number','') IS NOT NULL THEN jsonb_build_array(payload->>'ein',payload->>'plan_number') ELSE jsonb_build_array('filing',id) END AS plan_identity_key FROM employer_plan_catalog) c
    ORDER BY plan_identity_key,plan_year DESC,payload->>'period_start' DESC,payload->>'filed_at' DESC,id DESC)
    SELECT payload FROM latest WHERE sponsor_key=ANY($1::text[])
    ORDER BY plan_year DESC,id LIMIT 30`, [names]);
  return result.rows.map(r => ({...r.payload, match_basis:'Exact normalized employer name only; distinct entities may share this name. Confirm the reported EIN and employer association. This is not evidence of individual participation or a corporate relationship.', scope:'employer_plan'}));
}
// Form 5500 pension benefit codes: 2J is a 401(k) feature, 2L a 403(b) arrangement.
const PLAN_CODES = {'401k': '2J', '403b': '2L'};
export function planKinds(plan) {
  const codes = Array.isArray(plan?.benefit_codes) ? plan.benefit_codes : [];
  return Object.entries(PLAN_CODES).filter(([, code]) => codes.includes(code)).map(([kind]) => kind);
}
// plan_filter narrows which employers are researched first (a rollover
// playbook). Its figures are employer-level and never qualify a person.
export async function selectEmployers(pool, {states = [], max_companies = 10, employers = [], plan_filter = {}} = {}, userId='') {
  const names = employers.map(nameKey);
  const codes = (plan_filter.kinds || []).map(k => PLAN_CODES[k]).filter(Boolean);
  const result = await pool.query(`WITH catalog AS (
    SELECT *,CASE WHEN NULLIF(payload->>'ein','') IS NOT NULL THEN 'ein:'||(payload->>'ein') ELSE 'filing:'||id END AS sponsor_identity_key,
      CASE WHEN NULLIF(payload->>'ein','') IS NOT NULL AND NULLIF(payload->>'plan_number','') IS NOT NULL
        THEN jsonb_build_array(payload->>'ein',payload->>'plan_number') ELSE jsonb_build_array('filing',id) END AS plan_identity_key
    FROM employer_plan_catalog
    ), latest_plan AS (
    SELECT DISTINCT ON(plan_identity_key) * FROM catalog
    ORDER BY plan_identity_key,plan_year DESC,payload->>'period_start' DESC,payload->>'filed_at' DESC,id DESC
    ), name_inventory AS (
      SELECT sponsor_key,count(DISTINCT sponsor_identity_key)::int AS entity_count FROM latest_plan GROUP BY sponsor_key
    ), latest AS (SELECT DISTINCT ON(p.sponsor_key,p.sponsor_identity_key) p.payload,p.sponsor_identity_key,n.entity_count FROM latest_plan p
    JOIN name_inventory n USING(sponsor_key)
    WHERE ($1::text[]='{}' OR state=ANY($1::text[])) AND ($2::text[]='{}' OR sponsor_key=ANY($2::text[]))
    AND COALESCE((payload->>'all_assets_distributed')::boolean,false)=false
    AND plan_year>=EXTRACT(YEAR FROM now())::int-2
    AND plan_year<=EXTRACT(YEAR FROM now())::int
    AND ($5::text[]='{}' OR payload->'benefit_codes' ?| $5::text[])
    AND ($6::numeric=0 OR (payload->>'average_account_balance')::numeric>=$6::numeric)
    AND ($7::boolean=false OR COALESCE((payload->>'in_service_distributions_reported')::boolean,false))
    AND ($2::text[]<>'{}' OR NOT EXISTS(SELECT 1 FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id
      WHERE r.user_id=$3 AND r.created_at>now()-interval '7 days' AND ((t.payload->'plan_sponsor_keys') ? p.sponsor_identity_key
        OR (NOT (t.payload ? 'plan_sponsor_keys') AND n.entity_count=1 AND t.payload->>'company'=p.payload->>'sponsor'))))
    -- Pick one actual plan per reported EIN and name, not per name alone.
    -- Missing EINs stay separate filing candidates. Never sum overlapping people.
    -- Preserve newest eligible year first, then use the requested research signal
    -- before asset size so a larger low-count plan cannot hide a higher-count one.
    ORDER BY p.sponsor_key,p.sponsor_identity_key,plan_year DESC,
      CASE WHEN $8='former_employee_population' THEN (payload->>'separated_future_benefits')::numeric
        WHEN $8='former_employees' THEN (payload->>'separated_future_benefits')::numeric*(payload->>'average_account_balance')::numeric END DESC NULLS LAST,
      (payload->>'net_assets')::numeric DESC NULLS LAST,id)
    SELECT payload,sponsor_identity_key,entity_count FROM latest ORDER BY
    -- Prefer reported former-participant counts; unknown is not a reported zero.
    -- Legacy weighted sorting also keeps missing inputs unknown. These are
    -- employer-level research signals, never an individual's balance.
      CASE WHEN $8='former_employee_population' THEN (payload->>'separated_future_benefits')::numeric
        WHEN $8='former_employees' THEN (payload->>'separated_future_benefits')::numeric*(payload->>'average_account_balance')::numeric END DESC NULLS LAST,
    (COALESCE((payload->>'separated_future_benefits')::bigint,0)>0) DESC,
    COALESCE((payload->>'in_service_distributions_reported')::boolean,false) DESC,
    (payload->>'participants_with_balances')::bigint DESC NULLS LAST,payload->>'sponsor',sponsor_identity_key,payload->>'id' LIMIT $4`, [states, names, userId, max_companies, codes, Number(plan_filter.min_average) || 0, plan_filter.in_service === true, plan_filter.order || '']);
  return result.rows.map(r => ({...r.payload,sponsor_identity_key:r.sponsor_identity_key,
    sponsor_name_entity_count:r.entity_count,sponsor_identity_status:r.entity_count>1?'ambiguous_name':r.payload.ein?'reported_ein':'missing_ein',
    sponsor_identity_basis:'Reported filing identity only. A shared name does not establish one entity, a corporate relationship or individual participation.'}));
}

// A name-only research adapter cannot resolve several reported entities. Keep
// candidate evidence together without inventing a single plan, location or EIN.
export function planResearchTargets(plans){
 const groups=new Map();
 for(const p of plans){const key=nameKey(p.sponsor);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 return [...groups.values()].map(group=>{
  const first=group[0],uncertain=group.length>1||group.some(p=>p.sponsor_identity_status!=='reported_ein');
  const plan_candidates=group.map(p=>({id:p.id,ein:p.ein||null,sponsor:p.sponsor,city:p.city||'',state:p.state||'',plan_year:p.plan_year,separated_future_benefits:p.separated_future_benefits??null}));
  return {company:first.sponsor,...uncertain?{city:'',state:'',plan_identity_review:true,
    plan_identity_notice:'Name-only research: distinct reported EINs or incomplete identifiers need entity review. No single sponsor location or filing is selected; candidates are not a corporate group and counts are not summed.'}:{city:first.city,state:first.state,plan_id:first.id,sponsor_ein:first.ein},
    plan_candidates,plan_sponsor_keys:[...new Set(group.map(p=>p.sponsor_identity_key))]};
 });
}
