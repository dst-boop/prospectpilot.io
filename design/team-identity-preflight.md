# Schema 034 team reassignment preflight: isolated, read-only slice

This extends the existing firm-scoped snapshot draft, not production Team Hub.
There is no HTTP adapter, migration activation, transfer, permission change or
production enrollment. The current server still supplies no supervisor policy or
firm roster. Billing memberships and the legacy site-admin flag are not firm
membership or authority to reclaim personal data.

## Implemented boundary
The existing snapshot verifies a revoked-check session, explicit active firm
membership, source/recipient assignments and recipient account status. This slice
adds bounded schema034 evidence inventory for those already-authorized live source
contacts/leads and recipient assigned contacts, within its read-only repeatable-read
transaction. It reports record/evidence counts, missing retained evidence and a
provenance-sensitive digest. Original token namespaces and key versions affect the
digest but tokens, namespaces and raw review candidates are not returned.

An associated pending update or previous approval adds a review blocker. This is
an association inventory, not confirmation that two records represent one person.
Missing evidence is unknown, not clearance. Missing schema fails closed.

Owner-wide deleted markers and unassociated arrival reviews have no firm assignment
in schema034 and are not queried. Recipient private records, other firms and target
leads are not assessed. Key availability and full collision/deletion coverage remain
unknown. The response always says can_transfer=false and retains existing no-apply,
service-continuity, rights and account-offboarding blockers. A digest detects changes
in selected evidence fields and review ID/status/resolution-time metadata, not
review candidate or resolution-content changes; it is not a transfer authorization token or future-state guarantee.

## Decisions required before a live assignment/reclaim implementation
1. Establish an authoritative firm membership/enrollment and role-approval process.
   An email domain, billing plan, legacy global team or site-admin flag is insufficient.
2. Establish which individual resources the firm may assign, who approves their rights,
   and whether reassignment changes service responsibility, data ownership or both.
   Private networking notes and provider rights cannot be inferred from contact access.
3. Specify how deletion protection applies across advisor changes. Historical tokens
   must retain original namespaces; owner-wide markers cannot be copied wholesale
   between accounts or treated as firm-owned by implication.
4. Specify pending review custody and whether prior distinct-person approvals remain
   applicable after reassignment. No incoming/deleted personal detail is exposed here.
5. Implement authoritative worker/session fencing, versioned transactional inventory,
   audit/idempotency, destination restriction checks and compatible rollback semantics
   before any production apply endpoint. Test concurrent deletion, reassignment and
   review resolution with real PostgreSQL and scoped accounts.

The existing isolated execution-contract tests are not production adapter coverage.
The safe immediate result is a clearer read-only inventory of what prevents transfer,
not a working reassignment button. All fixtures are synthetic.
