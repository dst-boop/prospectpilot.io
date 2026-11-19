# Advice-decision read-only fallback prototype

Based exactly on PR109 head c1fdabdf22c6658a8362de8a791eea7d604522f4. This is a separate PR109-derived degradation mode, not a historical rollback image or approved rollback floor. It keeps the same advice-decision evaluation while making only the signed-in worklist and existing brief available. It cannot recover from a bug inside those retained read/evaluation modules.

## Explicit behavior

`PROSPECTPILOT_READ_ONLY=true` selects it. Invalid values fail startup. Normal mode is unchanged. Version output discloses the mode. Use the flag consistently on both web and research worker; mixed modes are not protected.

- Web authentication and sign-out remain available. An explicit route allowlist serves only the fallback page, its script/stylesheet, worklist and brief. Existing public health/version, about/branding/login assets and owner-only readiness remain available.
- No contact shortcuts, outbound drafts, exports, directory operations, lead edits, follow-up writes, research, networking, billing, webhook processing, or legacy tools are served. Rejected operations return503 rather than pretending to succeed. Stripe webhook delivery must retry; prolonged degradation needs reconciliation with the provider's retry window.
- Reads use the existing UID-scoped advisor worklist/brief methods, which evaluate in memory rather than ResearchLab's persisted GET detail. Server DB connections also request PostgreSQL default_transaction_read_only as a defense-in-depth fence.
- Worker exits before constructing pools, scheduling due work, or ticking any queue. It does not erase/finish queued tasks. Already-running old revisions must finish or be separately handled before activation; this flag cannot cancel them remotely.

## Recovery constraints

Requires the target schema033 and unchanged security patches; never run migrations or erase new observations to activate it. It preserves new decision semantics, but advisors cannot record commitments while active. After fixing and validating the normal release, disable the flag on both services and deliberately review pending jobs, provider reservations, expired leases and webhook retries before allowing normal scheduling. Do not silently replay paid work. Backups and rollback-image provenance are still required.

Synthetic HTTP tests check decision priority, same-UID behavior, recycled-email denial, tenant isolation, explicit mutation/legacy/webhook denials, unchanged qualification rows and zero external calls. Tests prohibit any DB query except unlocked SELECT during fallback reads. Worker subprocess test runs with an unusable database host and confirms no execution. Real Firebase, production scaling/locks, visual QA and built-image staging are separate gates. No deployment or approved-floor change is made by this draft.

The fallback UI supports name/company search, 24-row Previous/Next paging, empty results and mobile-wrapped briefs. Search is bounded by the retained evaluator working-set cap; a visible notice requests a narrower search when truncated. Browser tests exercise both page directions, search reset, brief loading, no-result controls and mobile overflow using synthetic authentication.

CI runs scripts/verify-readonly-image.mjs inside the exact built runtime image ID, with no host application code mounted. Disposable loopback PostgreSQL is migrated to033; normal activity, read-only activation and normal recovery are checked with full-table snapshots and pending/leased tasks plus paid reservations retained without replay. Authentication is injected synthetic, not real Firebase; this exercises runtime handler modules and worker entrypoint, not server bootstrap or actual service rollout. Image ID is printed as evidence, not registered as an approved floor.
