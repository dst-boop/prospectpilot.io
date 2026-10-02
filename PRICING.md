# Pricing

ProspectPilot is sold as a monthly subscription that includes a paid-lookup allowance, with optional top-up packs once the allowance runs out (MERGE-PLAN decision 8). The plans, prices and assumptions are data in [`scripts/pricing/recommended.json`](scripts/pricing/recommended.json). `test/pricing.test.mjs` fails if any option falls below its minimum margin under those assumptions.

## Plans

| Plan | Monthly | Yearly (2 months free) | Paid lookups included each month | About this many fully worked leads* | Free trial |
|---|---|---|---|---|---|
| Starter | $149 | $1,490 | $40 | 80 | 14 days, $5 trial allowance |
| Professional | $349 | $3,490 | $100 | 200 | 14 days, $5 trial allowance |
| Practice | $799 | $7,990 | $250 | 500 (about 24 a working day) | none |
| Producer | $1,499 | $14,990 | $525 | 1,050 (about 50 a working day) | none |
| Firm | Per seat, by contract | | Pooled | | |

\* At the assumed $0.50 per fully worked lead (enriched, email and phone checked, researched). At $0.25 it would be twice as many; at $0.75, two-thirds as many.

| Top-up pack | Price | Adds to this month's allowance | About |
|---|---|---|---|
| Small | $50 | $35 | 70 leads |
| Large | $150 | $110 | 220 leads |

- **Top-ups.** Available only on an active plan. A pack adds to the month it is bought in and expires when the allowance resets, which the panel says before purchase.
- **Default plan.** Advisors who haven't paid are on **No plan**, with no paid lookups.
- **Your own account.** Assign the **Internal** plan (a $300 monthly lookup allowance, not sold) to your own account by hand.
- **Founding members.** 30% off for life for the first 25 advisors, as a Stripe promotion code. Checkout accepts promotion codes, so no code change is needed.
- **Refunds.** Refunding a top-up in Stripe doesn't remove its allowance automatically. If the advisor hasn't used it, delete its `billing_topups` row.
- **Firm pricing.** Floor at about $279 per seat (Professional less 20%), which is a 56% margin at the same assumptions. Price it per contract.

## Margins at full allowance use

Margin is fixed by the price and the allowance in dollars, because the allowance caps lookup spending. The cost per lead changes only how many leads the advisor gets. Allowances are reserved maximums at the configured provider prices, so real provider cost is at most this, and real margins are at least what is shown. Regenerate with `node scripts/pricing/pricing.mjs margins`.

| Option | Price | Per month | Profit/month at full use | Margin | Leads at assumed cost |
|---|---|---|---|---|---|
| Starter monthly | $149.00 | $149.00 | $89.38 | 60% | 80 |
| Starter annual | $1490.00 | $124.17 | $65.54 | 52.8% | 80 |
| Starter founding | $104.30 | $104.30 | $45.98 | 44.1% | 80 |
| Professional monthly | $349.00 | $349.00 | $223.58 | 64.1% | 200 |
| Professional annual | $3490.00 | $290.83 | $167.37 | 57.5% | 200 |
| Professional founding | $244.30 | $244.30 | $121.92 | 49.9% | 200 |
| Practice monthly | $799.00 | $799.00 | $510.53 | 63.9% | 500 |
| Practice annual | $7990.00 | $665.83 | $381.50 | 57.3% | 500 |
| Practice founding | $559.30 | $559.30 | $277.78 | 49.7% | 500 |
| Producer monthly | $1499.00 | $1499.00 | $915.23 | 61.1% | 1050 |
| Producer annual | $14990.00 | $1249.17 | $672.92 | 53.9% | 1050 |
| Producer founding | $1049.30 | $1049.30 | $478.57 | 45.6% | 1050 |
| Small top-up | $50.00 | $50.00 | $13.25 | 26.5% | 70 |
| Large top-up | $150.00 | $150.00 | $35.35 | 23.6% | 220 |

- **Trial cost.** About $12 per trial ($5 allowance plus half a month of overhead). Stripe takes a card up front.
  - One Starter month repays about 7 trials.
  - One Professional month repays about 18 trials.
- **Founding discount.** Plans stay at 44–50% margin even at 30% off.

## Assumptions

These are planning assumptions, not measured costs:

| Assumption | Value | Where it comes from |
|---|---|---|
| Cost of one fully worked lead | $0.50 (range $0.25–$0.75) | Estimate. About half of enrichments return contact details, so each kept lead pays for about two attempts. **Not measured yet.** |
| Stripe fee | 2.9% + $0.30 per charge | Stripe's standard US card rate. Check your account's actual rate |
| Overhead per advisor per month | $15 | Estimate for hosting, Claude drafting and support |
| Minimum margin | 40% on plans, 20% on top-ups | A policy choice, enforced by the test |

## Before you go live

1. **Measure the real cost.** Enter your real provider prices (`*_COST_MICROS`). Run your own account for two weeks. Read the cost per qualified person from the source report.
2. **Update the lead count.** Put the measured cost per worked lead into `assumptions.lead_cost_micros`, and re-run the margins script. Margins don't change; the "about N leads" figures shown to advisors do.
3. **Then adjust.**
   - If the measured cost is well above $0.50, raise the allowances, or the Practice and Producer prices, so that "about 50 leads a day" stays true. The test keeps every change above the minimum margin.
   - If it is well below, consider lower prices, or more leads at the same price.
4. **Set up Stripe.** Create the products and prices, then generate the settings: `node scripts/pricing/pricing.mjs env stripe-prices.json`. See PROVIDER-SETUP.md.
