# ProspectPilot research protocol

The competition outcome is measured unique qualified people per day and recorded cost per qualified person. A record is qualified only when all five current criteria are supported by reviewed evidence. Source discovery and qualification are separate stages.

## Acquisition and review

1. Begin with authorized participant lists, consented inbound inquiries, and permitted professional-provider exports. Record each source and import its actual charges. Imports are counted separately from automatic discovery.
2. Run employer-level research through the existing DOL plan catalog, WARN feeds and SEC filings. Company biographies and permitted search may find professional contacts. Employer events and plan averages never prove personal holdings, wealth, or individual layoffs.
3. Review individual age and US residence; verify ownership of at least one contact route. Retain suppression. A review does not authorize outreach.
4. Obtain participant disclosure or an authorized document supporting retirement assets, transfer route, and net worth excluding the home and net of liabilities. Record the participant's research consent and the source/date. Do not upload account numbers or complete financial documents to this public repository.
5. Review all five criteria. Unknown is a legitimate result; do not fill gaps with title, tenure, property, political contributions or provider wealth estimates. A disclosed lower bound below $250,000 remains insufficient rather than being treated as proof of low wealth.

## Experimental design

Use comparable employer/state cohorts and the same review effort per source. For clean comparisons, run one source per experiment and allocate subscription, infrastructure and labor costs explicitly. Include sources that yielded zero qualified people; missing costs are unknown, not free. Record when provider billing replaces a reserved estimate and avoid recording the same charge twice.

The dashboard defaults to 14 UTC calendar days. Compare unique acquisitions, qualified cohort yield, duplicate volume, source failures, time to review, and recorded cost. Source economics use reserved provider costs only; the headline cost uses the full recorded ledger. Neither is a lifetime customer acquisition cost or a forecast.

Catalog totals are maintained transactionally during catalog imports. Migration 012 backfills the existing catalog once; run migrations before deploying this version. Dashboard requests read that summary instead of recounting all filings. Failed imports roll back both records and totals. Dashboard sections refresh independently, and a failed summary does not hide successful lead or run results or stop polling active runs.

Before declaring a winning source, conduct a separate blinded review of a randomly chosen sample from both qualified and nonqualified groups using authorized ground truth. Report sample size, disagreement rate, unresolved records, review latency and confidence intervals. Functional software tests do not measure real-world lead accuracy. No calibrated 'moderately high confidence' probability is claimed until that study exists.

## Current operational limits

- Daily acquisition requires the existing Cloud Run worker and recovery scheduler; saving a schedule alone does not provision them.
- Licensed search needs configured credentials, a declared query price, and a budget. Provider CSV imports use the user's existing subscriptions; no subscriptions are purchased by this build.
- Form 5500 data are employer-plan data, not a participant account register. Coverage and source freshness appear in the app.
- Source cohort outcomes change as records are reviewed, expire, are corrected, or are deleted. Age-boundary and financial disclosures require refresh; withdrawn or suppressed contacts are not verified output.
- The local demonstration is synthetic, has no provider calls and no durable storage. Production authentication and storage are unchanged.
- The legacy lead-management screens remain available, but their heuristic ranks are not this Research Lab's five-gate qualification result.

## Primary references checked September 8, 2026

- [IRS: rollovers of retirement plan and IRA distributions](https://www.irs.gov/retirement-plans/plan-participant-employee/rollovers-of-retirement-plan-and-ira-distributions) explains eligible distributions and IRA transfer distinctions. A research qualification does not recommend executing a transfer.
- [IRS: IRA FAQs](https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras) supplies the IRA transfer context. This release supports matching traditional and Roth IRA transfer types, not conversions or special inherited/SIMPLE IRA cases.
- [DOL: Form 5500 datasets guide](https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/public-disclosure/foia/form-5500-datasets-guide) describes the employer-plan data used for context.
