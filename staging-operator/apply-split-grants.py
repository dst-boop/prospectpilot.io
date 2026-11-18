"""Prepared only: grant reviewed table rights using separate object owners."""
import os,json,sys,hashlib,importlib.util
from pathlib import Path
HERE=Path(__file__).resolve().parent
HELPER=HERE/'create-roles.py'
GRANTS=HERE.parent/'scripts/staging-db-grants.mjs'
if hashlib.sha256(HELPER.read_bytes()).hexdigest()!='aad04119289538bdc2dce3f3b3ce22e0e158e983d384a0448c7e3d632ab1e725' or hashlib.sha256(GRANTS.read_bytes()).hexdigest()!='b4a289ab92f1e1d4fc92ec989b82d040412dd28f9c613c2ba7a80f536199a783':raise RuntimeError('Reviewed source mismatch')
spec=importlib.util.spec_from_file_location('roles',HELPER);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
UID='WVxUh1LmGvWKYnRxjBYM0VbwGZX2'
EXPIRY='2026-11-25T00:00:00.000Z'
phase='preflight'

def exact_ledger(ids):return ids==[f'{n:03d}' for n in range(1,35)]

def main():
 global phase
 if os.environ.get('STAGING_INITIALIZATION_VERIFIED')!='be72525d6db06766fca7d19887c851666a38b081':raise RuntimeError('Exact reviewed initialization required')
 if os.environ.get('STAGING_SPLIT_OWNER_PROOF')!='pg16-split-owner-v1':raise RuntimeError('Split-owner proof required')
 if os.environ.get('STAGING_CONFIRMED_PROXY_TARGET')!=m.PROJECT+':us-central1:'+m.INSTANCE:raise RuntimeError('Confirmed proxy target required')
 env=m.transport_env(os.environ)
 def gc(args):return m.run(['gcloud',*args,'--project',m.PROJECT,'--quiet','--verbosity=error'],env=env)
 cfg=json.loads(gc(['config','list','--format=json']))
 if any(cfg.get('api_endpoint_overrides',{}).values()) or any(cfg.get('proxy',{}).values()) or cfg.get('core',{}).get('custom_ca_certs_file'):raise RuntimeError('Persisted transport override')
 inst=json.loads(gc(['sql','instances','describe',m.INSTANCE,'--format=json']))
 if any(inst.get(k)!=v for k,v in {'name':m.INSTANCE,'region':'us-central1','databaseVersion':'POSTGRES_16','state':'RUNNABLE','connectionName':m.PROJECT+':us-central1:'+m.INSTANCE}.items()) or inst.get('masterInstanceName') or inst.get('replicaNames'):raise RuntimeError('Wrong instance/state')
 if not m.run(['psql','--version'],env=env).decode().startswith('psql (PostgreSQL) 16.'):raise RuntimeError('Expected psql16')
 passwords={role:gc(['secrets','versions','access','1','--secret',secret]).decode() for role,secret in [('postgres',m.BOOT_SECRET),(m.INIT_ROLE,m.INIT_SECRET),(m.RUN_ROLE,m.RUN_SECRET)]}
 if len(set(passwords.values()))!=3 or any(not p for p in passwords.values()):raise RuntimeError('Distinct existing credentials required')
 def connection(role):
  def sql(statement):
   return m.run(['psql','-X','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--host','127.0.0.1','--port','55438','--username',role,'--dbname',m.DATABASE],statement.encode(),{**env,'PGPASSWORD':passwords[role],'PGCONNECT_TIMEOUT':'10','PGSSLMODE':'disable','PGOPTIONS':'-c statement_timeout=30000 -c lock_timeout=5000'}).decode().strip()
  return sql
 bootstrap=connection('postgres');initializer=connection(m.INIT_ROLE)
 if bootstrap('SELECT current_user;')!='postgres' or initializer('SELECT current_user;')!=m.INIT_ROLE:raise RuntimeError('Wrong owner connections')
 if bootstrap('SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database();')!='postgres':raise RuntimeError('Wrong DB owner')
 marker=json.loads(initializer("SELECT json_build_object('project',project_id,'uid',owner_uid,'expires',to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')) FROM staging_pilot_identity WHERE singleton=true;"))
 if marker!={'project':m.PROJECT,'uid':UID,'expires':EXPIRY}:raise RuntimeError('Verified owner marker mismatch')
 if not exact_ledger(json.loads(initializer("SELECT json_agg(id ORDER BY id) FROM prospectpilot_migrations;"))):raise RuntimeError('Wrong migration ledger')
 if initializer("SELECT (SELECT count(*) FROM prospect_contacts)+(SELECT count(*) FROM discovery_leads);")!='0':raise RuntimeError('Expected empty fictional workspace')
 def restrictions():
  if bootstrap("SELECT count(*) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('prospectpilot_stg_init','prospectpilot_stg_runtime')) OR roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('prospectpilot_stg_init','prospectpilot_stg_runtime'));")!='0':raise RuntimeError('Unexpected role membership')
  attrs=json.loads(bootstrap("SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'unsafe',rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) FROM pg_roles WHERE rolname IN ('prospectpilot_stg_init','prospectpilot_stg_runtime');"))
  if len(attrs)!=2 or any(a['unsafe'] or not a['login'] for a in attrs):raise RuntimeError('Unsafe role attributes')
  if initializer("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND pg_get_userbyid(c.relowner)<>current_user;")!='0':raise RuntimeError('Unexpected table owner')
  if initializer("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_get_userbyid(p.proowner)<>current_user;")!='0':raise RuntimeError('Unexpected function owner')
 restrictions()
 # Generator module is exact SHA-pinned, pure SQL generation. No credentials passed.
 code="import {stagingDatabaseGrants,stagingTableGrants,writableTables,readableTables} from "+json.dumps(GRANTS.as_uri())+";process.stdout.write(JSON.stringify({database:stagingDatabaseGrants('prospectpilot_stg_app','prospectpilot_stg_runtime'),tables:stagingTableGrants('prospectpilot_stg_runtime'),writableTables,readableTables}));"
 generated=json.loads(m.run(['node','--input-type=module','-e',code],env=env))
 phase='bootstrap database/schema grant transaction'
 bootstrap('BEGIN;'+generated['database']+'COMMIT;')
 phase='initializer table grant transaction'
 initializer('BEGIN;'+generated['tables']+'COMMIT;')
 phase='read-only runtime privilege verification'
 runtime=connection(m.RUN_ROLE)
 if runtime('SELECT current_user;')!=m.RUN_ROLE:raise RuntimeError('Wrong runtime login')
 permissions=json.loads(runtime("SELECT json_build_object('connect',has_database_privilege(current_user,current_database(),'CONNECT'),'dbcreate',has_database_privilege(current_user,current_database(),'CREATE'),'temp',has_database_privilege(current_user,current_database(),'TEMP'),'usage',has_schema_privilege(current_user,'public','USAGE'),'schemacreate',has_schema_privilege(current_user,'public','CREATE'));"))
 if permissions!={'connect':True,'dbcreate':False,'temp':False,'usage':True,'schemacreate':False}:raise RuntimeError('Unexpected runtime database/schema privileges')
 if runtime("SELECT count(*) FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user);")!='0':raise RuntimeError('Runtime owns objects')
 if runtime("SELECT count(*) FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user);")!='0':raise RuntimeError('Runtime owns namespaces')
 if runtime("SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND a.is_grantable;")!='0':raise RuntimeError('Runtime grant authority')
 actual=json.loads(runtime("SELECT json_agg(json_build_object('table',c.relname,'select',has_table_privilege(current_user,c.oid,'SELECT'),'insert',has_table_privilege(current_user,c.oid,'INSERT'),'update',has_table_privilege(current_user,c.oid,'UPDATE'),'delete',has_table_privilege(current_user,c.oid,'DELETE'),'truncate',has_table_privilege(current_user,c.oid,'TRUNCATE'),'references',has_table_privilege(current_user,c.oid,'REFERENCES'),'trigger',has_table_privilege(current_user,c.oid,'TRIGGER'))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p');"))
 writable=set(generated['writableTables']);readable=set(generated['readableTables'])
 for row in actual:
  expected={'select':row['table'] in writable|readable,'insert':row['table'] in writable,'update':row['table'] in writable,'delete':row['table'] in writable,'truncate':False,'references':False,'trigger':False}
  if any(row[k]!=v for k,v in expected.items()):raise RuntimeError('Runtime table privileges mismatch')
 if not (writable|readable) <= {row['table'] for row in actual}:raise RuntimeError('Missing reviewed tables')
 restrictions()
 # No data writes, user invitations, public exposure or runtime deployment.

if __name__=='__main__':
 try:main()
 except Exception:
  print('Grant application stopped during '+phase+'. Inspect exact staging ACL state before retry; credentials not displayed.',file=sys.stderr);sys.exit(1)
