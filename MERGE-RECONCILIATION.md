# November 2026 merge reconciliation

The original reconciliation began at main `148b07c936c27a060cc1301044829e9fe264ac57`. This refreshed PR preserves the production code, dependencies and release policy from main `2d75aca4245d141dd4386e0815f59d23ad100665`, which includes security hardening from PR #108 and the privacy regression gate from PR #99. It only carries additional regression coverage from the isolated baseline candidates into the current application.

## Superseded integration pull requests

- PR #103 proposes merging `codex/cloud-build-test-input` into main. Its daily-priority and original release-guard production changes are already present in main, which also has later UID ownership protections, networking rollback gates, and advisor workflow changes. The isolated candidate at `ba127171b40a95b2213a4aab5f7b4d82d00a7ca7` is retained as historical source, not rebased or replaced. The candidate remains unapproved for deployment or security-safe rollback. Its additional shared PGlite/PostgreSQL daily-summary regression is carried here.
- PR #105 proposes merging `codex/ownership-baseline-b543fa4` into main. Its ownership fix is already present in main from `c50d17b`; its baseline-specific adaptations intentionally omit later main features. The candidate at `4c3f7bc78b64470b55b592289716eb3f7bb26b68` is retained. Its native PostgreSQL test adapter is carried here while retaining current main's pipeline assertions.

Closing these superseded integration PRs does not delete their branches, change the candidate commits, merge them, or approve their use in production. Their original release constraints still apply.

## Separate privacy work

PR #99 has been merged into main, retaining the 031-to-032 privacy regression contract and its separate CI gate. PR #100 is preserved as draft PR #106 against a dedicated frozen `b543fa4` baseline because GitHub prevents retargeting stacked PRs. The candidate SHA and original branch remain unchanged. This old candidate still lacks the later UID ownership fix and is not an approved rollback floor. Neither the historical candidate nor passing source tests establish serving image provenance or authorize deployment. The existing main release gates and full 029-to-032 upgrade rehearsal remain unchanged.

## Verification scope

Run `pnpm build`, `pnpm test`, the Python tests and shell syntax checks. Native PostgreSQL coverage runs when `POSTGRES_TEST_URL` is explicitly supplied; local PGlite coverage is not a substitute for that CI result. No production database, provider, migration, release script, or traffic operation is part of this reconciliation.
