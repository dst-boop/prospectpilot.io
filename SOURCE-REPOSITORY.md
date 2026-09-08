# ProspectPilot source repository

Use this cloud-run folder as the root of a private repository. It contains the complete build inputs; the older sibling Sites checkout is no longer required. No GitHub repository has been created or connected.

Edit source/ for page and application logic, and patch-*.mjs for the existing Cloud Run adaptations. Run pnpm install --frozen-lockfile, pnpm build, then pnpm test. The generated/ files are deployable output and should be rebuilt whenever inputs change.

Use release.sh for an existing Google environment. Keep runtime credentials in Google Secret Manager; do not add .env files, provider exports, lead records, or deployment archives to Git. firebase-config.json contains public browser configuration, not a service-account key.

The source/ snapshot preserves the original application inputs. Updating the older Sites checkout does not automatically change this Cloud Run source.
