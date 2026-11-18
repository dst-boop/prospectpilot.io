// Explicit reviewed-route candidate grants; not a general migration or production tool.
export const writableTables=Object.freeze(['prospect_contacts','prospect_imports','prospect_lists','prospect_list_members','prospect_saved_searches','prospect_identity_evidence','prospect_historical_reviews','prospect_historical_identifiers','lead_acquisitions','prospect_external_usage','discovery_users','discovery_leads','discovery_audit','lab_settings','lab_runs','lab_run_leads','lab_observations','lab_qualification','lab_identity_reviews','advisor_activities','advisor_contact_links','advisor_profiles','advisor_rest_periods']);
export const readableTables=Object.freeze(['employer_plan_catalog_summary','employer_plan_catalog','prospect_forgotten','prospect_list_shares','prospect_memberships','prospect_networking_captures','research_jobs','lab_tasks','lab_costs','lab_companies','lead_call_records','prospect_jobs','prospect_charges','prospect_tasks','prospectpilot_migrations','staging_pilot_identity']);
const valid=value=>/^prospectpilot_stg_[a-z0-9_]+$/.test(value||'');
export function stagingDatabaseGrants(database,role){
 if(!valid(database)||!valid(role))throw Error('Explicit staging database and role required');
 return `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE "${database}" TO "${role}"; GRANT USAGE ON SCHEMA public TO "${role}";`;
}
export function stagingTableGrants(role){
 if(!valid(role))throw Error('Explicit staging role required');
 return writableTables.map(t=>`GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.${t} TO "${role}";`).join('\n')+'\n'+readableTables.map(t=>`GRANT SELECT ON TABLE public.${t} TO "${role}";`).join('\n');
}
export function stagingGrants(database,role){return stagingDatabaseGrants(database,role)+'\n'+stagingTableGrants(role);}
