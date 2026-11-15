# Integrated advisor workflow verification

Date: November 15, 2026. Local desktop verification only. No remote push or deployment.

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
