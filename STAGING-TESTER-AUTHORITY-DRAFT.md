# Draft: named fictional-pilot authority

Not deployed. No real tester UID is configured; no invitation, IAP/OAuth change, grant, or organization-policy exception is performed by this change.

## Admission

`STAGING_TESTER_BINDINGS` defaults to `[]`. At most five exact objects are accepted, each with `uid`, `email`, and ISO `expires`. UID and email must be unique; owner UID cannot be included. Each expiry must be after the pilot creation time and no later than pilot expiry. An already-expired binding can be parsed on restart so it cannot prevent the owner from signing in; authentication rejects it on every use.

Owner `config.uid`, project, database marker, origin/host, and overall expiry remain unchanged. The Firebase SDK must verify every token/session with revocation checks; verified email, Google provider, exact issuer/audience are required. Tester admission binds exact UID **and case-sensitive verified email**, not email alone. Returned identity is a new frozen allowlisted object with no caller-supplied role. UID is never remapped to owner. Removing a binding or expiring it rejects old cookies. Public sign-in/session exchange remains usable with a stale cookie; the new token is still independently verified. Same-origin POST logout can clear stale cookies.

## Authority and data

The separate tester route policy defaults to deny. It permits the fictional Contacts → Worklist core, not exports, provider execution, jobs, sharing, invitations, admin/team, profile mutation or identity-review decisions. Exact unchanged supplied CSV validation remains mandatory. Freeform fields can accept arbitrary text; this is **not** technical detection/prevention of all real personal information. Instructions must require fictional information only.

Any admitted account with existing incoming list-sharing authority or a discovery admin row is denied API access before downstream handlers. This applies symmetrically, including owner and after tester removal, instead of silently inheriting broad authority. No role/share rows are changed. These checks add reads of `prospect_list_shares` and `discovery_users`; exact native restricted-runtime login proof is required before deployment. Concurrent out-of-band grants are prohibited during this isolated pilot; API grant paths are disabled. This is an application boundary, not database row-level security.

The dedicated staging assembly **always** enables owner-scoped candidate matching and historical lead collision checks. This intentional staging-only privacy change persists after the last tester binding is removed. Candidate keys, namesake indices and probable matches use the caller's owned rows. Historical marker and evidence lookups remain caller-scoped. Production `createResearchLab` defaults to its existing team-wide matching policy. The owner marker is never rewritten. Administrative/review features are not granted to testers.

Lab summary's catalog metadata is the existing public/synthetic employer-plan catalog summary, not another user's contacts or private advisor metrics. Provider adapters remain absent and fixture tests observe no outbound network attempt; this is not a new network firewall.

## Evidence and remaining gates

Synthetic PGlite tests cover the same Alex fixture owner-first/tester-second and Sam fixture tester-first/owner-second, separate contact/lead/import records, replay scope, cross-ID read/write/contact-handoff denial, aggregate read isolation, exact email/UID/provider/project/revocation/expiry/removal checks, stale-cookie recovery, and pre-existing share/admin fail-closed guards with unchanged whole-database snapshots. A separate direct test confirms production-default team matching remains unchanged.

Pending: independent final review; native PostgreSQL with actual restricted runtime LOGIN and exact deployed grants; exact-image/browser proof including tester-specific UI for currently disabled controls; effective organization-policy and external IAP/OAuth approval; supported verification of the real tester's staging UID; explicit approved access configuration; owner regression smoke and the tester's own first login. PGlite/source tests do not prove any of these. Existing organization controls must not be bypassed. No external tester readiness claim is warranted yet.
