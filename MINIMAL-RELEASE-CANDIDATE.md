# Minimal daily-priority release candidate

## Scope and source

This draft starts exactly at `b543fa4e52ee40f2e78a793733b9fbc3f6d29d50`, the source revision named by the serving release marker `simplify-b543fa4`. The marker is **not proof of image source provenance**. The live image's build provenance and the production migration ledger must be verified before this branch is considered deployable.

The PR targets the existing `codex/cloud-build-test-input` branch, which points to that exact baseline. It deliberately does not target `main`: doing so would obscure the independent minimal release with unrelated later history. Do not retarget or merge it into main as though it were a normal forward release.

Production changes are limited to:

- A compatibility port of daily-readiness commit `37d0f37ed35cb73e9b9664cff0118f55b81581d0`: due counts, contact/fit explanations, and held/scheduled next-task labels. Baseline sort, views, qualification, cadence, and existing APIs remain intact; the worklist response gains additive fields only.
- Release-guard commit `b25db8316a9678e2bbef0f9dcc472506d8973526`: separate builder/runtime identities, immutable candidate digest, explicit HTTP/1 and health probes, validated serving-revision rollback, and promotion guards. The `.dockerignore` context is adapted without pulling in the unrelated prospect-brief module.

The personal-event/brief dependency in the original daily-priority branch was intentionally removed. This candidate adds no module imports or package dependencies. `package.json`, the lockfile, Docker runtime assembly, migration registry, all migrations through 029, server routes, research worker, contact-deletion code, and firm-data paths remain the baseline versions. No migrations 030-032, networking capture, Autopilot code/activation, or firm snapshot/assignment changes are included.

## Safety boundaries

No deployment, production migration, live data mutation, secret access, IAM grant, provider request, schedule change, or outreach has been performed for this candidate.

`release.sh` remains an authorized-release command, **not a staging or review command**. It runs migrations, updates jobs, and promotes traffic after configuration checks. Do not run it to inspect this draft. Its explicit web identity is the existing `prospectpilot-runtime`; builder identity is used only for the image build. Existing validated job identities are retained. No broad permissions are granted.

The minimal branch preserves old contact-deletion behavior. It is **not** a safe rollback target after private networking captures have been created by migration 032-capable code. Older deletion can erase private captured aliases before tombstoning them. Before any use of this candidate, verify that such captures have never been activated, or use a separately reviewed capture-aware compatibility release. A missing networking UI is not proof that no captures exist.

There is no new schema change relative to the baseline. This does not establish that production already has every baseline migration; its actual migration ledger remains an independent release gate. Likewise, known baseline weaknesses are not claimed fixed by these two small ports.

## Verification

Candidate checks are recorded below only when actually run. All local records are synthetic, and cloud-shell regression tests use fake allowlisted `gcloud` commands.

- Production asset build passed with Node 24.22.1.
- Focused advisor/UI/release/verifier suite passed: 89 tests, zero failures or skips.
- Initial full local suite exposed three pre-existing date-dependent lead-cost failures. The test-only clock fix from `0635b0c6971e1c18239b50b3e4ea5f6006091281` pins fictional ledger rows to the fixture month. Application cost logic and real records are unchanged.
- Full local re-run passed: 609 tests, 607 passed, zero failures, two PostgreSQL-only skips (no local PostgreSQL endpoint).
- Six Python tests, four shell syntax checks, changed JavaScript syntax checks, and whitespace checks passed.
- Independent code review found no new blocker. Fresh synthetic desktop and 390x844 browser checks passed readiness disclosure, view changes, unmatched search, and brief open/close. Mobile document width was 375px within the 390px viewport. Browser error injection/race stress was not repeated; automated tests cover stale/error responses.
- The [draft PR](https://github.com/dst-boop/prospectpilot.io/pull/98) records the latest exact-head CI result. A passed local run is not a claim that CI or release gates have passed.
- Real PostgreSQL coverage is provided by the existing PostgreSQL 16 CI service. A new isolated-schema test checks daily summary ownership, view/page independence, expiry, and the absence of record writes. The existing review-serialization test is preserved.
- Docker image build, runtime CA trust-store check, and frozen-lockfile installation run in CI, not on this desktop (Docker is unavailable locally).
- Real Firebase login, authenticated isolated staging, production schema/provenance, and production rollout are unverified.

Generated asset rebuilding on this Windows checkout changed only escaped CRLF/LF sequences in `generated/worker.mjs`; a normalized comparison proved no content change. That unrelated generated-file churn is not included in the candidate.
