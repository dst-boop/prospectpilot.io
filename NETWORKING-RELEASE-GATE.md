# Networking rollout and rollback gate

This change closes two release blockers found in the combined PR97 review. It does not deploy anything, approve a rollback image, change IAM, or inspect production data.

## Production release is intentionally blocked

`scripts/release-rollback-policy.json` has an **empty** `floors` array. No immutable production-registry image and serving revision have yet been independently verified as the networking rollback floor. `release.sh` therefore stops during read-only preflight, before building, migrating, creating a candidate, changing jobs, or printing a rollback command.

The required upgrade rehearsal uses PR100 source candidate `402e079d7d31297bd56412d4c236bec18d98d130`. It does not test an arbitrary previously serving Cloud Run revision. Older deletion code can cascade away private captured aliases without first hashing them into tombstones. Merely retaining table 032 does not make that code safe, and rolling application code back does not restore aliases already lost.

The source rehearsal, a passing source CI run, an image label, and a local Docker image ID are not evidence that a particular production registry digest contains that code.

## Establish a rollback floor separately

Before opening the gate, a separately reviewed release plan must:

1. Verify the deployed application/worker revisions, live migration history, and backup/restore plan. Resolve other security findings before approving the candidate; PR100 is still a candidate, not automatic deployment approval.
2. Build the reviewed compatible application. Obtain its exact immutable Artifact Registry digest and verify build provenance to the reviewed source commit. Do not rely on a caller-supplied Git marker.
3. Extract the code from that exact registry image and run the pinned networking rollback contract `3ba8bdbe55105fc0b9c83e2e3307966aa6499109` on disposable PostgreSQL 16, using the candidate's own identity dependencies. Retain the native database result and image identity with the build/CI evidence. Review the full 029-to-032 upgrade and mixed-version application/worker plan for that candidate as well.
4. Install and verify the compatible floor in a separately authorized rollout **before** networking can write captures. Every reachable deletion target must be compatible. The routine gate requires the verified floor already serving 100%, and refuses other tagged revisions even if their ordinary traffic is 0%.
5. Review a repository change adding the exact `project`, `region`, `service`, `revision`, `image`, `sourceCommit`, `imageTestEvidence` and `buildProvenance` fields to the policy. Evidence links must be checked, not invented. The `image` must be the full registry digest, not a mutable tag or local image ID. `contractCommit` stays pinned to the reviewed contract unless that change is reviewed too.

The policy is a code-reviewed trust decision, not a cryptographic attestation service. The runtime gate verifies the live revision/digest against that reviewed decision; it does not claim that the presence of a URL proves the URL's content. There is no environment override, alternative policy path, or boolean “approved” bypass. The checked-in policy remains empty until the actual evidence exists. Synthetic test policy entries are created only in isolated temporary checkouts.

## Runtime drift gate

An image-only Cloud Run update inherits the newest template, which may not be the healthy serving revision. Before a build or migration, and again on the exact staged candidate, the release compares every environment entry, secret reference/version, secret-alias mapping, volume/mount, and process command/arguments against the known-good serving revision. Only the release marker and exact candidate-readiness origin may change. DB/auth/provider configuration changes require their own review; they are not silently bundled with an app release.

The comparisons happen in memory. No values, secret references or hashes are printed or copied into the redacted release state. A mismatch yields a generic failure. Explicit runtime identity, HTTP/1, immutable image, Cloud SQL attachment, health probes and named-revision checks still apply.

## Authenticated/database readiness before promotion

The candidate is deployed with a unique tag and 0% ordinary traffic. Its URL is derived from the known Cloud Run service URL and matched against the live tag's revision and URL. Only `GET /api/release/readiness` accepts that exact additional origin. The HTTP transport pins requests arriving on the candidate Host to that host and ignores X-Forwarded-Host there; ordinary routes and writes are rejected before dispatch. Existing process-health GET/HEAD remains available. Canonical/Firebase Hosting forwarding and APP_ORIGINS remain unchanged.

Readiness requires the existing verified, non-revoked Firebase owner session. It then performs a read-only query through the actual application database pool, checking the connected database name, all migration records 001–032, and the networking table. It returns only `ready`, `release_id` and `schema_version`, with no-store headers. Unauthorized sessions, wrong database, missing migrations/table and query failures fail closed without exposing configuration.

The release requires `RELEASE_SESSION_FILE` through a secure, separately authorized credential workflow. It must be a regular, non-symlink file **outside the checkout/build context**, contain only the session value without a newline, and have owner-only permissions on POSIX. Never paste the value into chat, command arguments, logs, a repository file or a build substitution. The verifier does not follow redirects, limits response size, and prints only generic results. Missing credentials stop before building; this task does not create or acquire them.

The authenticated query runs before updating research/catalog jobs and again immediately before promotion, after any long job work. Static `/health` remains only a process liveness check. The existing public-surface verifier still runs after promotion. Broader signed-in workflows, provider entitlement and production-scale checks remain separate.

## Rollback limits

The printed traffic rollback command exists only after the actual serving revision passes the immutable reviewed-floor gate. Never substitute an older service revision, source SHA, mutable image tag, or the baseline application. Keep schema 032 and all saved captures/tombstones. Do not reverse migrations or delete captures to make old code start.

Prior job images are diagnostic metadata, **not rollback-approved targets**. Changing a worker or migration job backwards needs its own compatibility review. The routine release is not atomic across jobs, schema and traffic. Serialize operators; the script rechecks observable traffic drift but cannot prevent another actor changing cloud configuration after the last check. Re-run read-only verification after propagation delays rather than rerunning deployment.

## Verification scope

Synthetic tests cover an empty or mismatched floor, source/local-image substitutes, unapproved traffic tags, newest-template and candidate DB/secret drift, readiness failure before job updates, readiness failure after job work, and exact pre-promotion ordering. Readiness endpoint tests cover auth, origin isolation, generic failures, real in-memory PostgreSQL-engine SQL, and credential-file handling. No test calls production or paid providers.

Actual registry provenance, the live compatible floor, a real owner session, real Cloud Run routing, and production database readiness remain unverified and cannot be inferred from local tests.

## Local verification for this fix

- Full suite before final candidate-transport hardening: 980 passed, 0 failed, 7 optional infrastructure checks skipped.
- Final affected release/readiness/transport/auth/packaging tests after the transport and final traffic-check changes: 64 passed, 0 failed, 0 skipped.
- Local build, Python tests (6), shell syntax and diff checks passed.
- Independent review found a candidate forwarded-host bypass; the scoped transport guard and regression tests close it. Native Cloud Run routing and actual registry/owner-session evidence remain untested.
