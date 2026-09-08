# Source quality in ProspectPilot

The contact workspace records professional contact data and its origin. Import acceptance, identity matching, source recency and email deliverability are separate measurements. None is a substitute for factual accuracy or permission to contact someone.

## Import and review

1. Export a permitted contact CSV from your provider. ZoomInfo does not require API access for this workflow.
2. Choose **Import ZoomInfo CSV**. Upload a file or select **Paste CSV text**. The limit is 5,000 records and 4 MB.
3. Identify the source. Add the actual source observation date and public source page when known; leave unknown dates blank. The import timestamp is recorded separately.
4. Use **Preview import**. Review new rows, matches, identity conflicts, rejected rows and ignored columns before saving. Preview does not write contacts, list memberships or import history.
5. Import, then download the row report. Line numbers refer to physical CSV source lines, including blank lines and multiline quoted fields. Import repeats the identity checks against current database state.

Status columns such as `Verified` are ignored. CSV text never creates a valid email-verification result. Optional placeholders become blank. US country and state spellings are normalized; a state alone does not establish a country. Invalid identifiers and oversized fields are rejected instead of silently truncated.

Shared mailboxes are not individual identity keys. A name/company match alone cannot attach a new email, phone or LinkedIn identifier. Conflicting identifiers stay separate for review. Matching records retain existing values, current verification and suppression; missing fields can be added when identity checks permit it.

## Interpreting the reports

- **Source import results:** counts of new, matched, conflicting and rejected rows. Matches are repeat records, not new leads. Exact repeat uploads do not inflate counts.
- **Current records by original source:** distinct contacts, email availability, valid and invalid checks, and unknown source dates. Subsequent contributions are listed in each contact's source history.
- **Source observation date:** the date supplied for the underlying source. This is user-reported metadata, not an independently validated freshness claim. A new import does not refresh an old field's observation date.
- **Source history:** the latest 20 import/provider events, with row references and fields that disagree. Existing values are retained when sources disagree. Saved import reports retain the original row outcomes.
- **Field sources:** the origin of initially supplied or subsequently filled fields is stored separately. Provider retrieval time is not treated as the provider's underlying observation date.
- **Valid email check:** current verifier output for that exact address, no more than 30 days old. Catch-all and unknown remain distinct. Repeating a current valid check skips the request and its reservation.

Example/test domains and shared mailboxes are review flags. Source dates older than 180 days are flagged for review. These thresholds are workflow rules, not measured probabilities of correctness.

## Selecting sources

| Source | Appropriate use | Limitation |
|---|---|---|
| Licensed contact exports | Professional contact candidates with retained provenance | Export inclusion does not establish freshness or ownership |
| Company staff pages | Published role and business contact information with an exact page/date | Employer address is not personal residence |
| PDL search/enrichment | Professional record matching through configured API access | Match likelihood is not the accuracy probability of every field |
| Hunter verification | An address-level deliverability check | Does not establish identity, consent or phone ownership |
| SEC filings / DOL Form 5500 | The stated filing, company and employer-plan facts | Does not establish a person's account balance or transfer eligibility |

The application does not infer personal wealth, income or retirement balances from employment history. The separate Research Lab requires evidence for its qualification gates.

## Provider contract checks

PDL enrichment requires an integer match likelihood from 8 through 10 plus an exact supplied email or LinkedIn match and matching names. Search and enrichment use the same strict field normalization as imports. Omitted malformed provider rows are counted, not hidden. Hunter pending results stay pending; disposable and catch-all flags cannot become valid checks.

These checks use documented response contracts: [PDL enrichment output](https://docs.peopledatalabs.com/docs/output-response-person-enrichment-api), [PDL input parameters](https://docs.peopledatalabs.com/docs/input-parameters-person-enrichment-api), and [Hunter API](https://hunter.io/api-documentation#email-verifier). Reviewed September 8, 2026. Live credentials and contract pricing remain required for real provider validation.
