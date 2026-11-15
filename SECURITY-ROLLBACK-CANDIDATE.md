# Security-preserving rollback candidate

This isolated candidate starts at PR110 head 138dcbe, the hardened schema029 application. It adds only capture-alias preservation in deletion, ported from PR100, and synthetic tests. It preserves UID-only ownership, crawler public-address pinning, CSV escaping, redacted logs and dependency fixes. It does not enable networking writers or run migrations030–033.

Compatibility tests cover pre032 deletion, capture aliases and transaction failures, missing/corrupt schema fail-closed behavior, owner isolation and no private notes in tombstones, plus planning-decision observations retained while the older application reads and saves a follow-up on schema033. Native PostgreSQL tests exercise a synthetic10,000-row migration transaction and blocking readers: locks persist to rollback and timeout leaves schema/data unchanged. These are mechanism/fixture tests, not production capacity estimates.

Not an approved rollback floor yet. Required: exact-head native PostgreSQL CI, full suite and built-image tests, independent review, immutable image/provenance, staging with schema033 and application rollback, and production-scale lock/pool/backup planning. No deployment or production-data change is authorized by this draft. The release policy floors list must remain unchanged until all required evidence is recorded.

Important policy regression: preserving planning_decision observation rows is not advice_decision semantic equivalence. This older application does not retain the new advice-decision prioritization. It is not the preferred fallback where retaining decision semantics is required; the separate PR109-derived read-only candidate investigates that requirement.
