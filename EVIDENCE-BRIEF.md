# Advisor evidence brief

The advisor detail brief now explains its existing worklist reason and separates:

- **Reviewed facts:** current qualification-gate evidence and reviewed personal events, with the original source link, observation date, review date, and event date where recorded. Older personal events are retained as historical context with a refresh warning.
- **Reported professional context:** employer, role, city, and state claims. Each source/value retains its own citation and dates. Conflicting reports remain visible. These reports are not verified residence or financial facts.
- **Interpretation:** what professional context can support researching, with an explicit statement that it does not establish financial need, assets, eligibility, or interest in advice.
- **Unknowns and holds:** missing, stale, rejected, conflicting, or restricted evidence under the active qualification target.

The existing next action remains first. Reviewed citations and professional context expand on demand. Excluded and client records do not receive new conversation questions or a personal-event review shortcut in this summary.

## Evidence rules

Publication/source dates, observation dates, review dates, and first/last recorded dates are separate. Importing or reviewing an old/undated claim does not make its source current. Unknown, future, malformed, ambiguous, and impossible calendar dates display as unknown. Only ISO calendar dates and ISO timestamps with a timezone are normalized.

A URL belongs to a claim only when recorded on that field/value. No company homepage, unrelated evidence URL, or record modification timestamp is substituted. Links reject non-HTTP(S) schemes and embedded credentials. The client escapes all source and statement text.

This is an additive, read-only `brief.evidence_summary` response. Existing ranking, qualification, suppression, owner access, contact shortcuts, cadence, drafts, and activity writes remain authoritative. There is no new schema, provider call, paid enrichment, automatic outreach, or deployment. Older responses without the additive summary still render.

## Verification

Use `node --test test/*.test.mjs` (the exact package test script) and `node build.mjs`. Focused coverage lives in `test/prospect-brief-evidence.test.mjs`, `test/prospect-brief-client.test.mjs`, and the advisor-detail integration test in `test/advisor-workflow.test.mjs`.

The synthetic demo (`DEMO_PORT=8097 node scripts/demo.mjs`) can show the brief without production credentials or provider calls. It uses fictional contacts in memory and resets when stopped. Do not enter live prospect data.

### Local verification, 2026-11-15

- Full package test script run directly with Node: **850 tests, 845 passed, 0 failed, 5 skipped**. The five skips require an explicitly configured disposable PostgreSQL instance; no live database was used.
- `node build.mjs`, image-content checks, JavaScript syntax checks, and `git diff --check` passed.
- Synthetic Chrome QA: safe next action remains first; reviewed facts and reported context expand; source dates stay visibly unknown when absent; starting an event review clears its source fields; dismissal returns to the worklist; an identity-held prospect remains without a contact shortcut.
- Independent review identified impossible calendar-date normalization; strict validation and regression tests fixed it. The full suite identified a missing runtime image module; Docker copy and context allowlists now include it.
- No deployment, remote publication, real prospect data, external provider requests, or messages to prospects.
