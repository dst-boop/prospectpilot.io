# Contact providers and background jobs

ProspectPilot uses People Data Labs for professional contact search and enrichment, and Hunter for email verification. Provider accounts and API entitlements are required. The app does not include or purchase a global contact database. The local demo uses synthetic providers; it makes no external provider calls.

## ZoomInfo without API access

The selected source is ZoomInfo through CSV exports from the user's account. Use **Import ZoomInfo CSV**, upload the exported file or paste CSV text, retain or customize the source label, and choose a destination list. Preview first to review row-level issues without saving. Add the actual source observation date when known. See SOURCE-QUALITY.md for source history and quality reports. No API keys or paid API requests are needed to import, search, organize, inspect or export these contacts.

Supported headers include First Name / Contact First Name, Last Name / Contact Last Name, Company Name, Job Title, Email Address / Contact Email, Direct Phone / Direct Phone Number, LinkedIn Contact Profile URL, Contact Country/State/City, Company Website, Primary Industry and Management Level. Include only one alias for each mapped field. Company location is not mapped to contact location. Unmapped columns are ignored. N/A, Not Available, -- and - placeholders become blank in ZoomInfo mode. The current phone field accepts US direct numbers.

Imported status columns do not establish independent verification. Existing verified statuses and suppressions are preserved on deduplication. Missing details can be refreshed using a later authorized export, subject to identity-conflict checks. The app does not automate ZoomInfo searches or export clicks, and does not measure ZoomInfo subscription/export-credit charges. Exact export layout still needs validation against a user-supplied sample.

The following API integrations are optional alternatives; ZoomInfo CSV usage does not require PDL or Hunter credentials. Live API enrichment or independent verification still requires a configured API provider.
## Server and worker configuration

**Check email domains** works without PDL/Hunter credentials or paid data-provider credits. It checks DNS mail-routing information only, in a durable job. Normal application hosting costs still apply. A domain check cannot mark an individual mailbox valid. Missing domains, explicit null MX and absent mail routes remain distinct from transient lookup failures and A/AAAA fallback. Recent definitive failures avoid a paid verification request for 15 minutes; cached positive DNS results retain their original check time.

Configure the same values on **both** the authenticated `prospectpilot` Cloud Run service and the `prospectpilot-research` job. Use Secret Manager references for API keys. Never commit keys, put them in URLs presented to users, or paste them into this documentation.

| Variable | Meaning |
|---|---|
| `PDL_API_KEY` | Licensed People Data Labs API key with search/enrichment entitlement |
| `HUNTER_API_KEY` | Hunter email-verification API key |
| `PDL_SEARCH_RECORD_COST_MICROS` | Your configured maximum USD cost per search record; 1 dollar = 1,000,000 micros |
| `PDL_ENRICH_COST_MICROS` | Configured maximum cost per enrichment request |
| `HUNTER_VERIFY_COST_MICROS` | Configured maximum cost per verification request |
| `PROSPECT_DAILY_BUDGET_MICROS` | Shared maximum new reservations per UTC day; defaults to 0 |

Prices intentionally have no defaults. Set them from your own provider contract. A value of zero means an explicitly configured zero-cost allowance, not missing configuration. This is local budget accounting and does not replace provider credit balance checks or invoices. Match pricing and budget on every web and worker instance.

Use the existing release process after configuration. Migrations 008 and 009 must be applied before the new app and worker run. `setup-research-worker.sh` preserves the provider settings already configured on an existing worker; it does not copy secrets out of the service or provision subscriptions. Verify service and worker settings separately. The existing 5-minute recovery scheduler launches the worker; the app also requests a worker execution when a job is submitted.

## Workflow

1. Set professional filters and choose **Find new contacts**. Review the maximum record count, destination list and cost ceiling. Results are inserted into your directory with their provider provenance; duplicate and conflicting identities are counted.
2. Select contacts and choose **Enrich selected**. An existing email or LinkedIn profile is required for precise identity matching. Missing fields can be added; existing identifiers and suppressions are preserved. Phone results remain provider-reported and unverified.
3. Select contacts and choose **Verify emails**. Hunter's valid, invalid, catch-all and unknown outcomes remain distinct. A verification badge expires after 30 days and is refreshed before filtering or exporting. A current valid check for the same address is reused without sending another provider request. Verification is not a guarantee of delivery or authorization to contact.
4. Review progress in the jobs panel, then export or organize the contacts into lists. The page can close while the durable worker processes tasks.

## Costs, recovery and limits

- Each job has an explicit maximum reservation based on its quoted size. Enrichment/verification batches are limited to 500 selected contacts; provider searches to 100 records per page.
- A database transaction reserves the quoted maximum **before** each provider request. The daily limit covers the whole deployment. The user interface shows the current user's reservations and the shared cap.
- Reservations are conservative, not actual charges: a ten-record search reserves ten records even when fewer are returned. No automatic refunds are inferred from missing data or network errors. Reconcile actual invoices separately.
- Pending Hunter verification responses can be polled up to five times with one reservation. Hunter documents these polls as one charged verification. Other uncertain requests are not automatically replayed.
- A lost worker lease or provider failure produces **needs attention** with cost retained. Check provider billing before deliberately submitting a new job. Idempotency keys prevent the same submission from making duplicate jobs, and active contact/action tasks are deduplicated.
- PDL requests are paced at least 6.1 seconds apart across workers. Hunter requests are paced at least 250 ms apart. Provider HTTP 429 remains a visible failure; it does not trigger an uncontrolled retry loop.
- Jobs and contact data are owner-scoped. Contacts changed or suppressed while a request is in flight do not receive stale results. Provider-declared suppression is preserved.

## Validation status

Adapters and workflows are covered by local contract/database tests using mocked provider responses. A live end-to-end test with licensed credentials and production worker execution is still required. Local test success is not evidence of provider entitlement, real contact coverage, live accuracy, or completed deployment.

## Official API references

- [PDL search](https://docs.peopledatalabs.com/docs/reference-person-search-api)
- [PDL enrichment parameters](https://docs.peopledatalabs.com/docs/input-parameters-person-enrichment-api)
- [Hunter verification](https://hunter.io/api-documentation#email-verifier)
