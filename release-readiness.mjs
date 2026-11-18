export const RELEASE_SCHEMA_VERSION='034';
const requiredMigrations=Array.from({length:Number(RELEASE_SCHEMA_VERSION)},(_,i)=>String(i+1).padStart(3,'0'));
export const READINESS_PATH='/api/release/readiness';
export function candidateOrigin(value){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.pathname==='/'&&!url.search&&!url.hash&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.run\.app$/.test(url.hostname)&&value===url.origin?url.origin:null;}catch{return null;}
}
// A single read-only query checks the actual connection and every required migration.
export function createReleaseReadiness({pool,database,releaseId}){
  return async()=>{
    if(!database||!releaseId)return false;
    const {rows}=await pool.query({text:`SELECT current_database() AS database,
      to_regclass('public.prospect_networking_captures') IS NOT NULL AS capture_table,
      (to_regclass('public.prospect_identity_evidence') IS NOT NULL AND to_regclass('public.prospect_historical_identifiers') IS NOT NULL AND to_regclass('public.prospect_historical_reviews') IS NOT NULL) AS historical_tables,
      (SELECT count(DISTINCT id)::integer FROM public.prospectpilot_migrations
       WHERE id = ANY($1::text[])) AS migration_count`,
      values:[requiredMigrations],query_timeout:10000});
    return rows.length===1&&rows[0].database===database&&rows[0].capture_table===true&&rows[0].historical_tables===true&&rows[0].migration_count===requiredMigrations.length;
  };
}
