---
name: daily-leads
description: Source the advisor's daily rollover leads from ZoomInfo and deliver them by 8:00 a.m. ET as a ProspectPilot CSV in the Lead Qualifier shared drive plus a digest email. Use when the morning routine fires, or when asked to "run today's leads", "deliver daily leads" or "re-run the daily lead list".
---

# Daily rollover leads

Deliver likely-rollover prospects each weekday, **only ones with a mobile
number in hand**, so the advisor keeps 50 quality leads after reviewing
LinkedIn. Up to 80 are selected and enriched; the delivered count is however
many come back with a usable US mobile. The target is a buffer, not a cap. The deterministic work is in `scripts/daily-leads/` (engine, CLI,
`config.json`); this skill is the procedure around the ZoomInfo, Drive and
Gmail calls.

## Hard rules

- **Credits.** Searches are free. `enrich_contacts` spends ZoomInfo bulk
  credits: approved up to `enrich_credit_cap` (80) per day, never more. Count
  every successful enrichment as one credit. Re-enriching someone within a
  year is free, but count it anyway.
- **Nothing is sent to prospects.** No email, message, call or connection
  request, ever. The only email goes to the advisor.
- **Lead data never enters git.** Work in a scratch directory outside the
  repository (the CLI refuses otherwise). Never commit CSVs, JSON responses or
  the ledger.
- **No personal data in logs or chat.** Report counts only. Names can appear in
  the digest email; phones and emails stay in the CSV on the shared drive.
- **Multi-employer only.** The engine caps each employer at 10 per day. Never
  raise that to build a single-employer list (it needs Equitable pre-approval).
- Equitable/AXA staff and people in financial advice are excluded by the
  engine. Do not work around it.

## Inputs the routine gives you

- `DRIVE_FOLDER_ID`: the "Daily leads" folder in the Lead Qualifier shared drive.
- `DIGEST_TO`: the advisor's email address.

## Procedure

Use today's date in New York: `D=$(TZ=America/New_York date +%F)`. Use a work
directory such as `W=$(mktemp -d)/daily-leads-$D`, then `mkdir -p $W`.

1. **Code.** If `scripts/daily-leads/run.mjs` is missing on the default branch,
   `git fetch origin claude/lucid-noether-3ixm5f && git checkout FETCH_HEAD`.
2. **Ledger.** In `DRIVE_FOLDER_ID`, find the newest file titled
   `daily-leads-ledger-*.csv`. Download it (base64) and decode it to
   `$W/ledger-in.csv`. If there is none, skip; the first day has no ledger.
3. **Signals.** Run `node scripts/daily-leads/run.mjs plan --date $D` and
   execute its two `search_scoops` queries with the exact `params`. Save each
   response as `$W/<file>` in the shape `{"meta": <meta>, "response": <raw
   response>}`. Save the raw response unmodified: the engine parses it,
   including double-encoded JSON.
4. **Plan the day.** Run
   `node scripts/daily-leads/run.mjs plan --date $D --extra "$(node scripts/daily-leads/run.mjs layoff-employers --work $W)"`.
5. **Named departures.** Run `node scripts/daily-leads/run.mjs scoop-ids --work $W`.
   For each batch, call `search_contacts` with `personIdList` set to the batch,
   plus the printed `params`. Save as `$W/search-a-<n>.json` with the printed
   `meta`.
6. **Employer searches.** Run every `search_contacts` query in the plan's
   `queries` with its exact `params`. Save each as `$W/<file>` with its `meta`.
   If one errors, retry it once, then continue without it. Do not invent
   parameters.
7. **Select.** Run
   `node scripts/daily-leads/run.mjs select --work $W --date $D --ledger $W/ledger-in.csv`.
   It prints counts and `enrich_batches` (at most 80 ids, 10 per batch). If
   `counts.selected` is under 60, run page 2 of the B queries (`page: 2`),
   save the results as more `search-*` files, and select again.
8. **Enrich**, within the cap. For each batch, call `enrich_contacts` with
   `contacts: [{personId}]` and `requiredFields`: firstName, lastName, email,
   mobilePhone, mobilePhoneDoNotCall, phone, directPhoneDoNotCall,
   externalUrls, jobTitle, companyName, employmentHistory,
   contactAccuracyScore. Save each raw response as `$W/enrich-<n>.json`.
   - This account's API returns `Limit exceeded` for some contacts, so a
     failure there costs nothing.
   - Retry each such contact once, individually, after all batches are done.
     Save the retries as `enrich-r<n>.json`.
   - Stop enriching after three consecutive calls with no success, or once 80
     have succeeded.
   - Only enriched leads with a usable US mobile number are delivered. An
     email is welcome but not required.
   - Someone enriched without a usable mobile, or found abroad, is written to
     the ledger and never enriched again within the ledger window. Someone not
     enriched (ZoomInfo refused, or the cap was reached) is not delivered and
     stays eligible for a later day; nothing was spent on them.
9. **Build.** Run
   `node scripts/daily-leads/run.mjs finalize --work $W --date $D --ledger $W/ledger-in.csv`.
10. **Deliver.**
    - Upload `$W/daily-leads-$D.csv` to `DRIVE_FOLDER_ID` with
      `contentMimeType: text/csv` and `disableConversionToGoogleType: true`,
      titled `daily-leads-$D.csv`.
    - Upload `$W/ledger.csv` as `daily-leads-ledger-$D.csv` in the same folder.
    - Upload `$W/daily-leads-run-$D.json` (counts and credits used, no names)
      as `daily-leads-run-$D.json` in the same folder. Each lead's own row also
      carries its credits into ProspectPilot, so spend survives this session.
    - Re-run `finalize` with `--csv-url <the CSV's viewUrl>` so the digest
      links to the file.
    - Send the digest to `DIGEST_TO`: subject from finalize's output, `htmlBody`
      from `$W/digest.html`, `body` from `$W/digest.txt`. Do not attach the CSV.
11. **Report.** In the session, give counts only: delivered (all with a
    mobile), of those with email, enriched without a mobile, abroad, not
    enriched, credits used, employers, and anything that failed.

## If something fails

- **ZoomInfo searches fail entirely.** Wait 10 minutes and try the plan's
  searches once more; the run starts at 7:10 so there is time.
  - If they still fail, email the advisor that today's list could not be built
    and why. Point them to *Find new prospects* in ProspectPilot, whose public
    sources keep working without ZoomInfo.
  - Do not substitute public-source names into this list. The daily list
    promises a mobile number for everyone, and only ZoomInfo supplies it.
  - Never send an empty or partial list presented as complete.
- **Drive upload fails.** Keep the digest, but say in it that the CSV could not
  be saved and must be re-run. Do not attach lead data to the email instead.
- **Fewer than 50 delivered.** Deliver what you have and say so in the digest's
  first line. There is no cap in either direction, only this honest count.
