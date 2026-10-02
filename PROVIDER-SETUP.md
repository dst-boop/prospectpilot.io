# Contact providers and background jobs

ProspectPilot uses People Data Labs for professional contact search and enrichment, and Hunter for email verification. Provider accounts and API entitlements are required. The app does not include or purchase a global contact database. The local demo uses synthetic providers; it makes no external provider calls.

## ZoomInfo without API access

The selected source is ZoomInfo through CSV exports from the user's account. Use **Import ZoomInfo CSV**, upload the exported file or paste CSV text, retain or customize the source label, and choose a destination list. Preview first to review row-level issues without saving. Add the actual source observation date when known. See SOURCE-QUALITY.md for source history and quality reports. No API keys or paid API requests are needed to import, search, organize, inspect or export these contacts.

Supported headers include First Name / Contact First Name, Last Name / Contact Last Name, Company Name, Job Title, Email Address / Contact Email, Direct Phone / Direct Phone Number, Mobile Phone, LinkedIn Contact Profile URL, Contact Country/State/City, Person City/State, Company Website, Primary Industry and Management Level. Include only one alias for each mapped field. Company location is not mapped to contact location. Unmapped columns are ignored. N/A, Not Available, -- and - placeholders become blank in ZoomInfo mode. Direct and mobile numbers are retained separately. When the direct field is blank, the mobile number becomes the primary phone; both remain unverified. Supported +1 numbers are normalized without inferring ownership. Extensions still require source review rather than silent removal.

Imported status columns do not establish independent verification. Existing verified statuses and suppressions are preserved on deduplication. Missing details can be refreshed using a later authorized export, subject to identity-conflict checks. The app does not automate ZoomInfo searches or export clicks, and does not measure ZoomInfo subscription/export-credit charges. Exact export layout still needs validation against a user-supplied sample.

The following API integrations are optional alternatives; ZoomInfo CSV usage does not require PDL or Hunter credentials. Live API enrichment or independent verification still requires a configured API provider.
## Server and worker configuration

The user withdrew the lead-cost ceiling. Prioritize licensed data quality, usable coverage and workflow reliability. Existing configured spending limits and authorization requirements remain; this change does not authorize new purchases or paid provider usage. The historical cost assessment in WIZA-BENCHMARK.md is optional and must not block current work.

**Check email domains** works without PDL/Hunter credentials or paid data-provider credits. It checks DNS mail-routing information only, in a durable job. Normal application hosting costs still apply. A domain check cannot mark an individual mailbox valid. Missing domains, explicit null MX and absent mail routes remain distinct from transient lookup failures and A/AAAA fallback. Recent definitive failures avoid a paid verification request for 15 minutes; cached positive DNS results retain their original check time.

Configure the same values on **both** the authenticated `prospectpilot` Cloud Run service and the `prospectpilot-research` job. Use Secret Manager references for API keys. Never commit keys, put them in URLs presented to users, or paste them into this documentation.

| Variable | Meaning |
|---|---|
| `PDL_API_KEY` | Licensed People Data Labs API key with search/enrichment entitlement |
| `HUNTER_API_KEY` | Hunter email-verification API key |
| `PDL_SEARCH_RECORD_COST_MICROS` | Your configured maximum USD cost per search record; 1 dollar = 1,000,000 micros |
| `PDL_ENRICH_COST_MICROS` | Configured maximum cost per enrichment request |
| `HUNTER_VERIFY_COST_MICROS` | Configured maximum cost per verification request |
| `TRESTLE_API_KEY` | Trestle (WhitePages) Phone Intel key, sent as the `x-api-key` header |
| `TRESTLE_PHONE_COST_MICROS` | Configured maximum cost per phone check |
| `ANTHROPIC_API_KEY` | Claude API key for **Research on the web** (Messages API with the server-side web search tool) |
| `WEB_RESEARCH_COST_MICROS` | Configured maximum cost per contact researched (tokens plus up to 5 searches) |
| `PROFILE_IMAGE_COST_MICROS` | Configured maximum cost per profile screenshot read (same `ANTHROPIC_API_KEY`) |
| `PROSPECT_DAILY_BUDGET_MICROS` | Shared maximum new reservations per UTC day; defaults to 0 |
| `PROSPECT_PLANS` | *(optional)* Membership plans as JSON: plan id → name and the paid-lookup spend each advisor on it may reserve per calendar month (UTC), e.g. `{"starter":{"name":"Starter","monthly_allowance_micros":25000000},"pro":{"name":"Pro","monthly_allowance_micros":75000000}}`. Unset means no per-advisor allowance. Set it with the `^\|^` delimiter in gcloud because the value contains commas |
| `PROSPECT_DEFAULT_PLAN` | *(optional)* The plan for advisors with no membership row; defaults to the first plan listed |

Prices intentionally have no defaults. Set them from your own provider contract. A value of zero means an explicitly configured zero-cost allowance, not missing configuration. This is local budget accounting and does not replace provider credit balance checks or invoices. Match pricing and budget on every web and worker instance.

Use the existing release process after configuration. Migrations 008 and 009 must be applied before the new app and worker run. `setup-research-worker.sh` preserves the provider settings already configured on an existing worker; it does not copy secrets out of the service or provision subscriptions. Verify service and worker settings separately. The existing 5-minute recovery scheduler launches the worker; the app also requests a worker execution when a job is submitted.

### Membership plans

With `PROSPECT_PLANS` set, every paid reservation is checked against the advisor's plan before any provider request:
- It counts the advisor's month-to-date reservations.
- It runs on the server and is serialised per advisor.
- A job that would go past the allowance is skipped with no request and no charge. The advisor sees what is left in the tools panel and in the cost quote.
- The shared daily cap still applies to everyone.

Until billing is connected, assign plans in the database (the advisor's Firebase uid):

```sql
INSERT INTO prospect_memberships(user_id,plan) VALUES('<uid>','pro')
  ON CONFLICT(user_id) DO UPDATE SET plan=EXCLUDED.plan, monthly_allowance_micros=NULL, updated_at=now();
-- One advisor's own allowance, without a new plan:
UPDATE prospect_memberships SET monthly_allowance_micros=50000000, updated_at=now() WHERE user_id='<uid>';
```

A plan id that is no longer in `PROSPECT_PLANS` allows nothing, so removing a plan never unlocks unlimited spend.

### Stripe billing

Advisors buy a plan through Stripe Checkout and manage it in Stripe's customer portal. Card details only ever go to Stripe. A signed webhook is the only thing that sets an advisor's plan and subscription status. While a subscription is anything other than active or trialing (past due, unpaid, cancelled, paused), paid lookups are paused for that advisor; nothing else in their workspace is locked. Plans assigned by hand with the SQL above have no status and are unaffected.

1. **Prices.** In Stripe, create one product per plan with a monthly recurring price. Add each price id to its plan in `PROSPECT_PLANS`, for example `"pro":{"name":"Pro","monthly_allowance_micros":75000000,"stripe_price_id":"price_..."}`. A plan without `stripe_price_id` can't be bought; use that for internal plans.
2. **Default plan.** Set `PROSPECT_DEFAULT_PLAN` to a plan with a zero allowance (for example `"none":{"name":"No plan","monthly_allowance_micros":0}`). Otherwise advisors who haven't paid get the default plan's lookups.
3. **Customer portal.** In the Stripe Dashboard, turn on the customer portal. Allow card updates, invoices, cancellation, and switching between your plan products.
4. **Webhook.** Add an endpoint at `https://prospectpilot.io/api/stripe/webhook` for these events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `customer.subscription.paused`, `customer.subscription.resumed`
5. **Keys.** Set these on the `prospectpilot` service only; the worker doesn't need them. Use Secret Manager references.
   - `STRIPE_SECRET_KEY`: a restricted key is enough, with write access to Checkout Sessions, Customers and Customer portal, and read access to Subscriptions.
   - `STRIPE_WEBHOOK_SECRET`: the endpoint's signing secret (`whsec_...`).
   - Billing stays off until both are set. One without the other stops the server at start-up.
6. **Yearly, trial, discounts and top-ups** (see [PRICING.md](PRICING.md)):
   - **Yearly billing.** Give a plan a second, yearly price with `stripe_annual_price_id`.
   - **Free trial.** `trial_days` (1–30) gives a free trial before an advisor's first subscription, with `trial_allowance_micros` as the trial's lookup allowance. Stripe still takes a card.
   - **Founding and other discounts.** Create these as Stripe promotion codes. Checkout accepts them, so no configuration is needed here.
   - **Top-up packs.** `PROSPECT_TOPUPS` maps a pack id to `name`, `stripe_price_id` (a one-time price), `allowance_micros` and `price_cents`. Packs are credited only by the webhook, once Stripe reports the payment paid. Add `checkout.session.async_payment_succeeded` to the webhook events if you accept bank debits.
   - **Leads display.** `PROSPECT_LEAD_COST_MICROS` (the assumed cost of one fully worked lead) shows allowances as "about N leads". It is display only.
   - **Generate the settings.** Put your Stripe price ids in a file shaped like `{"starter":{"monthly":"price_...","annual":"price_..."},"topup:small":"price_..."}`. Then `node scripts/pricing/pricing.mjs env that-file.json` prints `PROSPECT_PLANS`, `PROSPECT_TOPUPS`, `PROSPECT_DEFAULT_PLAN` and `PROSPECT_LEAD_COST_MICROS`, already validated.
7. **Test first.** Use test-mode keys and prices with Stripe's test cards. To send events to a local server, use `stripe listen --forward-to localhost:8080/api/stripe/webhook`.

| Variable | Meaning |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret or restricted key (`sk_`/`rk_`, test or live) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint above |
| `PROSPECT_TOPUPS` | *(optional)* Top-up packs as JSON (see step 6) |
| `PROSPECT_LEAD_COST_MICROS` | *(optional)* Assumed cost of one fully worked lead, for the "about N leads" display only |

Each event is applied once (`billing_events`). The subscription is re-read from Stripe on every event, so deliveries that arrive out of order still leave the current state. A failed apply is rolled back and Stripe's retry applies it.

## Workflow

1. Set professional filters and choose **Find new contacts**. Review the maximum record count, destination list and cost ceiling. Results are inserted into your directory with their provider provenance; duplicate and conflicting identities are counted.
2. Select contacts and choose **Enrich selected**. An existing email or LinkedIn profile is required for precise identity matching. Missing fields can be added; existing identifiers and suppressions are preserved. Phone results remain provider-reported and unverified.
3. Select contacts and choose **Verify emails**. Hunter's valid, invalid, catch-all and unknown outcomes remain distinct. A verification badge expires after 30 days and is refreshed before filtering or exporting. A current valid check for the same address is reused without sending another provider request. Verification is not a guarantee of delivery or authorization to contact.
4. Select contacts and choose **Check phone owners** (Trestle Phone Intel, one lookup per number). Each contact's primary phone gets a recorded answer: whether it is a working line, its type (mobile numbers carry stricter TCPA rules), carrier and prepaid flag, and whether the number is listed under this contact's name. A number listed under someone else is marked **wrong person**; the other person's name is compared and discarded, never stored. A miss is recorded too. A recorded check is not bought again unless you tick **Re-check numbers already checked**, which prices the repeat. Editing the phone or name retires the old answer. Numbers that cannot be US lines are refused before any request (Trestle rejects them unbilled anyway). Trestle may require requests from an allowlisted IP: if the key is IP-restricted, route the service and worker egress through Cloud NAT with a static address, as Lead Qualifier does.
5. Select contacts and choose **Research on the web**. Claude searches the public web for each name at their employer and returns only findings it can quote, each with the page it came from; a finding citing a page the search did not return is discarded. Donation records (FEC, OpenSecrets, FollowTheMoney) and LinkedIn are blocked, and nothing about wealth, income or age is inferred. Findings are saved **unreviewed** in the contact's details and change no field — read the source, then use Correct contact details if it holds. A search that finds nothing is recorded too; neither is repeated unless you choose to research again. Changing the contact's name, employer or location retires the old findings.
6. In a contact's details, use **Read a profile screenshot** for a public profile you are viewing (company bio, conference page). The first click states the reserved cost; the second sends the image to Claude, which reads the professional facts only if the page shows this contact. The image is not stored anywhere — only the quoted lines return, saved unreviewed beside the contact. One manual screenshot at a time: nothing fetches or crawls profile pages.
7. Review progress in the jobs panel, then export or organize the contacts into lists. The page can close while the durable worker processes tasks.

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
