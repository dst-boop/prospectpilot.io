# Departed-advisor reassignment: supervisor preview

Status: isolated development only. The planner now has an authenticated,
supervisor-gated Team Lead Hub UI and read-only HTTP boundary, exercised with
fictional accounts in the local demo. Production fails closed because no
authoritative firm policy, roster, or complete database adapter is configured.
No ownership write, account revocation, provider call, migration, deployment, or
public push is included. This is not an end-to-end offboarding feature yet.

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
The preview module and UI are packaged with the server, but no live data adapter or
supervisor policy is enabled. Full checks and platform limitations are reported with
each increment; focused tests alone are not a release-readiness claim.

## Team Lead Hub increment

`/team-hub` shows the departing and receiving advisor, counts for all ten planner
collections, stable record IDs, identity collisions, review blockers, preservation
requirements, and the inventory fingerprint. It exposes no apply button or route.
Individual-record selection, due-follow-up details, an unassigned team queue, and
an immutable transfer receipt remain future work; the preview does not claim them.

`team-lead-hub.mjs` reserves `/api/team-hub/*` before legacy administration. Firebase
session verification remains in `handler.mjs`. Every page, asset and API request
requires an authoritative `authorizeSupervisor({actor})` grant with the exact
`actorUid`, scope `team-lead-hub-preview`, and firm `team`. Legacy owner email,
request roles, email domains, and client headers never grant access to this hub.
`listAdvisors({actor,team})` must return the authorized roster only. Labels and UIDs
are the only identity fields exposed, with active/verified eligibility state.

The preview POST accepts only `source_uid` and `target_uid`, requires JSON and an
exact same-origin header, checks both UIDs against the current roster, then asks
the planner's separate exact-pair authorization adapter. The pair grant must match
the hub's team. Account and snapshot reads occur only after both checks succeed.
All responses are private/no-store; internal adapter errors are redacted even when
they carry an HTTP status. No mutation adapter is present.

`server.mjs` intentionally configures only static UI assets. Requests fail with 503
until application-owned supervisor, roster, account and snapshot adapters exist.
This must not be enabled by inserting the legacy global team or a hard-coded owner
email as a substitute. A real firm-ownership and membership model is still needed.

The local demo at `/team-hub` uses `scripts/team-hub-demo.mjs`, with fixed fictional
accounts and coherent per-UID inventories. It has no production provider, auth
management or database client. It stays separate from the demo contact directory so
previewing cannot accidentally mutate or transfer demonstration contacts.

The client clears old previews on selection changes, cancellation, refresh,
navigation and session errors. Abort signals plus request generations prevent late
responses from reviving dismissed results. Back/Forward restores a fresh directory;
sign-in returns to `/team-hub` without carrying advisor IDs in the URL. No preview
is automatically generated after login or navigation.

Focused checks: `node --test test/team-lead-hub.test.mjs test/team-hub-client.test.mjs`.
The demo integration test also checks the HTTP preview and verifies the ordinary
contact directory is unchanged afterward. Review fixes cover status-bearing error
redaction, Back during directory loading, safe login return, and reversed fixtures.

### Supervisor UI validation (November 15, 2026)

- Build passed with `node build.mjs`.
- Full Node suite: 701 tests, 700 passed, 0 failed, 1 pre-existing skip. The
  package test command was run directly as `node --test test/*.test.mjs` because
  `npm` was not on the selected desktop's PATH.
- All 38 new hub route/client tests passed, including authentication/isolation,
  duplicate submission, stale responses, cancel/close, lost access and recovery.
- Six Python tests passed with the existing bundled Python interpreter.
- JavaScript syntax, all four release/setup shell syntax checks, and Git whitespace
  checks passed. No lint or type-check script is defined in this repository.
- Local Chrome verified fictional advisor selection, disabled unverified recipient,
  inventory totals, review gates, exact IDs and collisions, close/reopen, selection
  changes while loading, reversed advisors, and Back/Forward recovery. No console
  warnings or errors were observed in the hub flow.
- Independent review findings were fixed and re-reviewed with no remaining
  actionable findings in this scope.
- Not run: real PostgreSQL integration (no `POSTGRES_TEST_URL`), Docker image build
  (Docker unavailable), real Firebase/staging supervisor journeys, live data access,
  any transfer execution, deployment, or remote CI.


### Earlier planner-only validation (November 15, 2026)

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
