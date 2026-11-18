"""Disposable localhost PG16 rehearsal only. No gcloud or cloud connections."""
import os,sys,re,secrets,json,subprocess,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('roles',Path(__file__).with_name('create-roles.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def main():
 if sys.argv[1:]!=['--synthetic-postgres']:raise RuntimeError('Explicit synthetic flag required')
 if any(v for k,v in os.environ.items() if k.upper().startswith('PG')):raise RuntimeError('Inherited PG environment forbidden')
 suffix=secrets.token_hex(6);operator='prospectpilot_stg_operator_'+suffix;initializer='prospectpilot_stg_init_'+suffix;runtime='prospectpilot_stg_runtime_'+suffix;failed_init='prospectpilot_stg_fail_'+suffix;db='prospectpilot_stg_'+suffix
 password=secrets.token_urlsafe(32);created=False
 def connection(user,pw,database):
  def sql(statement):
   return m.run(['psql','-X','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--host','127.0.0.1','--port','55439','--username',user,'--dbname',database],statement.encode(),{**os.environ,'PGPASSWORD':pw,'PGCONNECT_TIMEOUT':'5','PGSSLMODE':'disable','PGOPTIONS':'-c statement_timeout=30000 -c lock_timeout=5000'}).decode().strip()
  return sql
 root=connection('postgres','synthetic-ci-only','prospectpilot_test')
 version=int(root("SELECT current_setting('server_version_num');"))
 if not 160000<=version<170000 or root('SELECT current_database();')!='prospectpilot_test' or root("SELECT rolsuper FROM pg_roles WHERE rolname=current_user;")!='t':raise RuntimeError('Wrong disposable fixture')
 try:
  root('CREATE ROLE '+m.ident(operator)+' LOGIN NOSUPERUSER CREATEDB CREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '+m.literal(m.scram(password))+';');created=True
  op=connection(operator,password,'prospectpilot_test')
  if op("SELECT rolsuper FROM pg_roles WHERE rolname=current_user;")!='f':raise RuntimeError('Operator must not be superuser')
  if op('SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user);')!='0':raise RuntimeError('Operator must have no memberships')
  create=lambda r:'CREATE ROLE '+m.ident(r)+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '+m.literal(m.scram(password))+';'
  op('BEGIN;'+create(initializer)+create(runtime)+'COMMIT;')
  before=m.membership_snapshot(op,initializer)
  if not before or not any(r['admin'] for r in before) or any(r['set'] or r['inherit'] for r in before):raise RuntimeError('Expected PG16 automatic ADMIN-only baseline')
  m.create_owned_database(op,initializer,db)
  if m.membership_snapshot(op,initializer)!=before:raise RuntimeError('Success baseline not restored')
  if root('SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='+m.literal(db)+';')!=initializer:raise RuntimeError('Wrong owner')
  for role in [initializer,runtime]:
   if connection(role,password,db)('SELECT current_user;')!=role:raise RuntimeError('SCRAM login failed')
   if root('SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='+m.literal(role)+');')!='0':raise RuntimeError('Role inherited access')
  # A second freshly-created initializer proves cleanup after CREATE DATABASE fails.
  op(create(failed_init));failed_before=m.membership_snapshot(op,failed_init);failed=False
  attempted=[0]
  def fail_sql(statement):
   if statement.startswith('CREATE DATABASE'):attempted[0]+=1
   return op(statement)
  try:m.create_owned_database(fail_sql,failed_init,db)
  except RuntimeError:failed=True
  if not failed or attempted[0]!=1:raise RuntimeError('Failure must reach duplicate CREATE DATABASE, not an earlier guard')
  if m.membership_snapshot(op,failed_init)!=failed_before:raise RuntimeError('Failure baseline not restored')
  for role in [initializer,failed_init]:
   if op("SELECT pg_has_role(current_user,"+m.literal(role)+",'SET');")!='f':raise RuntimeError('Effective SET leaked')
  print(json.dumps({'verified':True,'proof':'pg16-nonsuperuser-v1','operator_superuser':False,'scram_logins':True,'temporary_set_cleanup_success_and_failure':True,'cloud_actions':False}))
 finally:
  if created:
   root('DROP DATABASE IF EXISTS '+m.ident(db)+' WITH (FORCE);')
   for role in [failed_init,runtime,initializer,operator]:root('DROP ROLE IF EXISTS '+m.ident(role)+';')
if __name__=='__main__':
 try:main()
 except Exception:
  print('Disposable non-superuser rehearsal failed. Inspect only synthetic fixture; no credentials displayed.',file=sys.stderr);sys.exit(1)
