import unittest,importlib.util,hashlib,hmac,base64
from pathlib import Path
spec=importlib.util.spec_from_file_location('roles',Path(__file__).with_name('create-roles.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_no_attestation_no_subprocess(self):
  old=m.run;m.run=lambda *a,**k: self.fail('subprocess attempted')
  try:self.assertRaises(RuntimeError,m.main)
  finally:m.run=old
 def test_transport_guards(self):
  for k in ['HTTPS_PROXY','https_proxy','CLOUDSDK_API_ENDPOINT_OVERRIDES_SECRET_MANAGER','CLOUDSDK_PROXY_ADDRESS','PGHOST','PGSERVICE','REQUESTS_CA_BUNDLE']:
   with self.subTest(k=k):self.assertRaises(RuntimeError,m.transport_env,{k:'unsafe'})
 def test_identifiers(self):
  self.assertEqual(m.ident('prospectpilot_stg_init'),'"prospectpilot_stg_init"')
  for s in ['postgres','production','prospectpilot_stg_x;DROP']:self.assertRaises(RuntimeError,m.ident,s)
 def test_scram_roundtrip(self):
  pw='synthetic-not-real';salt=bytes(range(16));out=m.scram(pw,salt)
  mechanism,work,keys=out.split('$');self.assertEqual(mechanism,'SCRAM-SHA-256');rounds,s=work.split(':');stored,server=keys.split(':')
  salted=hashlib.pbkdf2_hmac('sha256',pw.encode(),base64.b64decode(s),int(rounds))
  self.assertEqual(base64.b64decode(stored),hashlib.sha256(hmac.new(salted,b'Client Key',hashlib.sha256).digest()).digest())
  self.assertEqual(base64.b64decode(server),hmac.new(salted,b'Server Key',hashlib.sha256).digest())
 def test_membership_cleanup_on_success_and_failure(self):
  for fail in [False,True]:
   calls=[];active=[False]
   def sql(q):
    calls.append(q)
    if q=='SELECT current_user;':return 'postgres'
    if q.startswith('SELECT COALESCE'):return '[{"grantor":"bootstrap","admin":true,"inherit":false,"set":false}]'
    if 'pg_has_role' in q:return 't' if active[0] else 'f'
    if q.startswith('GRANT'):active[0]=True
    if q.startswith('REVOKE'):active[0]=False
    if q.startswith('CREATE DATABASE') and fail:raise RuntimeError('synthetic failure')
    return ''
   if fail:self.assertRaises(RuntimeError,m.create_owned_database,sql,'prospectpilot_stg_init','prospectpilot_stg_app')
   else:m.create_owned_database(sql,'prospectpilot_stg_init','prospectpilot_stg_app')
   self.assertTrue(any('WITH SET TRUE, INHERIT FALSE GRANTED BY "postgres"' in q for q in calls))
   self.assertTrue(any(q.startswith('REVOKE') and 'GRANTED BY "postgres"' in q for q in calls))
   self.assertFalse(active[0])
if __name__=='__main__':unittest.main()
