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
