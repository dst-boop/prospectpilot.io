# Native lead research
## User flow
Research → choose a saved lead → Research this lead. The app checks all 12 categories in sequence without asking for URLs, provider credentials, or a LinkedIn connection. Each source result is saved as it completes. Keep the page open; another click reuses completed checks. Existing manual tools are optional and collapsed.

## Actual coverage
This is a public-source research pass, not access to every database or restricted profile:
- Company websites: saved source information, exact-name Wikidata website discovery, public news index candidates, public-page matching.
- Registrations: public government pages discovered through existing evidence and indexed news. No nationwide corporate registry API.
- Credentials: NPI healthcare registration API and discovered public credential pages. NPI registration is not license verification.
- Professional profiles: accessible public biographies; restricted social profiles are skipped.
- Announcements and local news: GDELT-indexed recent public pages plus existing company source pages.
- Associations: discovered public membership/association pages.
- Maps/listings: discovered public address pages; no new complete map database lookup.
- SEC: discovered SEC-hosted pages, not an exhaustive EDGAR query.
- Publications/expertise: Crossref metadata and discovered speaker/author pages.
- WARN: direct published feeds from dst-boop/lead-qualifier/warn-data. All 30 currently published jurisdictions load, including NY. Dedicated /warn dashboard and one-button employer matching. Missing jurisdictions are reported; individual job loss is never inferred.
- MWBE: live NYC certified-business API and discovered certification pages; not every jurisdiction. No demographic inference.

All 12 categories are attempted; availability and match coverage vary. These adapters do not guarantee that every lead has a result. Extending dedicated adapters will improve registry, maps and SEC coverage. WARN now uses the existing feed integration; missing jurisdictions require upstream scraper repairs. See WARN-REVIEW.md.

## Evidence and execution
Exact normalized name/company and location context must match; unrelated snippets never become evidence. Records are machine_matched, not verified or user-reviewed. Short excerpts and source URLs are saved without changing priority, wealth, or calling eligibility.
Per-lead source results cache for one hour (partial results one minute), keyed by lead identity details. Saves check ownership again and reject concurrent updates. Each source uses a 28-second network deadline, bounded pages and response sizes. A maximum of three active lookups per instance and duplicate suppression limit load. Public page HTTP connections resolve and pin public IPv4 addresses, validate redirects and respect robots exclusions conservatively. IPv6-only sources are unavailable.
Execution is driven by the open browser, not a durable background queue. Saved checks survive refresh; unfinished checks resume when the user clicks again.

## Validation
47 automated tests passed, including unrelated-identity rejection, source failures, all-category orchestration, private address rejection and existing app tests. An isolated full browser run verified 12 persisted results, cache reuse, no duplicate records and mobile layout. Live Crossref and NYC MWBE endpoints returned JSON. GDELT timed out from the test environment; its live coverage is not verified here.
No production deployment was performed in this change.

## Deploy
Upload update-native-research.sh from the shared ProspectPilot Deployment folder into Cloud Shell. Run:
    bash ~/update-native-research.sh
The helper uses the existing release pipeline. No end-user or research API credentials are needed. LinkedIn remains an independent optional feature.

## Sources
https://www.crossref.org/documentation/retrieve-metadata/rest-api/
https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
https://dol.ny.gov/warn-dashboard
