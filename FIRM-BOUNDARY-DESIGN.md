# Firm membership and record-ownership boundary

Status: isolated, preview-only increment. November 15, 2026.

## What this adds

- `schema-drafts/firm-preview-boundary.sql`: an additive, empty-by-default schema draft, exercised only in disposable PGlite tests. It is deliberately absent from `migrate.mjs`, so it does not reserve or collide with networking migration 032. No legacy table, production privilege, account, share, or record is changed.
- `firm-preview-boundary.mjs`: request-bound supervisor, roster, exact-pair and explicit-record authorization adapters. The caller must supply an already verified Firebase actor and a server-selected firm ID. All database operations are reads. Firebase resolution is supplied application code, not a client field.
- `test/firm-preview-boundary.test.mjs`: synthetic database and integration regressions for the boundary.

Production remains unchanged: `server.mjs` does not import the adapter, and the real Team Lead Hub continues to fail closed. No default snapshot loader, transfer endpoint, invitation flow, membership-management endpoint, credential change, provider call, or deployment was added.

## Existing schema findings

1. `prospect_memberships` (migration 023) is billing-plan entitlement. It cannot prove firm membership or supervisor authority.
2. Private contacts and lists use a Firebase `user_id`. A verified email, matching email domain, site-owner email, or a JWT role is not a firm grant.
3. Discovery leads have `team` and `owner_user_id`, but current Research Lab uses a shared legacy team scope. That value is not an authoritative firm ID.
4. List shares grant access to a particular list, not the owner's whole workspace. A share is not firm ownership or a transfer authorization.
5. The existing reassignment planner is intentionally read-only. It requires a complete coherent ten-collection snapshot and always reports `can_execute: false`.

## Data model and policy

`firm_workspaces` identifies an actual approved firm. `firm_members` keys membership by `(firm_id, user_id)` using immutable Firebase UIDs. A member may have more than one firm membership. Membership and firm status default to `suspended`; there is no automatic enrollment or email-domain inference.

Roles are `owner`, `supervisor`, and `advisor`. Only an active owner or supervisor in an active firm can see the directory or request a preview. Source membership may be active or departed; target membership must be active. Suspended members cannot participate. Departed status preserves historical association, but does not itself disable Firebase, revoke sessions, or prove departure is complete. The existing planner independently checks current recipient account state and surfaces source access-revocation blockers.

`firm_contact_assignments`, `firm_list_assignments`, and `firm_lead_assignments` explicitly associate one existing record with one firm and one advisor membership. Each references the real record and the `(firm_id, advisor_uid)` member, and carries a rights basis, review reference, reviewer, and time. These are administrative assertions needing review, not proof of provider licensing or consent. A record cannot be assigned to two firms. Unregistered records remain private/legacy; nothing backfills from a UID or shared team.

The adapter checks both the explicit assignment and the actual existing record owner. If they disagree, the record is refused. That check intentionally refuses stale mappings rather than silently rewriting ownership. The draft does not add composite owner constraints or triggers to legacy tables; a future provisioning service must validate the owner inside its write transaction. Roles and assignment rows can only be provisioned by separately authorized server administration; this increment exposes no write route.

The record gate supports source contacts, lists, and leads plus recipient contacts for collision checking. It checks at most 1,000 distinct requested IDs, reads only keys/owner fields, rejects target lists/leads, and proves only that these exact records were in scope when checked. It does not claim the inventory is complete, authorize related data automatically, or grant a transfer.

## Adapter lifetime and integration contract

Construct `createFirmPreviewAdapters` once per authenticated request after `verifySessionCookie(..., true)` and the existing verified-email/provider checks. Never place one adapter instance in the process-wide hub singleton or cache a successful grant. The actor UID is captured at construction; client-supplied roles, email, team and source snapshots are ignored. `firmId` must be selected by trusted server configuration or a separately validated membership-aware workspace selector.

The returned `authorizeSupervisor`, `listAdvisors`, and `plannerAdapters` match the existing hub interfaces. A pair can be authorized only once on an instance; a repeated attempt invalidates it. Pair account reads recheck the actor and both members before and after the authoritative account lookup, and return only UID, disabled state and email verification state. Directory output is capped at 200 members and strips other Firebase metadata. Membership/directory changes during account lookups cause refusal.

There is deliberately no `plannerAdapters.loadSnapshot`. Composing the new policy with the hub permits an authorized directory context in tests, but preview requests return 503 before any contact inventory is read. The default production hub remains completely unconfigured.

## Work required before real snapshot access

1. Approve authoritative firm membership and resource rights using actual business records. Review provider redistribution restrictions, including bring-your-own ZoomInfo data. Never infer them from billing, email domain or a list share.
2. Reserve the next available numbered migration only after coordinating with concurrent work. Deploy empty tables separately from authorization activation; backfill only explicitly reviewed records with a reversible audit trail. This draft is not an automatic production migration.
3. Build a request-scoped, read-only, repeatable-read PostgreSQL snapshot loader. Validate membership and assignments in that same consistent read point. `assertRecordScope` alone uses separate statements and is not a transaction or a check-then-read security guarantee; its successful result must not be cached or used to authorize a later mutation.
4. Scope every child relation explicitly: list members and shares, contact links, observations, activities, qualifications, import provenance, jobs/tasks and research runs. Preserve original authors, budgets, costs, provider attribution, suppression/tombstones, rest periods and shared contact limits. Do not query all rows for a member's UID, because they may also hold private or other-firm records.
5. Reconcile firm-scoped inventory semantics with the existing planner's complete-snapshot contract. Omitting unregistered private/other-firm contacts is necessary for privacy, but may make duplicate checks or linked-history coverage incomplete. Never label a partial inventory `complete: true`, or relabel the legacy discovery `team` value without explicit validated assignment.
6. Add durable, minimized access/administrative audit records, operational timeouts/pagination, and real PostgreSQL integration tests. Integrate deletion/forget flows before enrollment: the draft foreign keys intentionally restrict record/member deletion and must not block an authorized erasure after activation. Archive the permitted audit information and remove assignment references in the same authorized cleanup transaction. The preview adapter is not row-level security and must not be presented as tenant isolation for existing legacy APIs.
7. Only after these gates, wire production behind explicit enablement and test revoked sessions, simultaneous membership changes, mixed-owner lists, private contacts, same user in two firms, incomplete jobs and stale snapshots.

Actual transfer remains a separate increment: explicit action authorization, locks and authoritative rechecks within the write transaction, a non-replayable approval tied to the reviewed inventory, data-rights confirmation, ownership/audit preservation, rollback without data loss, and no credential or budget movement. A preview fingerprint is never an approval token.

## Rollback and verification

Reverting this code increment leaves all existing production behavior untouched. The draft tables are never created by the normal migration runner. If a later approved rollout creates them, disable the new integration and retain the tables and audit records; do not drop populated tables as a rollback.

All tests use fictional UIDs and in-memory PGlite. No production database, Firebase account, external source, paid service or real contact was accessed. The ordinary migration history remains 031 in this branch, with networking 032 intentionally absent.

Final local verification: `node --test --test-concurrency=4 test/*.test.mjs` completed with 753 tests, 752 passed, zero failed and one pre-existing real-PostgreSQL skip (POSTGRES_TEST_URL is not configured), in 141 seconds. The final focused boundary/image suites passed 46/46, all 158 tracked JavaScript/module files passed `node --check`, `node build.mjs` passed, and `git diff --check` passed. An independent read-only review confirmed the request-invalidation and Docker-context fixes and reported no remaining findings within this isolated draft scope. Docker is unavailable, so an actual image build was not run; no real PostgreSQL, Firebase/staging or deployment verification is claimed. Full local test output is retained in ignored `.tmp/firm-boundary-final-tests.log`.
