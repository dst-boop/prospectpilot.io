# Merging Lead Qualifier into ProspectPilot

Lead Qualifier (`dst-boop/lead-qualifier`, leads.financialplannersofamerica.com)
and ProspectPilot are two apps doing one job for the same practice, in the same
GCP project. They become one: **ProspectPilot is the app that stays.** Lead
Qualifier's features are brought across one reviewable PR at a time, then its
domain redirects here and it is retired.

## Why ProspectPilot is the one that stays

- It already has the harder foundations: a Postgres job queue with a Cloud Run
  worker and a five-minute scheduler, so work runs with no browser open. Lead
  Qualifier's own architecture decision 3 names that as its target.
- It has public sign-up with isolated workspaces. Lead Qualifier is keyed to
  one operator's email.
- Its evidence rules are stricter: five qualification gates, no inferred
  wealth, the touch budget, and rest periods. It is easier to add Lead
  Qualifier's enrichment sources under these rules than to add the rules
  around Lead Qualifier.

## What each side brings

| From Lead Qualifier | Lands in ProspectPilot as |
|---|---|
| Delete this person, with tombstones | `forget.mjs` (PR A) |
| The lead master list, statuses, activity and recorded enrichment | An importer into `prospect_contacts` and the Research Lab (PR B) |
| WhitePages/Trestle phone check and person search | A `whitepages` provider on `prospect_jobs`, budgeted through `prospect_charges` (PR C) |
| Claude web research, employer-site reader, AI QC, SEC proxy ages and Form 4, profile screenshots | Research Lab sources whose findings enter as observations awaiting review (PR D) |
| One-to-one email, `.ics` invites, one-click ZoomInfo sourcing, Autopilot, list sharing, the admin lead bank | The worklist and the job queue: a scheduled Autopilot is simply a queued job (PR E) |

What ProspectPilot keeps that Lead Qualifier lacked:

- The worker and scheduler.
- Multi-user workspaces.
- The five-gate evidence model.
- The touch budget and rest periods.
- Provider cost ceilings.
- The scoreboard.

## Decisions taken

These are recorded so they are not reopened by accident.

1. **FEC contributor data stays out.** ProspectPilot excludes it under 52
   U.S.C. §30111(a)(4). Lead Qualifier used it as corroboration only. The
   stricter rule wins; the data does not come across.
2. **Property values are not evidence.** Attom-style home values do not come
   across as a qualification signal. This matches the existing README.
3. **Outreach stays one-to-one and operator-initiated.** Lead Qualifier sent a
   single email or invite at the operator's click. That comes across in PR E.
   Nothing is sent automatically, and the "no messages are sent" wording
   changes only where a send button exists.
4. **Recorded results are never re-run automatically.** This is Lead
   Qualifier's rule, and it matches ProspectPilot's replay-safe jobs.
5. **Tombstones are per user.** They are hashed and salted with the user id, so
   the deletion record cannot be read back into a person, and one user's
   deletion does not block another user's independent copy. When an admin
   deletes someone else's Research Lab lead, the lead's owner gets the
   tombstone too. Set `FORGET_TOMBSTONE_KEY` (a Secret Manager value) on the service and
   the worker so they are HMACs a database snapshot cannot test guesses
   against; without it they fall back to salted hashes, and lookups accept
   both forms, so adding the key later keeps older tombstones working. Each
   deletion writes both the directory's and the Research Lab's identity keys,
   and provider searches honour them too.

6. **Email and invites open in the advisor's own Outlook.** The firm's
   Microsoft tenant (@equitable.com) allows no third-party sign-in, and the
   firm must archive and supervise what its advisors send. So ProspectPilot
   never sends. "Draft in Outlook" opens Outlook on the web with the drafted
   message addressed to the reviewed email route, and a booked meeting offers
   an Outlook invite or an `.ics` file. The advisor's own press of Send is the
   only send, and it goes out from their work address. This is Lead
   Qualifier's zero-permission path. Microsoft Graph would supersede it only
   if the firm ever approves an app registration.
7. **ZoomInfo arrives as ZoomInfo's own CSV export.** The plan has no API
   access, and reading contacts out of ZoomInfo's website or logging in on the
   user's behalf would breach ZoomInfo's terms. The export is made one step
   instead: drop the file anywhere on Contacts, the format is recognised from
   its headers, a list named after the file is offered and the rows are
   previewed. Nothing is saved until Import.
8. **Selling ProspectPilot: whose accounts power it.** Decided 2026-10-02 by
   the operator, ahead of selling memberships to other advisors.
   - **AI is built in.** ProspectPilot's own Claude key does the AI work;
     advisors never sign into Claude or ChatGPT. The reasons:
     - A consumer Claude or ChatGPT subscription cannot power another app.
     - Built in, the compliance rules (no promissory language, no age in
       outreach, findings that cite their source) are enforced in one place.
     - Firms can approve one vetted AI provider.
     - Other model vendors may sit behind the same layer later.
   - **Lead data is built in through providers licensed for embedding.**
     People Data Labs, Hunter and Trestle are already on the paid queue.
     Confirm resale terms in each contract before charging for it.
   - **Membership pays for usage.** Each plan includes a monthly allowance of
     paid lookups. It is enforced on the server when a cost is reserved, per
     advisor, on top of the shared daily cap (`PROSPECT_PLANS`, migration
     023).
   - **ZoomInfo is bring-your-own.** ZoomInfo's terms forbid sharing one
     subscription's data across customers, so it is never bundled unless a
     partner/data licence is signed.
     - An advisor with ZoomInfo brings their own: the CSV drop-to-import
       today (decision 7), and the advisor's own ZoomInfo sign-in where their
       plan includes API access.
     - The operator's own ZoomInfo is the operator's alone. The daily-leads
       routine stays an internal tool, not a product feature.
   - **Claude/ChatGPT as a front end is an add-on.** An advisor's own
     assistant reaching ProspectPilot through a connector is later work. It
     never powers ProspectPilot's own features.

## Open items

- **Legacy owner-only batch tables** (`enrichment_batches`, `wealthfeed_jobs`,
  and the older `source/` tools) keep uploaded rows that "Delete this person"
  does not reach. Those tools retire in PR E. Until then, deleting a person
  who is in an old batch needs the batch deleted too.
- **DNC scrub**: deferred at the operator's request. Calling-restriction flags
  and the do-not-call block still apply.
- **Moving the leads (PR B).** In Lead Qualifier, open All leads and choose
  More → Move to ProspectPilot. Upload the file, or each part (5,000 rows a
  file), in ProspectPilot's contact import, then delete the file. Several
  things carry across:
  - identity and contact routes;
  - the ZoomInfo id, accuracy and job start date;
  - both do-not-call flags;
  - Not Interested, which arrives as suppressed.

  Verification badges do not carry, because ProspectPilot re-checks. Grades,
  outcomes and activity stay in Lead Qualifier's Life Data export, the archive
  copy. Carrying outcome history into the worklist is left for later, because
  it would mean writing advisor activities nobody logged here. Nothing
  lead-bearing is committed to either repository.

## Order

| PR | Contents | Status |
|---|---|---|
| A | This plan, `CLAUDE.md`, Delete this person | Done |
| B | Lead Qualifier's "Move to ProspectPilot" export, in the columns the contact import already reads; `test/lead-qualifier-import.test.mjs` pins the contract | Done |
| C | WhitePages/Trestle phone check (`check_phone`) on the provider queue and budget | Done |
| D | Claude web research (`web_research` job) and profile screenshots (read once, never stored) are done. SEC proxy ages and the employer-site reader were already covered (`lab-sources.mjs`, `native-research.mjs`). AI QC is superseded by the five evidence gates | Done |
| F | Selling memberships (decision 8): **per-advisor plan allowances (done)**; **Stripe billing: Checkout, customer portal, signed webhook, lapsed subscriptions pause paid lookups (done)**; **hybrid pricing: plans with yearly prices, a one-time free trial, promotion codes and top-up packs, priced in PRICING.md (done)**; then per-firm compliance settings in place of the Equitable-specific ones, the daily 8 a.m. leads as a per-advisor queue job on built-in data, and Research Lab licensed search counted against the same allowance | In progress |
| E | Email and `.ics` through the advisor's Outlook, and ZoomInfo CSV drop-to-import, are done (decisions 6 and 7). List sharing is implemented with owner/editor/viewer authorization and Postgres regression tests (see `SETUP-sharing.md`). Autopilot remains; then redirect leads.financialplannersofamerica.com and retire Lead Qualifier | In progress |
