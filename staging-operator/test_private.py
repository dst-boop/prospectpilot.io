import unittest,json
from pathlib import Path
ROOT=Path(__file__).parent
class Tests(unittest.TestCase):
 def test_runtime_config(self):
  c=json.loads((ROOT/'runtime-env.json').read_text());self.assertEqual(c['PGUSER'],'prospectpilot_stg_runtime');self.assertNotIn('PGPASSWORD',c);self.assertNotIn('STAGING_INITIALIZE_EMPTY_DATABASE',c);self.assertEqual(c['STAGING_EXPIRES_AT'],'2026-11-25T00:00:00.000Z');self.assertEqual(c['STAGING_OWNER_UID'],'WVxUh1LmGvWKYnRxjBYM0VbwGZX2');self.assertEqual(c['STAGING_ORIGIN'],'https://prospectpilot-stg-app-889507481125.us-central1.run.app')
 def test_private_entry_and_limits(self):
  d=(ROOT/'PRIVATE-DEPLOY.md').read_text();self.assertIn('--args scripts/staging-start.mjs',d);self.assertIn('--no-allow-unauthenticated',d);self.assertNotIn(' --allow-unauthenticated',d);self.assertIn('--min-instances 0 --max-instances 1 --concurrency 8',d);self.assertIn('--timeout 60s',d);self.assertIn('--set-secrets PGPASSWORD=prospectpilot-stg-runtime-password:1',d);self.assertIn('e65664c2d0bd88f6f470b02867e71305f3885c9740b7940c4a5607ace4c60359',d)
 def test_preserves_evidence_and_no_secret_delete(self):
  d=(ROOT/'PRIVATE-DEPLOY.md').read_text();self.assertNotIn('gcloud secrets delete',d);self.assertNotIn('gcloud run jobs delete',d);self.assertIn('Retain secret versions, DB roles, job definition and execution evidence',d)
if __name__=='__main__':unittest.main()
