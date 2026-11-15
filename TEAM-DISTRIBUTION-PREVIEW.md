# Departed-advisor distribution preview

This increment adds a bounded multi-recipient distribution planner and an opt-in
`POST /api/team-hub/distribution-preview` handler. **No production adapter is
configured, no ownership changes occur, and no outreach is authorized.** The
existing team workspace remains fail-closed in production.

## What it does

- Requires a departed source advisor and explicitly authorized active, verified
  recipients within one server-selected firm. Email domain/global role alone
  never grants access.
- Loads one authoritative snapshot only after an exact-scope grant, rechecking
  authorization before returning results. Request callers cannot supply records,
  capacity, rights, roles or firm IDs.
- Proposes assignments in earliest recorded follow-up order, balancing the
  recipient's existing workload relative to explicit configured capacity.
- Holds overflow and records without an allowed recipient-rights decision for
  manual review. Missing/incomplete/foreign ownership metadata fails closed.
- Preserves DNC, consent, privacy and other holds verbatim in the proposal;
  assigning responsibility does not grant permission to contact someone.
- Returns minimized stable IDs, workload counts, a snapshot fingerprint and
  proposed assignments, not names, phone numbers, emails or financial data.

The fingerprint is not the existing execution service's fingerprint or an
execution token. A future apply path must fresh-read all records and contracts,
revalidate provider rights and membership, fence the departed advisor's sessions
and background jobs, and perform atomic audited transfer with a scoped
idempotency key. The current execution contract is intentionally not wired here.

## Local demonstration and tests

`node scripts/distribution-preview-demo.mjs` prints a fictional proposal using
three receiving advisors, one capacity hold and an intentionally retained DNC
restriction. This does not use the database or call providers.

`node --test test/team-distribution-plan.test.mjs test/team-lead-hub.test.mjs`

## Integration prerequisites

The production schema has no complete authoritative firm snapshot/rights loader
for this planner. This increment deliberately does not invent that evidence or
turn legacy owner rows into shared firm property. Before enabling an interactive
UI or this handler in production, implement a reviewed server-only loader that
binds every lead to explicit firm assignment and provider-transfer rights,
reports all current assignments for capacity, provides complete recipient rights
(including explicit review/denied), verifies the source's departed status, and
returns one coherent versioned snapshot. Recipient capacities must be configured
by authorized firm operators, not guessed from adviser performance or personal
data. All existing isolation/read-only release guards continue to apply.

Plan output does not implement an unassigned firm queue, transfer selection,
account deactivation, recovery, or a live handoff. Those remain gated follow-ups.
