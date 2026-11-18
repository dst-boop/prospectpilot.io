// Fail-closed schema034 compatibility inspection. This is a snapshot contract,
// not a lock, privilege audit, migration authorization, or approved rollback floor.
// The caller must keep migration/writer quiescence across inspection and use.
// Does not attest roles/grants, external-schema dependencies, extension binaries,
// database settings, or data contents. Those need independent release evidence.
import {readFileSync} from 'node:fs';
const expected=JSON.parse(readFileSync(new URL('./scripts/rollback-schema034.json',import.meta.url),'utf8'));
const ledger=Array.from({length:34},(_,i)=>String(i+1).padStart(3,'0'));
// Normalize only qualified SQL identifier tokens; leave quoted strings and
// dollar-quoted function bodies untouched. Function source itself stays exact.
export function normalizeSchemaQualification(sql,schema){
 if(typeof sql!=='string')return sql;
 const tokens=sql.match(/\$[A-Za-z_][A-Za-z_0-9]*\$[\s\S]*?\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$[\s\S]*?\$\$|[eE]'(?:''|\\.|[^'])*'|'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_][A-Za-z_0-9$]*|\s+|./g)||[];
 return tokens.map((t,i)=>{const identifier=t.startsWith('"')?t.slice(1,-1).replaceAll('""','"'):t.toLowerCase();return identifier===schema&&tokens[i+1]==='.'?'__rollback_schema__':t;}).join('');
}
// PostgreSQL18 represents NOT NULL in pg_constraint; older supported versions
// use pg_attribute only. Canonicalize it in columns (including18 NOT VALID),
// not version-specific constraint names. All other constraints remain exact.
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
export async function inspectRollbackSchema(client){
 const info=(await client.query('SELECT current_schema() AS schema,current_schemas(false)::text[] AS schemas')).rows[0];
 if(!info?.schema||!Array.isArray(info.schemas)||info.schemas.length!==1||info.schemas[0]!==info.schema)throw Error('Rollback schema requires one explicit application schema');
 const ids=(await client.query('SELECT id FROM prospectpilot_migrations ORDER BY id')).rows.map(r=>r.id);
 if(JSON.stringify(ids)!==JSON.stringify(ledger))throw Error('Rollback schema ledger must be exactly001 through034');
 const sections={};
 for(const [key,sql]of Object.entries(queries)){
  sections[key]=(await client.query(sql)).rows.map(row=>Object.fromEntries(Object.entries(row).map(([field,value])=>[field,field==='source'?value:normalizeSchemaQualification(value,info.schema)])));
 }
 return {version:1,migrations:ids,sections};
}
export async function verifyRollbackSchema(client){
 try{
  const actual=await inspectRollbackSchema(client);
  for(const key of Object.keys(expected.sections))if(JSON.stringify(actual.sections[key])!==JSON.stringify(expected.sections[key]))throw Error('Rollback schema mismatch: '+key);
  if(JSON.stringify(actual.migrations)!==JSON.stringify(expected.migrations)||actual.version!==expected.version)throw Error('Rollback schema manifest mismatch');
  return {compatible:true,schema:'034',scope:'catalog snapshot only; no migration or floor approval'};
 }catch(error){throw new Error('Rollback schema verification refused startup',{cause:error});}
}
