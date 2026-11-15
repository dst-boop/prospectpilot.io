# Cloud Run release guardrails

Prepared locally on 15 November 2026. This change has not been deployed and has not changed cloud IAM, traffic, secrets, or schedules.

## Incident evidence and repository defect

A read-only Cloud Run audit reported revision `prospectpilot-00039-qpl` (created 15 November at 04:26:22 UTC) at 0% traffic, using `prospectpilot-builder` as the runtime identity and failing to read its existing secret references. Its template also enabled HTTP/2. Revision `prospectpilot-00038-h4b` remained at 100% traffic; it and `00037-fts` used `prospectpilot-runtime`, HTTP/1, and the same image. No secret values were read.

The repository release script did not originate an explicit HTTP/2 or builder-runtime setting. Its defect was preserving whatever the newest service template contained: an image-only update could carry the broken settings forward. It also printed the newest template image as the rollback target, even when that template was not serving, and routinely invoked a provisioning script that reapplied job IAM and scheduler configuration.

## Networking release blocker

The combined release now includes migration 032. [Networking rollout/rollback requirements](NETWORKING-RELEASE-GATE.md) supersede any assumption below that the last serving revision is automatically safe. The checked-in immutable rollback-floor policy is empty, so release stops in read-only preflight. PR100 source tests/local image IDs do not approve a production registry image. A separately verified compatible floor and private owner-session readiness input are required.

## Current release contract

Prerequisites: an authenticated Google Cloud CLI with the current service-update flags, Bash, and Node.js 24. Prefer the existing authenticated Cloud Shell release environment. The local regression tests require Bash (Git Bash on Windows).

Run `bash release.sh` only as an authorized production release, from the reviewed commit. The script is not a read-only check. It builds an image, applies migrations, creates a candidate revision, updates jobs, and then promotes the candidate. For read-only public verification, use `node scripts/verify-release.mjs https://prospectpilot.io EXPECTED_RELEASE_ID --health-required` instead.

The routine release now:

1. Reads the actual serving revision and existing migration/research jobs. Refuses a rollout still reconciling, split traffic, a missing job, or a builder/default/cross-project job identity. A failed latest revision is allowed only while the actual 100%-serving revision is Ready.
2. Verifies that the serving revision/digest matches the repository-reviewed networking rollback floor, refuses other reachable tagged revisions, and compares the newest template runtime environment/secret configuration with the serving revision. Only then prints a rollback command and prior images. Full configuration snapshots stay in a private temporary directory and are deleted on exit; only safe metadata is printed.
3. Builds using `prospectpilot-builder` and the existing Docker test gate, then resolves the published tag to an immutable digest.
4. Executes the existing migration job under its validated identity. Migrations must remain backward compatible with the old serving app and worker.
5. Stages a named candidate with no ordinary traffic, explicitly using `prospectpilot-runtime`, HTTP/1 on port 8080, the serving revision's Cloud SQL connection, and HTTP `/health` startup/liveness checks. Deployment health checks are explicitly enabled.
6. Inspects the exact candidate for Ready status, identity, immutable image, protocol, port, Cloud SQL attachment, health probes, release marker, and exact runtime environment/secret parity. Verifies its traffic tag and performs an owner-authenticated, read-only database/migration readiness check. A failure cannot reach worker updates or traffic promotion.
7. Updates only the image and explicit existing identity of the research job. Provider secrets, budgets, connection settings and scheduler configuration are retained. Optional `REFRESH_PLAN_CATALOG=1` requires an existing catalog job and updates/executes it without provisioning or scheduler changes.
8. Rechecks that the prior traffic, tags and newest revision have not changed, repeats owner-authenticated database readiness, then promotes this exact revision, never `LATEST`.
9. Runs the existing full public-surface verifier: required health, expected feature and release markers, no-store headers, login/public pages, unauthenticated API protection, and cross-origin refusal. Failure exits nonzero rather than claiming completion.

`PUBLIC_BASE` defaults to `https://prospectpilot.io`. `PROJECT` and `REGION` retain their existing defaults. For another deployment, all named resources and the two dedicated identities must already exist there.

## Identity separation and permissions

- **Builder:** builds, writes the image, and writes build logs. It is never the web-service or job runtime identity. Do not grant it access to application secrets as a workaround for a bad revision.
- **Web runtime:** `prospectpilot-runtime` uses its existing application permissions, including only the needed secrets, Cloud SQL connection, Firebase operations and job invocation. This patch grants none.
- **Job runtimes:** reuse each existing job's dedicated, non-builder identity explicitly. The migration account may legitimately differ from the web/worker account; do not collapse them to the builder or broaden privileges to make deployment pass.
- **Deployer:** uses already approved build/deploy permissions and permission to act as the specific identities involved. A missing permission stops the release and requires a separately reviewed fix.

The standalone setup scripts remain provisioning tools. They are no longer called by routine release. Review their target identities, IAM bindings and schedule changes separately before using them. There are no permission grants, API enablement commands, schedule mutations, access-policy changes, or secret changes in the routine release path.

## Rollback and limits

The script prints a traffic rollback command only when the previous **serving revision** is the verified immutable networking rollback floor. The policy currently contains no such revision, so no command is printed. Rolling traffic back reuses that immutable revision's identity and protocol, unlike rebuilding an old image on a broken newest template. It does not undo database migrations or restore job images. Prior job images are diagnostic only, not approved rollback targets. If job updates completed before a failure, separately review compatibility before restoring any job image. Do not reverse migrations automatically or retry paid work.

The release is not a transaction across Cloud Run, Cloud SQL and jobs. An operator must serialize releases; before-promotion checks detect observed competing deployments but cannot provide a cloud-wide lock. Migration and worker compatibility remain review gates.

`/health` proves that the HTTP process started. It does not establish database readiness, paid-provider credentials, authorization correctness for a signed-in user, or end-to-end research success. Public verification runs **after** promotion and does not automatically roll back a failing release. Traffic propagation is not instantaneous, so an immediate public check may temporarily still reach the old revision. Re-run the read-only verifier to distinguish propagation from a real failure; do not repeat the deployment just to check it. Inspect the failure and use the printed rollback command if warranted. The new owner-authenticated/database readiness gate runs before promotion; broader signed-in workflow checks and monitoring remain necessary.

## Verification

`test/release-config.test.mjs` tests validators and runs the real shell against local, allowlisted fake `gcloud` commands. It covers happy-path ordering, immutable images, identity separation, HTTP/1/probes, catalog reuse, missing jobs, invalid identities, build/migration/startup failures, drift, concurrent traffic changes and failed public verification. Tests do not call Google Cloud or production.

The script and ignore file are explicitly retained in both upload and Docker build contexts so these regressions also run during image builds. Existing health/authentication and public release verification tests remain unchanged.

## Local validation on 15 November 2026

- `node build.mjs` passed.
- Full Node suite before the final test-only coverage additions: 624 passed, 0 failed, 1 existing PostgreSQL-only concurrency test skipped without `POSTGRES_TEST_URL`.
- Focused release-validator/verifier suites after final failure-path additions: 27 passed, 0 failed.
- Python unit tests: 6 passed. All four release/setup shell files passed `bash -n`; `git diff --check` passed.
- Docker is not installed locally. The image build, real Cloud Run rollout, live IAM permission behavior and signed-in production workflow were not executed in this change.

## Primary documentation checked

- [Cloud Run service update flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/update)
- [Cloud Run service identity](https://docs.cloud.google.com/run/docs/configuring/services/service-identity)
- [Cloud Run health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [Cloud Run rollouts and rollback](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Artifact Registry image description](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/docker/images/describe)
