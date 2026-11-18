import unittest,importlib.util,json,os
from pathlib import Path
HERE=Path(__file__).parent;p=HERE/'apply-split-grants.py';spec=importlib.util.spec_from_file_location('grant',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_missing_attestation_stops(self):
  original=m.m.run;m.m.run=lambda *a,**k:self.fail('subprocess attempted')
  try:self.assertRaises(RuntimeError,m.main)
  finally:m.m.run=original
 def test_exact_ledger(self):
  good=[f'{n:03d}' for n in range(1,35)];self.assertTrue(m.exact_ledger(good));self.assertFalse(m.exact_ledger(good[1:]));self.assertFalse(m.exact_ledger(good+['035']));self.assertFalse(m.exact_ledger(list(reversed(good))))
 def test_nonsecret_initializer_config(self):
  c=json.loads((HERE/'initialize-env.json').read_text());self.assertNotIn('PGPASSWORD',c);self.assertEqual(c['PGUSER'],'prospectpilot_stg_init');self.assertEqual(c['STAGING_OWNER_UID'],m.UID);self.assertEqual(c['STAGING_EXPIRES_AT'],m.EXPIRY);self.assertEqual(c['STAGING_INITIALIZE_EMPTY_DATABASE'],'prospectpilot_stg_app');self.assertEqual(c['STAGING_ORIGIN'],'https://prospectpilot-stg-app-889507481125.us-central1.run.app')
 def test_separate_owners_and_no_secret_creation(self):
  s=p.read_text();self.assertIn("bootstrap('BEGIN;'+generated['database']+'COMMIT;')",s);self.assertIn("initializer('BEGIN;'+generated['tables']+'COMMIT;')",s);self.assertNotIn("'secrets','create'",s);self.assertNotIn('GRANTED BY',s);self.assertIn("'secrets','versions','access','1'",s)
 def test_narrow_job_doc(self):
  s=(HERE/'INITIALIZE-AND-GRANTS.md').read_text();self.assertIn('--tasks 1 --parallelism 1 --max-retries 0',s);self.assertIn('scripts/staging-initialize.mjs',s);self.assertNotIn('--allow-unauthenticated',s);self.assertIn('gcloud secrets add-iam-policy-binding prospectpilot-stg-initializer-password',s)
if __name__=='__main__':unittest.main()
