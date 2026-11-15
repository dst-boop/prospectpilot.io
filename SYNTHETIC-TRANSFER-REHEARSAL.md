# Relational transfer rehearsal: test-only, not live support

This increment composes the draft firm's stored membership, rights and audit ports
with a bounded synthetic snapshot/CAS fixture. It changes only test fixtures and
tests. Nothing is imported by production, registered in migrations or deployed.

The fixture locks real root/assignment rows containing synthetic records, compares
reviewed fingerprints, updates legacy owner UID and explicit assignment atomically,
checks protected manifests after CAS and audit, and records one append-only receipt.
Tests cover same-key replay, changed-key rejection, revoked/foreign authority,
rollback after content/protection/rights/version changes, failed audit, and lost
commit acknowledgment reconciled by the original key. Native PostgreSQL tests
exercise independent writer contention and concurrent same-key execution.

This is UID-only CAS: lead `owner_email` and `payload.owner_email` are preserved,
not reassigned. Their continuity semantics remain an explicit live blocker.

**Synthetic manifests are not real legacy manifests.** `complete:true` is valid
only inside this fixed test universe. The fixture does not inspect arbitrary
legacy records, discover identity collisions, enforce a real worker fence, transfer
provider rights or prove service continuity. Do not copy it into a runtime adapter.

## Concrete live blockers

- Root writers: `prospect-workspace.mjs`, `research-lab.mjs`, `generated/worker.mjs`
  mutate contacts/lists/leads without the firm fence. Some reads write verification
  or qualification. `discovery_leads.owner_email` continuity also needs design.
- Graph: `prospect_list_members`, `prospect_list_shares`, `advisor_contact_links`
  require closed explicit scope and separately reviewed sharing.
- History: `lab_observations`, `lab_qualification`, `advisor_activities`,
  `advisor_rest_periods`, `lead_call_records`, `lead_call_blocks` must retain
  authorship and effective protection; root ownership alone does not grant access.
- Workers: `research_jobs`, `lab_runs`, `lab_tasks`, `lab_run_leads`,
  `lab_identity_reviews`, `prospect_jobs`, `prospect_tasks`, `prospect_autopilot_runs`
  need durable enqueue and apply fencing, not merely an idle queue observation.
- Privacy: `prospect_forgotten` UID-derived tombstones and payload DNC/suppression
  must remain effective for the recipient without exposing private identities.
- Provenance/cost: `prospect_imports`, `lead_acquisitions`, `lab_costs`,
  `prospect_charges`, `prospect_external_usage` must retain actor and spend attribution.
- `prospect_networking_captures` are private advisor history, not implicitly shared
  by a contact assignment. Target identity keys and unique list names require a
  privacy-preserving collision protocol, not broad target inventory reads.

Keep `firm-scoped-snapshot.mjs` incomplete/fail-closed. A production adapter needs
an explicit relationship policy, all-writer fencing, trusted enrollment/rights
provisioning, complete locked manifests, reviewed CAS semantics, DB grants,
retention/backup/migration review and independent security verification.
