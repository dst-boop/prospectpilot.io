# Integrated advisor workflow verification

Date: November 15, 2026. Verification history, with later increments recorded below. Earlier sections describe their original verification state. The current work is a non-production draft PR; no deployment or live migration has occurred.

## Integration

- Branch: `codex/advisor-product-integration`.
- Base: `origin/main` at `8ac1176` (includes the licensed Research Lab search allowance update).
- Reassignment preview: `0f1eecf63b6a3186d1fd368beca61dc0f6cba8b9`, including planner commit `2064512`.
- Daily priorities: `37d0f37ed35cb73e9b9664cff0118f55b81581d0`.
- Integrated code commit: `6ae360763fef3e1f54d65ba81f79690b825a36e8`.
- Both merges were conflict-free. The `server.mjs` merge preserves the allowance adapter and adds the fail-closed team hub. The `lab.html` merge retains the licensed-search notice and adds the daily summary nodes.
- Original feature branches and worktrees were preserved. The dependency lockfile is unchanged; verification reused the existing local dependencies through a junction.

## Passed

- Production asset build: `node build.mjs`.
- Full Node suite: `node --test --test-concurrency=4 test/*.test.mjs`: 709 tests, 708 passed, zero failed, one skipped. Runtime: 156.4 seconds.
- Six Python tests: `python -m unittest discover -s test -p 'test_*.py'` using the installed bundled Python interpreter.
- All 156 tracked JavaScript/module files passed `node --check`.
- Shell syntax: `release.sh`, `setup-plan-catalog.sh`, `setup-plan-catalog-schedule.sh`, `setup-research-worker.sh`.
- `git diff --check`.
- Independent read-only review of integrated changes: no actionable findings. 130 focused tests passed covering authorization, isolation, reassignment planner/client behavior, login destination, worklist and client summaries. No duplicate HTML IDs found.

The repository does not define separate lint or type-check scripts. npm is not on the selected desktop PATH, so the exact package build/test programs were invoked with Node.

## Browser checks

Chrome used `scripts/demo.mjs` on loopback port 8111 with fictional advisors and contacts, an in-memory PGlite database, and synthetic provider adapters. No production data or provider requests were used.

- Daily summary, current checked time and scope disclaimer rendered.
- Reviewed contact route, missing contact review, remaining fit checks and identity hold disclosures appeared separately.
- Next-prospect brief opened and closed, returning focus to the worklist.
- Team hub disabled the unverified recipient and same-advisor pair.
- Preview showed all ten inventory counts, exact IDs, identity collisions, preservation requirements and explicit blockers.
- Closing and reopening worked; advisor changes cleared the old preview; reversed advisors returned the corresponding inventory counts.
- Back/Forward returned a fresh directory without resurrecting a prior preview.
- Worklist and hub fit a 390-pixel viewport without horizontal overflow. Temporary viewport overrides were reset.
- No browser console warning/error entries were observed.
- Cancellation and delayed-response behavior passed the automated client suite. The live fixture completed too quickly to exercise cancellation manually; that manual action was not counted as a pass.

Local evidence in ignored `.tmp/`: `integration-full-tests.log`, `integration-worklist-desktop.jpg`, `integration-worklist-mobile.jpg`.

## Limits and release boundary

- Real PostgreSQL integration is the existing skip because `POSTGRES_TEST_URL` is not configured.
- Docker image build was not run because Docker is unavailable.
- Real Firebase/staging supervisor journeys, remote CI, deployment and any actual transfer were not run.
- The team hub remains preview-only. Production returns 503 until authoritative firm membership, roster, account and complete snapshot adapters are configured. No ownership mutation or revocation path exists.
- No new migration is required for these two features. The latest migration remains 031; the concurrent networking increment is reserving 032 separately and is not included here.
- No paid providers, real contacts, account revocation, outreach, public push or production changes occurred.

## Firm-scoped metadata integration (November 15, 2026)

Merged `68c2eb0daa655299c12075846e9235d729a6a7d0` and its dependency `5357cc985e07c292385c2d0480e512d9a34e0dec` without conflicts. The merged code is `483f5dae6437950e23a40539c2d937abf85d8aeb`; both source branches remain intact.

- Full integrated Node suite: 793 tests, 790 passed, zero failures, three explicit PostgreSQL skips; 146.4 seconds. Log: `.tmp/integration-snapshot-full-tests.log`.
- Production asset build, all 161 JavaScript/module syntax checks, six Python tests, four shell syntax checks and Git whitespace checks passed.
- Independent merged-code review found no actionable integration, authentication or packaging findings. Its focused suite ran 195 tests: 193 passed, zero failed, two PostgreSQL concurrency skips.
- `server.mjs`, `handler.mjs`, `migrate.mjs`, the Docker runtime copy list and all browser assets are unchanged from the prior browser-tested integration. No new browser flow was introduced or claimed tested in this increment.
- The draft schema is not registered in migrations; migration 032 remains reserved for the separate networking work. The new modules and draft schema reach build-time tests only and are not copied to the runtime image.
- The new loader returns bounded explicitly assigned metadata with `inventory_complete: true`, but always `complete: false` and `can_execute: false`. The legacy whole-account planner rejects it. This preserves honest limits for private duplicate coverage, unsupported work/provenance/privacy stores, provider rights and serviced-account continuity.
- Production remains inactive and fail-closed. No backfill, account change, real-data query, ownership transfer, push or deployment occurred.
- Real PostgreSQL concurrency, Docker image execution and real Firebase/staging integration remain unverified. All three skips require the explicitly configured `POSTGRES_TEST_URL`; no production database setting was used as a fallback.

## Release guardrails and networking integration (November 15, 2026)

The previous guardrails integration at `812a3b1e16fe83cedd8db6ebe80ebf548994ba33` passed exact-head CI: 806 tests, zero skips, all three disposable PostgreSQL checks, Docker build and runtime HTTPS trust-store verification. Run: https://github.com/dst-boop/prospectpilot.io/actions/runs/43689369683.

Networking source commit `4dcbf45bd49a7b3238ea372885f5afdf1e0597bd` is now integrated locally. The merge preserves main's Research Lab allowance, preview-only Team Lead Hub, release guardrails, both allowed login destinations, and all Docker assets. Current main remains `8ac1176be3c76037af659b395c5b62153babafd4`. Source branches remain unchanged.

- Migration 032 is now included and registered for the private networking ledger. It has run only on disposable synthetic test databases, not a live database. The firm-boundary schema remains an unregistered draft.
- Independent integration review found and closed two cross-feature privacy gaps: source-assigned private captures now refuse the scoped snapshot through existence-only checks, and deletion hashes captured-only normalized identities for their owner before the private ledger cascades away. Neither fix exposes or merges private context into shared contacts.
- Final local full Node suite: 822 tests, 819 passed, zero failures, three explicit PostgreSQL skips; 169.5 seconds. Log: `.tmp/integration-networking-final-tests.log`.
- Production asset build, 167 JavaScript/module syntax checks, six Python tests, four shell syntax checks and Git whitespace checks passed.
- Independent post-fix review: 65/65 focused tests passed, the original deletion reproduction is now blocked, and no remaining actionable findings were identified in the reviewed auth/privacy/migration/packaging scope.
- Fresh Chrome checks on the loopback-only synthetic demo passed inline Clear/Keep editing/Escape, confirmed Clear with focus recovery, initial save, matching referral, literal-text notes, Contacts, Back/Forward, and Cancel with an empty form. Two private captures mapped to one contact. No console warnings/errors were observed. Evidence: `.tmp/integration-networking-desktop.png`.
- The native unsaved-navigation warning, mobile networking layout and real Firebase/staging journeys were not newly tested in this increment. Earlier worklist/hub mobile evidence remains historical, not a networking mobile claim.
- Production team preview remains disabled/fail-closed, metadata snapshots remain incomplete, and there is still no authorized transfer or production activation. No provider call, outreach, deployment or live migration occurred.
- The next gate is exact-head GitHub CI on draft PR #97 using disposable PostgreSQL 16, Docker and runtime trust-store checks. Local skips are not claimed as PostgreSQL passes. The PR must remain draft and unmerged.
