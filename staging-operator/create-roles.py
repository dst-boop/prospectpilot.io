"""Prepared staging-only role setup; never executes on import."""
import os,json,secrets,subprocess,hashlib,hmac,base64,re,sys
PROJECT='prospectpilot-stg-261118'
INSTANCE='prospectpilot-stg-db'
DATABASE='prospectpilot_stg_app'
INIT_ROLE='prospectpilot_stg_init'
RUN_ROLE='prospectpilot_stg_runtime'
BOOT_SECRET='prospectpilot-stg-bootstrap-postgres-password'
INIT_SECRET='prospectpilot-stg-initializer-password'
RUN_SECRET='prospectpilot-stg-runtime-password'
PROOF='89b18830e039a83b78bd427ddd01a33c2f9e242c'
phase='preflight'

def run(args,data=None,env=None):
    p=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,check=False)
    if p.returncode: raise RuntimeError('Subprocess failed')
    return p.stdout

def transport_env(source):
    forbidden={'http_proxy','https_proxy','all_proxy','ssl_cert_file','ssl_cert_dir','requests_ca_bundle','curl_ca_bundle','cloudsdk_core_custom_ca_certs_file'}
    for key,value in source.items():
        k=key.lower()
        if value and (k in forbidden or k.startswith('cloudsdk_api_endpoint_overrides_') or k.startswith('cloudsdk_proxy_') or k.startswith('pg')):
            raise RuntimeError('Inherited transport/database override forbidden')
    return {**source,'CLOUDSDK_CORE_LOG_HTTP':'false','CLOUDSDK_CORE_VERBOSITY':'error'}

def scram(password,salt=None):
    salt=secrets.token_bytes(16) if salt is None else salt
    salted=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,4096)
    client=hmac.new(salted,b'Client Key',hashlib.sha256).digest()
    stored=hashlib.sha256(client).digest()
    server=hmac.new(salted,b'Server Key',hashlib.sha256).digest()
    b64=lambda b:base64.b64encode(b).decode()
    return 'SCRAM-SHA-256$4096:'+b64(salt)+'$'+b64(stored)+':'+b64(server)

def literal(s):return "'"+s.replace("'","''")+"'"
def ident(s):
    if not re.fullmatch(r'prospectpilot_stg_[a-z0-9_]+',s):raise RuntimeError('Invalid staging identifier')
    return '"'+s+'"'

def membership_snapshot(sql,initializer):
    statement="SELECT COALESCE(json_agg(json_build_object('grantor',g.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY g.rolname)::text,'[]') FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND m.roleid=(SELECT oid FROM pg_roles WHERE rolname="+literal(initializer)+");"
    return json.loads(sql(statement))

def create_owned_database(sql,initializer,database):
    operator=sql('SELECT current_user;')
    if operator!='postgres' and not re.fullmatch(r'prospectpilot_stg_operator_[a-f0-9]+',operator):
        raise RuntimeError('Unexpected bootstrap operator')
    operator_sql='"'+operator+'"';role_sql=ident(initializer)
    baseline=membership_snapshot(sql,initializer)
    # Preserve automatic ADMIN-only grant made by the bootstrap superuser. Never
    # revoke or alter it. Own-grant baseline would make cleanup ambiguous.
    if any(row['set'] or row['inherit'] or row['grantor']==operator for row in baseline):
        raise RuntimeError('Unexpected initializer membership baseline')
    if sql("SELECT pg_has_role(current_user,"+literal(initializer)+",'SET');")!='f':
        raise RuntimeError('Unexpected preexisting effective SET authority')
    try:
        sql('GRANT '+role_sql+' TO '+operator_sql+' WITH SET TRUE, INHERIT FALSE GRANTED BY '+operator_sql+';')
        if sql("SELECT pg_has_role(current_user,"+literal(initializer)+",'SET');")!='t':
            raise RuntimeError('Temporary SET capability missing')
        sql('CREATE DATABASE '+ident(database)+' OWNER '+role_sql+';')
    finally:
        sql('REVOKE '+role_sql+' FROM '+operator_sql+' GRANTED BY '+operator_sql+';')
        if membership_snapshot(sql,initializer)!=baseline:
            raise RuntimeError('Membership baseline restoration failed')
        if sql("SELECT pg_has_role(current_user,"+literal(initializer)+",'SET');")!='f':
            raise RuntimeError('Temporary SET authority remains')

def main():
    global phase
    if os.environ.get('STAGING_NATIVE_ROLE_PROOF_COMMIT')!=PROOF:raise RuntimeError('Successful exact native proof attestation required')
    if os.environ.get('STAGING_CONFIRMED_PROXY_TARGET')!=PROJECT+':us-central1:'+INSTANCE:raise RuntimeError('Confirmed dedicated proxy target required')
    if os.environ.get('STAGING_NON_SUPERUSER_ROLE_PROOF')!='pg16-nonsuperuser-v1':raise RuntimeError('Successful non-superuser ownership rehearsal required')
    env=transport_env(os.environ)
    def gc(args,data=None):return run(['gcloud',*args,'--project',PROJECT,'--quiet','--verbosity=error'],data,env)
    configuration=json.loads(gc(['config','list','--format=json']))
    if any(configuration.get('api_endpoint_overrides',{}).values()) or any(configuration.get('proxy',{}).values()) or configuration.get('core',{}).get('custom_ca_certs_file'):raise RuntimeError('Persisted transport override')
    instance=json.loads(gc(['sql','instances','describe',INSTANCE,'--format=json']))
    expected={'name':INSTANCE,'region':'us-central1','databaseVersion':'POSTGRES_16','state':'RUNNABLE','connectionName':PROJECT+':us-central1:'+INSTANCE}
    if any(instance.get(k)!=v for k,v in expected.items()) or instance.get('masterInstanceName') or instance.get('replicaNames'):raise RuntimeError('Wrong instance/state')
    users=json.loads(gc(['sql','users','list','--instance',INSTANCE,'--format=json']))
    dbs=json.loads(gc(['sql','databases','list','--instance',INSTANCE,'--format=json']))
    if len(users)!=1 or users[0].get('name')!='postgres' or users[0].get('type','BUILT_IN')!='BUILT_IN':raise RuntimeError('Unexpected user inventory')
    names=[d.get('name') for d in dbs]
    if 'postgres' not in names or any(n not in {'postgres','cloudsqladmin','template0','template1'} for n in names):raise RuntimeError('Unexpected database inventory')
    if not run(['psql','--version'],env=env).decode().startswith('psql (PostgreSQL) 16.'):raise RuntimeError('Expected psql16')
    # No password in argv/files/output. Child environment is scoped to psql only.
    password=gc(['secrets','versions','access','1','--secret',BOOT_SECRET]).decode()
    penv={**env,'PGPASSWORD':password,'PGCONNECT_TIMEOUT':'10','PGSSLMODE':'disable','PGOPTIONS':'-c statement_timeout=30000 -c lock_timeout=5000'}
    def sql(statement):
        return run(['psql','-X','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','55438','--username','postgres','--dbname','postgres'],statement.encode(),penv).decode().strip()
    def fresh():
        # SQL confirms actual listener is PG16/postgres and has no app DB/roles.
        value=json.loads(sql("SELECT json_build_object('db',current_database(),'user',current_user,'v',current_setting('server_version_num')::int,'roles',(SELECT count(*) FROM pg_roles WHERE rolname LIKE 'prospectpilot_stg_%'),'databases',(SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1','cloudsqladmin')));"))
        if value['db']!='postgres' or value['user']!='postgres' or not 160000<=value['v']<170000 or value['roles'] or value['databases']:raise RuntimeError('Nonfresh SQL target')
    fresh()
    first=secrets.token_urlsafe(48);second=secrets.token_urlsafe(48)
    phase='persist dedicated role secrets'
    # Existing names fail. Partial creation is retained for deliberate recovery.
    gc(['secrets','create',INIT_SECRET,'--replication-policy=automatic','--data-file=-'],first.encode())
    gc(['secrets','create',RUN_SECRET,'--replication-policy=automatic','--data-file=-'],second.encode())
    fresh()
    phase='create restricted SQL roles'
    create=lambda role,pw:'CREATE ROLE '+ident(role)+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '+literal(scram(pw))+';'
    sql('BEGIN;'+create(INIT_ROLE,first)+create(RUN_ROLE,second)+'COMMIT;')
    phase='create initializer-owned database with temporary initializer SET membership'
    create_owned_database(sql,INIT_ROLE,DATABASE)
    phase='verify role attributes and database ownership'
    attrs=json.loads(sql("SELECT json_agg(json_build_object('name',rolname,'unsafe',rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls,'memberships',(SELECT count(*) FROM pg_auth_members WHERE member=r.oid))) FROM pg_roles r WHERE rolname IN ("+literal(INIT_ROLE)+','+literal(RUN_ROLE)+");"))
    if len(attrs)!=2 or any(r['unsafe'] or r['memberships'] for r in attrs):raise RuntimeError('Unsafe created role')
    if sql('SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='+literal(DATABASE)+';')!=INIT_ROLE:raise RuntimeError('Wrong database owner')
    phase='verify both actual password logins'
    for role,pw in [(INIT_ROLE,first),(RUN_ROLE,second)]:
        result=run(['psql','-X','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','55438','--username',role,'--dbname',DATABASE],b'SELECT current_user;', {**penv,'PGPASSWORD':pw}).decode().strip()
        if result!=role:raise RuntimeError('Role login verification failed')
    # No migrations, grants, IAM, runtime deployment or fixture data here.

if __name__=='__main__':
    try:main()
    except Exception:
        print('Stopped during '+phase+'. Inspect isolated partial state before retry; credentials were not displayed.',file=sys.stderr)
        sys.exit(1)
