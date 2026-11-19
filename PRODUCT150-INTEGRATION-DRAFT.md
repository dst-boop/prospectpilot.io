# Product150 local integration draft: not release approval

Pinned fresh main: `8b9cb55e77b15ad6316ef9c34df2fd1a2deee06c`, tree `a02862bf02c1891f205d331bf43e1a75928b44bb`.
Pinned reviewed PR150: `622786fc243e902a94f91801090f040fd924f399`, tree `222c2da97aa6a6e506dce8e4880abbd21fb45048`; local source-equivalent `124e71e5aef484acc18071d7ea6a35a4b2024e92`.

This isolated local integration applies the pinned150 tree to current main without merging its branch ancestry. No post150 staging, authentication, fictional fixtures, tester bindings, guide/provenance follow-ups or operator code are included. Existing #146 non-executable preflight files remain byte-identical: `firm-scoped-snapshot.mjs`, `test/firm-scoped-snapshot.test.mjs`, `design/team-identity-preflight.md`. Existing daily-leads files are unchanged. No PRF, firm settings, queue policy or permissions work is undertaken here.

## Selection/classification
- Product runtime: reviewed audience/search/download/size UI; planning policy/schema033; DNC replay and deletion privacy; historical identity/schema034, keyring and legacy-write guards; sponsor ambiguity/ranking/location; WARN recovery; current Lab/Contacts; release readiness and read-only fallback. Keep these dependencies together.
- Opt-in rollback runtime: `rollback-{bootstrap,schema,server,worker}.mjs` plus exact `scripts/rollback-schema034.json`. These remain outside the default production target. They are safety mechanisms, not disposable test scaffolding.
- CI-only evidence: initial034 and pinned historical upgrade rehearsals, browser scripts, runtime verification scripts and synthetic network guard. Their source/tests remain available and existing CI gates are preserved, but they are no longer copied wholesale into normal runtime.
- Historical rollout/rehearsal documents describe their pinned experiments, not approval for this new candidate or its fallback.

## Packaging change and proof contract
Normal runtime explicitly copies existing operational scripts only: plan catalog download/prepare/import/refresh, contact benchmark utilities, release configuration/policy/readiness/verification helpers, and unchanged daily-leads/lead-costs/pricing directories. No demo, staged auth, browser or synthetic proof scripts are in normal runtime. The rollback schema manifest is copied only into the opt-in rollback target.

Separate `runtime-proof` and `rollback-proof` children add only named synthetic verifier scripts. The last/default Docker target remains `production`, inheriting normal runtime, not a proof child. CI pins immutable image IDs and compares **full exported filesystems**, not merely `/app`: regular-file hashes, entry types, modes, owner IDs and link targets. No path exclusions. Every parent entry must remain identical; only exact regular proof-file additions with source-matching hashes are allowed. Application image configuration must match, volumes are refused, and RootFS must be the original parent layers plus exactly one proof layer. Export uses never-started, network-none containers with cleanup. Proof-child verifications are labeled production-derived, not the exact original image digest.

## Gates and limits
New source/unit checks do not establish that Docker export/build/native execution works. This environment has no Docker/PostgreSQL binaries. Fresh exact-image execution, all retained native/browser/recovery gates, runtime packaging and full-filesystem comparison must actually pass before any artifact claims. Previous150 CI proves the earlier tree only. No publication, merge, cloud build, deployment, identity/access change or spending was performed in this task.

`scripts/release-rollback-policy.json` remains unchanged with `floors: []`. There is no approved full-function fallback or release authorization. Do not bypass this blocker or treat historical pinned proofs as a new deployment approval.

## Local validation recorded
- Serial Node suite: 1,230 total, 1,213 passed, 17 skipped, zero failed (native-only cases remain skipped).
- Python suite: 15 passed, including 7 proof-boundary parser/comparison tests.
- Focused image/rollback packaging contracts: 13 passed. Source build, syntax and diff checks passed.
- Independent packaging source review cleared local testing only. Fresh actual Docker/native/browser proof for this packaging remains **pending**, not covered by old150 CI.
