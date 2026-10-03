# Cost per lead

ProspectPilot tracks what each advisor spends and how many new leads they get. From those two numbers it works out cost per lead by day, week or month. The data is kept so the figures for a past period stay the same after the fact.

## Where the numbers come from

**Leads.** The `lead_acquisitions` table has one row for each new lead. A row is added when:

- **A new contact** enters an advisor's directory, by any route:

  | Route | Source |
  |---|---|
  | CSV import | `csv_import` |
  | ZoomInfo export | `zoominfo_import` |
  | Daily-leads delivery imported into a list | `daily_leads` |
  | Paid search | `provider_search` |

- **A Research Lab discovery run** finds a person for the first time (`research_lab`).

Database triggers write these rows (migrations 027 and 029), so no code path can skip them. When a contact matches someone already in the directory, the import counts it as a duplicate and no new lead is recorded. People brought into the lab by an import run are not counted, because they already arrived as leads somewhere else.

**Spend.** It comes from three ledgers:

| Ledger | What it holds | How exact |
|---|---|---|
| `prospect_charges` | Paid lookups: search, enrich, verify, phone check, web research, profile screenshot | The server reserves each one at the configured price before the provider is called. Plan allowances count these amounts. Each charge also records its action, its units and its unit price. For a search it also records the records actually returned, which gives a provider-cost estimate. It also records the lead the money was spent on (migration 028). |
| `lab_costs` | Research Lab spend | The lab reserves provider costs. Labor, infrastructure and subscription costs are entered by the advisor. |
| `prospect_external_usage` | Credits used on the advisor's own ZoomInfo subscription | Self-reported. Each daily-leads CSV states the credits each row cost, under **Enrichment Credits**. A delivery imported into two lists counts once. |

ZoomInfo is bring-your-own, so its credits are counted but not priced by default. To include them in cost per lead, set `PROSPECT_ZOOMINFO_CREDIT_MICROS` to what one credit costs on your contract. Example: `350000` means $0.35. Credits are valued at the current setting.

## How it is calculated

Cost per lead for a period is that period's spend divided by the leads first added in that period. Money spent enriching older leads counts in the period it was spent.

| Measure | Spend | Leads |
|---|---|---|
| Contacts cost per lead | Paid lookups plus priced ZoomInfo credits | Directory leads |
| Research Lab cost per lead | Lab spend | Lab discovery leads |
| Overall | All three ledgers | All new leads |

Periods follow the advisor's time zone. The app uses the browser's time zone, and the default is America/New_York. Weeks start on Monday.

A period with fewer than 10 new leads is marked **few leads**. The change from one period to the next is shown only when both periods have at least 10.

## Where to see it

- **Advisors.** Open **Contact tools & costs** in Contacts. It shows a monthly table of new leads, spend, ZoomInfo credits, cost per lead and the change. The table comes from `GET /api/prospect/lead-costs?period=month|week|day&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Area/City`. That endpoint returns the signed-in advisor's figures only. It also includes the breakdown by source and by action, and the provider estimate.
- **Operator (every advisor).** Run `node scripts/lead-costs/report.mjs --period month --from 2026-04-01 --to 2026-09-30 --tz America/New_York > lead-costs.csv`. It uses the same database settings as `migrate.mjs`, for example through the Cloud SQL Auth Proxy. It writes one CSV row per advisor and period, identified by Firebase uid. The CSV holds counts and money only.

## Privacy and deletion

The ledgers hold ids, dates, counts and money. They hold no names, emails or phone numbers. "Delete this person" removes the person. Their lead row stays, with its link to the contact or lab lead set to NULL. Their charges keep the lead they belong to.

Past periods therefore keep their counts and spend after a deletion. A deleted person can't be found again through these tables. The ZoomInfo usage key is built from the lead's random ledger id and the delivery day, never from anything about the person.

## Known limits

- **History before these tables.** When the tables were added, existing contacts, discovery leads, charges and daily-leads credits were copied in. People deleted before then could not be recovered, and they are not counted.
- **Reservations, not invoices.** The ledgers record amounts reserved at the configured prices, not provider invoices. Compare totals with provider invoices to check that prices are set correctly. Searches reserve the full requested page, while the provider estimate counts only the records returned.
- **Undeclared ZoomInfo usage.** ZoomInfo credits used outside daily-leads deliveries are not known to the app.
