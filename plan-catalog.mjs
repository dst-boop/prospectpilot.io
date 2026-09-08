import {nameKey} from './lead-quality.mjs';
export async function matchPlans(pool, lead) {
  const names = [...new Set([lead.company, ...(lead.former_employers || [])].filter(Boolean).map(nameKey))].slice(0, 20);
  if (!names.length) return [];
  const result = await pool.query(`SELECT DISTINCT ON(sponsor_key, payload->>'ein', payload->>'plan_number') payload
    FROM employer_plan_catalog WHERE sponsor_key=ANY($1::text[])
    ORDER BY sponsor_key, payload->>'ein', payload->>'plan_number', plan_year DESC LIMIT 30`, [names]);
  return result.rows.map(r => ({...r.payload, match_basis:'Exact normalized employer name; confirm entity before relying on this plan.', scope:'employer_plan'}));
}
export async function selectEmployers(pool, {states = [], max_companies = 10, employers = []} = {}, userId='') {
  const names = employers.map(nameKey);
  const result = await pool.query(`WITH latest AS (SELECT DISTINCT ON(sponsor_key) payload FROM employer_plan_catalog p
    WHERE ($1::text[]='{}' OR state=ANY($1::text[])) AND ($2::text[]='{}' OR sponsor_key=ANY($2::text[]))
    AND COALESCE((payload->>'all_assets_distributed')::boolean,false)=false
    AND plan_year>=EXTRACT(YEAR FROM now())::int-2
    AND ($2::text[]<>'{}' OR NOT EXISTS(SELECT 1 FROM lab_tasks t JOIN lab_runs r ON r.id=t.run_id
      WHERE r.user_id=$3 AND r.created_at>now()-interval '7 days' AND t.payload->>'company'=p.payload->>'sponsor'))
    ORDER BY sponsor_key, plan_year DESC, (payload->>'net_assets')::numeric DESC NULLS LAST)
    SELECT payload FROM latest ORDER BY
    (COALESCE((payload->>'separated_future_benefits')::bigint,0)>0) DESC,
    COALESCE((payload->>'in_service_distributions_reported')::boolean,false) DESC,
    (payload->>'participants_with_balances')::bigint DESC NULLS LAST,payload->>'sponsor' LIMIT $4`, [states, names, userId, max_companies]);
  return result.rows.map(r => r.payload);
}
