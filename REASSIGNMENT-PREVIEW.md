# Departed-advisor reassignment: preview foundation

Status: isolated development only. No server route, database adapter, UI, ownership
write, account revocation, provider call, migration, deployment, or public push is
included. This is not a usable end-to-end offboarding feature yet.

## Why this increment exists

The legacy `source/worker-runtime.js` assign/reclaim path changes only
`discovery_leads.owner_user_id`, `owner_email`, and its lead payload. The newer
`prospect_contacts` and `prospect_lists` remain owned by Firebase UID. List sharing
is not ownership transfer. Research observations, qualification, linked contacts,
activity authors, provider jobs, and historical cost attribution need a deliberate
transition, not a second copy of every lead.

`advisor-reassignment-preview.mjs` adds a deterministic, read-only planning boundary.
It returns stable record IDs, inventory counts, possible identity collisions, a
snapshot fingerprint, and review blockers. No contact names, emails, phone numbers,
notes, evidence payloads, or financial details are returned by this planner.

## Safety contract

- No default authorization. The server-supplied `authorize` adapter must authorize
  the exact source and target UIDs with scope `advisor-reassignment-preview` and an
  authoritative firm/team scope. A request-body role, shared email domain, or the
  legacy global `wealth-management` team value is not proof of firm membership.
- Authorization happens before account resolution or data reads.
- The receiving account must be active and email-verified. Firebase UID is the
  identity; an email address is not a substitute.
- Missing collections, invalid ownership, duplicate IDs, malformed identity keys,
  or inventories over 10,000 rows per collection fail closed. Identity keys are
  bounded to 32 per contact, 2,048 characters each, and 100,000 in aggregate;
  collision expansion stops at 10,000 distinct source/target pairs.
- Cross-owner memberships, linked records outside the proposed transfer, ambiguous
  identities, existing shares, unfinished jobs, and unverified source-account
  revocation are review gates. Nothing is automatically merged or cancelled.
- Provider rights always require review. The current repository explicitly treats
  ZoomInfo as bring-your-own; firm-wide redistribution is not assumed.
- `can_execute` is always false. The fingerprint detects inventory changes, but is
  not a permission grant, signed token, or transfer endpoint.

## Adapter snapshot contract

Adapters are application-owned code, never values supplied by an HTTP body.
`resolveAccount(uid)` must resolve Firebase UID, disabled state, and verified email
state from the authoritative account service. `loadSnapshot` must read one coherent
snapshot with explicit source/target ownership filters and return `complete: true`
only after every collection has been loaded, including empty ones:

- `contacts`: all source-UID contacts, including identity keys and payload.
- `targetContacts`: all target-UID contacts for conservative collision review.
- `lists`, `listMembers`, `shares`: all source-owned lists and their memberships and
  share grants. A non-source contact in one of these lists is held for review.
- `discoveryLeads`: all source-UID leads within the authorized scope. Email-only
  legacy ownership must be resolved separately; it cannot silently become UID ownership.
- `contactLinks`, `observations`, `activities`: source-UID records, including links
  to leads outside the transfer. Such cross-scope history is reported, not moved.
- `jobs`: source-owned work across prospect tasks, Research Lab runs, research jobs,
  legacy discovery jobs, and Autopilot. Normalize to an ID, owner UID, and explicit
  status. Never omit paused/resumable work or infer that an unknown state is complete.

A production loader must also account for scheduled discovery, suppression blocks,
rest periods, tombstones, import histories, acquisitions, charges, external usage,
and privacy/forget coverage. Those stores are not yet read by this pure planner.
The planner does not certify a snapshot was truly complete; the adapter must do so.

## Next usable product increment

Build an admin-only **Team Lead Hub** around a firm-owned record and explicit advisor
assignment, rather than copying private directories between people. Keep advisor-
restricted or provider-restricted records separate. No new global visibility should
be inferred from being an admin in the legacy workspace.

A guided departure workflow should show: departing advisor, verified recipient or
unassigned team queue, exact selected records, due follow-ups, unresolved duplicates,
restricted records, unfinished work, retained suppression, and access-removal steps.
The supervisor reviews a preview, confirms the exact transfer, then receives an
immutable audit receipt and reconciliation totals.

Before the apply path is implemented:
1. Confirm who can authorize firm-level transfers and which records are firm-owned.
2. Decide how permitted provider data can be reassigned under the actual licenses.
3. Define transactional identity collision handling; never silently replace evidence.
4. Define preservation of notes, next steps, observation authors, touch caps and costs.
5. Coordinate session revocation and worker pausing, with a stale-preview check.
6. Add idempotent all-or-nothing apply, durable before/after audit, and tested recovery.
7. Wire a least-privilege route and accessible preview UI, then exercise actual
   supervisor/advisor journeys in staging with synthetic accounts.

Required end-to-end proof: a departed advisor loses access; an authorized recipient
sees the intended records and agreed next steps; unrelated private records stay
hidden; suppression and history survive; repeated submission is safe; concurrent
edits stop a stale transfer; jobs cannot spend against reassigned records; no credits
or costs are rewritten; no outreach occurs.

## Validation

Focused tests: `node --test test/advisor-reassignment-preview.test.mjs`.
The normal repository build/test suite remains required before any publication.
The preview module is allowlisted for build-stage tests only and is deliberately not
imported by the production server. Full checks and platform limitations are reported
with this increment; focused tests alone are not a release-readiness claim.


### Verified on this isolated increment (November 15, 2026)

- Build: `node build.mjs` passed.
- Final full Node suite: 663 tests, 662 passed, 0 failed, 1 pre-existing skip.
- New preview tests: 51, included in the final full suite.
- Python unit tests: 6 passed.
- Shell syntax: all four release/setup scripts passed individually.
- JavaScript syntax and Git whitespace checks passed.
- Independent code review: two findings fixed and re-reviewed (unresolved receiver
  identities and unbounded collision expansion); no remaining focused findings.
- Not run locally: real PostgreSQL integration (POSTGRES_TEST_URL not configured),
  Docker image build (Docker unavailable), staging/authenticated browser testing,
  actual record reassignment, production deployment, and remote CI for this branch.

No existing checkout or live prospect record was changed. The older desktop checkout
and its uncommitted edits were left untouched. No code was pushed publicly.
