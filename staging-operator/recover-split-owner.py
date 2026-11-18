"""Recovery ONLY: existing verified roles/secrets, bootstrap-owned empty database."""
import os,json,sys,hashlib,importlib.util,subprocess
from pathlib import Path
SOURCE=Path(__file__).with_name('create-roles.py')
if hashlib.sha256(SOURCE.read_bytes()).hexdigest()!='aad04119289538bdc2dce3f3b3ce22e0e158e983d384a0448c7e3d632ab1e725':raise RuntimeError('Reviewed helper mismatch')
spec=importlib.util.spec_from_file_location('roles',SOURCE);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
phase='preflight'

def setup_database(admin,schema):
    # Bootstrap postgres retains DB/public schema ownership. No role memberships.
    admin('CREATE DATABASE '+m.ident(m.DATABASE)+' OWNER postgres;')
    admin('REVOKE ALL ON DATABASE '+m.ident(m.DATABASE)+' FROM PUBLIC; GRANT CONNECT ON DATABASE '+m.ident(m.DATABASE)+' TO '+m.ident(m.INIT_ROLE)+';')
    schema('REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO '+m.ident(m.INIT_ROLE)+';')

def main():
    global phase
    if os.environ.get('STAGING_SPLIT_OWNER_PROOF')!='pg16-split-owner-v1':raise RuntimeError('Actual split-owner native proof required')
    if os.environ.get('STAGING_CONFIRMED_PROXY_TARGET')!=m.PROJECT+':us-central1:'+m.INSTANCE:raise RuntimeError('Confirmed dedicated proxy target required')
    env=m.transport_env(os.environ)
    def gc(args):return m.run(['gcloud',*args,'--project',m.PROJECT,'--quiet','--verbosity=error'],env=env)
    cfg=json.loads(gc(['config','list','--format=json']))
    if any(cfg.get('api_endpoint_overrides',{}).values()) or any(cfg.get('proxy',{}).values()) or cfg.get('core',{}).get('custom_ca_certs_file'):raise RuntimeError('Persisted transport override')
    instance=json.loads(gc(['sql','instances','describe',m.INSTANCE,'--format=json']))
    if any(instance.get(k)!=v for k,v in {'name':m.INSTANCE,'region':'us-central1','databaseVersion':'POSTGRES_16','state':'RUNNABLE','connectionName':m.PROJECT+':us-central1:'+m.INSTANCE}.items()) or instance.get('masterInstanceName') or instance.get('replicaNames'):raise RuntimeError('Wrong instance/state')
    if not m.run(['psql','--version'],env=env).decode().startswith('psql (PostgreSQL) 16.'):raise RuntimeError('Expected psql16')
    passwords={role:gc(['secrets','versions','access','1','--secret',secret]).decode() for role,secret in [('postgres',m.BOOT_SECRET),(m.INIT_ROLE,m.INIT_SECRET),(m.RUN_ROLE,m.RUN_SECRET)]}
    if len(set(passwords.values()))!=3 or any(not p for p in passwords.values()):raise RuntimeError('Distinct existing credentials required')
    def connection(role,database):
        def query(statement):
            return m.run(['psql','-X','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--host','127.0.0.1','--port','55438','--username',role,'--dbname',database],statement.encode(),{**env,'PGPASSWORD':passwords[role],'PGCONNECT_TIMEOUT':'10','PGSSLMODE':'disable','PGOPTIONS':'-c statement_timeout=30000 -c lock_timeout=5000'}).decode().strip()
        return query
    admin=connection('postgres','postgres')
    def precheck():
        if admin('SELECT current_user;')!='postgres' or admin("SELECT current_setting('server_version_num')::int BETWEEN 160000 AND 169999;")!='t':raise RuntimeError('Wrong SQL operator/version')
        if admin("SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','cloudsqladmin','template0','template1');")!='0':raise RuntimeError('Existing application database')
        attrs=json.loads(admin("SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'unsafe',rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) FROM pg_roles WHERE rolname LIKE 'prospectpilot_stg_%';"))
        if {r['name'] for r in attrs}!={m.INIT_ROLE,m.RUN_ROLE} or any(r['unsafe'] or not r['login'] for r in attrs):raise RuntimeError('Unexpected role inventory/privileges')
        if admin("SELECT count(*) FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('prospectpilot_stg_init','prospectpilot_stg_runtime')) OR roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('prospectpilot_stg_init','prospectpilot_stg_runtime'));")!='0':raise RuntimeError('Unexpected role memberships')
    precheck()
    for role in passwords:
        if connection(role,'postgres')('SELECT current_user;')!=role:raise RuntimeError('Existing credential does not match role')
    precheck()
    phase='create bootstrap-owned database and initializer schema privileges'
    setup_database(admin,connection('postgres',m.DATABASE))
    phase='verify explicit ownership and initializer privileges'
    if admin('SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='+m.literal(m.DATABASE)+';')!='postgres':raise RuntimeError('Wrong DB owner')
    init=connection(m.INIT_ROLE,m.DATABASE)
    verified=json.loads(init("SELECT json_build_object('user',current_user,'database_create',has_database_privilege(current_user,current_database(),'CREATE'),'schema_usage',has_schema_privilege(current_user,'public','USAGE'),'schema_create',has_schema_privilege(current_user,'public','CREATE'),'tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'));"))
    if verified!={'user':m.INIT_ROLE,'database_create':False,'schema_usage':True,'schema_create':True,'tables':0}:raise RuntimeError('Unexpected initializer privileges/state')
    state=json.loads(connection('postgres',m.DATABASE)("SELECT json_build_object('schema_owner',pg_get_userbyid(nspowner),'runtime_connect',has_database_privilege('prospectpilot_stg_runtime',current_database(),'CONNECT'),'runtime_schema',has_schema_privilege('prospectpilot_stg_runtime','public','USAGE')) FROM pg_namespace WHERE nspname='public';"))
    if state.get('schema_owner') not in {'pg_database_owner','postgres'} or state.get('runtime_connect') is not False or state.get('runtime_schema') is not False:raise RuntimeError('Unexpected public/runtime privileges')
    # No migrations, table grants, IAM, credential changes or deployment.

if __name__=='__main__':
    try:main()
    except Exception:
        print('Recovery stopped during '+phase+'. Inspect partial state; no automatic retry or cleanup.',file=sys.stderr);sys.exit(1)
