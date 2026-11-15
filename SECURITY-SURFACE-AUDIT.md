# Security surface review, 2026-11-15

This is a focused source/dependency review against main `148b07c`, not a claim that
all security issues have been found. No production service, database, provider
account, or deployment configuration was changed or attacked during this review.

## Verified findings and changes

1. **Legacy crawler network boundary.** `fetchPublicPage` checked the spelling of
   URLs and redirect destinations but then used an unrestricted `fetch`. A
   public-looking domain could resolve to a private address. It now uses the same
   resolver-pinned public IPv4 transport as native research for every hop. The
   existing request deadline, one-megabyte response limit, crawler User-Agent,
   Accept header, and missing-robots response behavior remain in effect.
   The legacy route is owner-only, but its public source URLs can still come from
   untrusted websites. This is source-level verification, not evidence of live
   exploitation or successful access to a private service.
2. **Legacy CSV exports.** Spreadsheet formula prefixes preceded by whitespace
   were not neutralized. Salesforce and ZoomInfo candidate exports now apply the
   whitespace-aware escaping already used by the modern workspace. This reduces
   spreadsheet injection risk when an operator opens an exported file; no
   spreadsheet execution was attempted.
3. **Legacy exception logging.** The worker logged entire error objects, whose
   messages/details can include database rows or provider information. It now
   logs a fixed event name and a validated error code. A synthetic error test
   verifies that the message, row details, credentials, and stack are absent.
4. **Dependency advisories.** The original frozen lockfile audit reported 5 high,
   4 moderate, and 3 low findings. Firebase was updated within major version 12
   (12.18.0 to 12.19.0), Firebase Admin within major version 14 (14.3.0 to 14.5.1),
   and remaining vulnerable gRPC, RE2JS, and XML-parser resolutions were pinned
   to patched versions. The resulting full dependency audit reports zero known
   advisories. Several original findings were in unused Firestore/Storage
   dependency paths; their presence did not establish an exploitable app route.

The transitive overrides document their upstream advisories in
`pnpm-workspace.yaml`. Remove each override only after the ordinary upstream
resolution is patched and a fresh frozen install, build, tests, and audit pass.
Relevant upstream advisories:
- https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j
- https://github.com/advisories/GHSA-f596-whhp-79r4
- https://github.com/advisories/GHSA-gg6h-894w-4m9c
- https://github.com/advisories/GHSA-474x-hrwr-fgx4

## Verification

- Frozen install with the repository's pinned pnpm 11.19.0.
- `node build.mjs`, including regeneration of the committed login/worker assets.
- 22 focused security, redirect, native-research, research-route, and
  image-manifest tests.
- Full Node suite: 1,026 passed, zero failed, nine native-PostgreSQL tests
  skipped because no isolated PostgreSQL URL is configured.
- Six Python standard-library tests and syntax checks for the four release/setup
  shell scripts.
- Firebase Admin app/auth import and initialization smoke check without a
  credential lookup or remote authentication request.
- `pnpm audit --json`: zero advisories after the update.
- `git diff --check`.

The first default-concurrency Node run was interrupted after subprocess
failures appeared while multiple workers were running full suites. A subsequent
low-concurrency run passed 1,024 tests, skipped nine native-PostgreSQL tests, and
found one outdated global-fetch fixture. That fixture now injects the bounded
public-source transport; the final complete rerun uses
`node --test --test-concurrency=2 test/*.test.mjs` to limit memory pressure.

Docker and native PostgreSQL tooling are unavailable in this executor. The
repository's CI remains responsible for the production-image build and native
PostgreSQL smoke/upgrade gates. PGlite tests are not a substitute for those gates.
No paid provider calls or recorded enrichment resets were performed.
