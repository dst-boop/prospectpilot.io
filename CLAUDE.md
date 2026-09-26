# CLAUDE.md — ProspectPilot

ProspectPilot is the prospecting workspace for a national financial advisory
practice. It is becoming the one app: Lead Qualifier is being merged into it
(see [MERGE-PLAN.md](MERGE-PLAN.md)). These rules combine both projects.

## Operating mindset

Work as a senior engineering partner. The rules below come with reasons.

- **Conflicts:** when a rule conflicts with a goal, say so and propose
  options. Do not pick silently or refuse.
- **Root cause:** diagnose the root cause before patching a symptom.
- **Second-order effects:** surface the effects on cost, PII, scale and
  compliance.
- **Record what you learn:** when you discover a quirk the hard way, write it
  down in the relevant `*.md` note.

## Stack

- **Runtime:** Node 24 ESM on plain `node:http`. `server.mjs` → `handler.mjs`
  routes to `research-lab.mjs` (`/api/lab`), `prospect-workspace.mjs`
  (`/api/prospect`) and the older tools.
- **Frontend:** vanilla JavaScript, no framework and no build step:
  `lab-client.js`, `prospect-client.js`. `build.mjs` generates only
  `generated/`.
- **Security:** a strict CSP and same-origin checks on mutating requests.
- **Data:** Postgres (Cloud SQL). Migrations are listed explicitly in
  `migrate.mjs`, and a new one must be added there. Migrations are never
  edited after they ship.
- **Background work:** the Postgres job queue (`research_jobs`, `lab_tasks`,
  `prospect_tasks`) with a Cloud Run job worker, run by Cloud Scheduler every
  five minutes.
- **Auth:** Firebase, with the `__session` cookie. Each workspace is isolated
  by Firebase uid.
- **Image:** `Dockerfile` copies modules explicitly and `.dockerignore` is an
  allowlist. A new server module goes in both, and `test/image-contents`
  checks this.
- **Tests:** `pnpm test`, which runs `node --test test/*.test.mjs` against
  PGlite. It is hermetic, with no real credentials. A fixture that
  exercises a table must load the migration that creates it.

## Principles

1. **Scalable.** Work that can outlive a request goes on the queue, with
   checkpoints and leases. It is never held in a browser tab.
2. **Privacy-first.** Personal data stays behind a signed-in session and is
   scoped to its owner. It never appears in URLs or logs: log counts and ids,
   never payloads.
3. **Configurable.** Targeting, source economics and cadence are settings, not
   code.

## Evidence and enrichment

- **Qualification gates:** the five gates decide qualification: age,
  residence, contact, financial and consent.
- **Financial evidence:** this needs participant disclosure or an authorized
  document. The following never establish wealth:
  - Employer plan assets.
  - Titles.
  - Graduation years.
  - Property values.
  - WARN notices.
- **Recorded results, including misses, are never re-run automatically.** A
  re-run is operator-initiated, behind a confirmation that names the cost.
- **Paid calls follow two phases.** The UI states the cost first. The server
  then reserves it against `prospect_charges` and enforces the ceiling.
  Client-reported spend is never trusted.
- **Cheapest source first.** Free and public sources come first, then paid
  sources gated behind qualification. AI synthesis is labeled inferred and is
  never mixed with verified fields.
- **Provenance:** every field records its source and observation time.
- **Excluded sources:**
  - FEC contributor data (52 U.S.C. §30111(a)(4)).
  - LinkedIn scraping.
  - Anything against a provider's terms.

## PII and deletion

- **Delete this person** (`forget.mjs`) is a first-class operation. It removes
  the contact, the linked lead and everything learned about them. It keeps a
  do-not-call block, the spend ledger (without the person) and hashed
  tombstones that stop re-import.
- **New fields and tables:** any new table or column holding personal data
  must be covered by `forgetPerson` in the same PR.
- **Age and education** are demographic PII. Age never appears in outreach
  copy.
- **State privacy laws:** national use means CCPA/CPRA and similar laws apply.
  Flag any feature that collects, shares or scores personal data.

## Compliance

The operator is a dually-registered advisor affiliated with Equitable Advisors.

- **TCPA:** nothing dials, texts or auto-contacts. Mobile numbers carry
  stricter rules, and calling restrictions are honored everywhere.
- **FINRA 3230:** applies to call lists.
- **Touch budget:** six touches in 45 days per prospect, then a 90-day rest.
- **Equitable pre-approval:** single-employer campaigns need it, and the UI
  says so.
- **No promissory language:** no promissory or performance-guarantee language
  in any template.
- **Outreach:** outreach is one-to-one and operator-initiated. Nothing is
  sent automatically.
- **Equitable employees** are excluded from lead output.

## ZoomInfo (account-specific)

- **Endpoint:** use `search_contacts`, not v2, when `excludedRegions` is
  needed.
- **managementLevel:** the values are exactly `"C Level Exec"` / `"VP Level
  Exec"`.
- **Tenure gate:** `positionStartDateMax` is the tenure gate.
- **Disallowed fields:** `yearsOfExperience` and `age` are disallowed. They
  fail the whole enrich after the credit is spent.
- **Response parsing:** responses may be double-encoded. Parse iteratively and
  flatten `attributes`.
- **Deduplication:** dedupe subsidiaries by parent company.
- **Seed employers:** the seed employer list is data, not code.

## Workflow

- Before anything that spends provider credits, even in testing, state the
  cost and wait for confirmation.
- When changing enrichment, list which recorded results or suppression flags
  could be affected, and confirm none are reset.
- Run `pnpm test` before pushing. Keep diffs small. Summarize what changed and
  why.
- This repository is public. Lead data, exports and anything naming a person
  never get committed.
