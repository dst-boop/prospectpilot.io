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

Public-page collection uses the rules for the declared crawler in robots.txt, merges matching groups, falls back to wildcard groups, and applies specific Allow/Disallow paths, wildcards, end anchors and query restrictions. It keeps access-check failures visible and does not retry through alternate identities. The rule behavior is based on [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309).

## Provider contract checks

**Check email domains** checks mail-routing DNS records without sending an email or using paid data-provider credits. `mx_present` means MX records exist; `address_fallback` means A/AAAA records are available when MX is absent. Neither establishes mailbox existence. `null_mx`, `no_domain` and `no_mail_route` are distinct negative results; `unknown` covers transient/inconclusive lookups. Special-use domains are not queried. Recent definitive failures can avoid a paid verification request for 15 minutes and invalidate an older valid badge while retaining its check history. Domain issue counts describe the last check, not a permanent finding.

Mail routing follows [RFC 7505](https://www.rfc-editor.org/rfc/rfc7505), including its distinction between null MX and A/AAAA fallback. DNS lookups use the [Node resolver](https://nodejs.org/api/dns.html), bounded timeouts and a bounded per-worker cache. Normal hosting costs still apply.

Employer-plan selection chooses the latest filing for an EIN/plan before applying location and distribution filters. This prevents an older record from reappearing after a newer termination, move or sponsor-name change. Missing distribution indicators remain unknown; blank plan numbers are rejected.

Catalog refreshes read the original DOL ZIP archives and log their byte sizes and SHA-256 fingerprints, the normalized output fingerprint, distinct plan count and unknown filing-date count. Only required Schedule H/I fields are retained in memory. Financial and distribution indicators are read from Schedule H, Schedule I and short-form filings. These are plan-level reports, not individual eligibility findings.

The September 8, 2026 full-source validation processed 656,994 source rows into 595,002 plan-year records and 584,266 distinct plans, all with filing dates. Schedule I added reported assets/account-count coverage for 24,907 records, increasing usable plan averages from 534,410 to 559,317. In-service distribution fields were blank in these downloads and stayed unknown. The reproducible archive and output fingerprints are in [SOURCE-VALIDATION-2026-09-08.json](SOURCE-VALIDATION-2026-09-08.json). These counts describe source-file validation, not newly acquired person leads.

The database refresh is one transaction across all batches: malformed or empty input retains the previous catalog. An advisory lock prevents overlapping refreshes, and amendment ordering prevents older filings from replacing newer ones. The dashboard distinguishes unique EIN/plan pairs from filing records and shows the catalog load date separately from filing dates. Source archive fingerprints are retained in job logs, not in individual contact records.

PDL enrichment requires an integer match likelihood from 8 through 10 plus an exact supplied email or LinkedIn match and matching names. Search and enrichment use the same strict field normalization as imports. Omitted malformed provider rows are counted, not hidden. Hunter pending results stay pending; disposable and catch-all flags cannot become valid checks.

These checks use documented response contracts: [PDL enrichment output](https://docs.peopledatalabs.com/docs/output-response-person-enrichment-api), [PDL input parameters](https://docs.peopledatalabs.com/docs/input-parameters-person-enrichment-api), and [Hunter API](https://hunter.io/api-documentation#email-verifier). Reviewed September 8, 2026. Live credentials and contract pricing remain required for real provider validation.
