import unittest,importlib.util
from pathlib import Path
p=Path(__file__).with_name('recover-split-owner.py');spec=importlib.util.spec_from_file_location('recovery',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_missing_attestation_stops_before_subprocess(self):
  original=m.m.run;m.m.run=lambda *a,**k:self.fail('subprocess attempted')
  try:self.assertRaises(RuntimeError,m.main)
  finally:m.m.run=original
 def test_setup_uses_object_privileges_only(self):
  statements=[];m.setup_database(lambda q:statements.append(('admin',q)),lambda q:statements.append(('schema',q)))
  self.assertEqual(len(statements),3)
  self.assertIn('OWNER postgres',statements[0][1])
  self.assertIn('GRANT CONNECT ON DATABASE',statements[1][1])
  self.assertIn('GRANT USAGE,CREATE ON SCHEMA public',statements[2][1])
  text='\n'.join(q for _,q in statements)
  self.assertNotIn('GRANT CREATE ON DATABASE',text)
  self.assertNotIn('GRANTED BY',text)
  self.assertNotIn('ALTER ROLE',text)
  self.assertNotIn('CREATE ROLE',text)
  self.assertNotIn('prospectpilot_stg_runtime',text)
 def test_existing_secret_only_static_boundary(self):
  source=p.read_text()
  self.assertNotIn("'secrets','create'",source)
  self.assertNotIn('token_urlsafe',source)
  self.assertIn("'secrets','versions','access','1'",source)
  self.assertIn("'STAGING_SPLIT_OWNER_PROOF'",source)
 def test_setup_failure_does_not_drop_or_retry(self):
  statements=[]
  def admin(q):
   statements.append(q)
   if q.startswith('REVOKE'):raise RuntimeError('synthetic')
  self.assertRaises(RuntimeError,m.setup_database,admin,lambda q:self.fail('schema write after failure'))
  self.assertEqual(len(statements),2)
  self.assertFalse(any('DROP' in q for q in statements))
if __name__=='__main__':unittest.main()
