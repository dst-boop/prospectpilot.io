# WARN sourcing reliability review

## Candidate and live checks are separate

Baseline: combined pilot candidate `b961e2f`, not an assertion about the running
production revision. The September 5 review and September 8 validation files
are historical snapshots. Their jurisdiction and notice counts are not current
coverage evidence.

Read-only source checks on November 16, 2026:

- The configured GitHub mirror manifest, publication timestamp and README
  returned HTTP 404 through GitHub/public web reads. A direct manifest request
  also returned 404. This establishes unavailability from these checks, not
  whether the repository was deleted, made private or otherwise changed.
- The Texas official metadata endpoint returned HTTP 200. Its `rowsUpdatedAt`
  was `1783448159`, or July 7, 2026 at 18:15:59 UTC. It is stale under the
  application's explicit 48-hour freshness threshold.
- The Texas aggregate count endpoint returned 2,368 raw dataset rows. This is
  not a deduplicated parsed notice count, affected-person count or lead count.
  No named prospect records were collected for this check.
- Production `/health` returned 200 with `ok`. `/api/version` returned 401.
  The running release and authenticated WARN behavior were not established.
  No production changes, authentication changes or paid calls were made.

Sources:

- https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/warn_feeds.json
- https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/updated_at.txt
- https://github.com/dst-boop/lead-qualifier/blob/warn-data/README.txt
- https://data.texas.gov/api/views/8w53-c4f6.json
- https://data.texas.gov/resource/8w53-c4f6.json?$select=count(*)

## Verified code behavior and fixes

The baseline already consumes published WARN feeds, validates manifest URLs,
preserves separate notice/effective dates, flags stale or unknown publication
dates, and keeps employer notices separate from individual layoff claims.
It also has a direct Texas source, with its own publication metadata, used
when Texas is absent from the mirror manifest.

However, manifest failure previously aborted collection before the independent
Texas source could run. One stalled request could also exhaust the 45-second
collection budget, and individual failed feeds were cached for an hour.

The candidate fix:

- Rejects the entire invalid mirror manifest without fetching any of its URLs,
  while retaining the independently configured official Texas source.
- Gives public requests seven-second deadlines under the existing 45-second
  collection budget and starts independent official sources before mirror
  feed batches.
- Marks mirror jurisdiction coverage unknown when the manifest is unavailable.
  `not_published` is used only when a valid manifest proves a jurisdiction is
  absent. Unavailable/unpublished row counts are `null`; a successfully parsed
  empty feed has `status: loaded` and zero parsed rows.
- Retains separate official/mirror publication dates. Fetch time never becomes
  source freshness; missing or implausibly future metadata stays unknown.
- Caches transient coverage failures for at most one minute and marks them
  retryable. The existing bounded research worker retry policy still applies.
- Shows an explicit unavailable-mirror warning in the dashboard.
- Labels a mirror publication as a mirror refresh, never the underlying state's
  observation date. Research results explicitly mark that observation date
  unknown even when the mirror publication is fresh. Official dataset update
  dates remain independently labeled and assessed, including stale Texas data.
- Counts unknown notice and effective dates separately. Raw unparsed date text
  remains visible but explicitly labeled unknown; mirror/retrieval timestamps
  never fill these fields. Manifest gaps are labeled as absent from the mirror,
  not an assertion that the state has no notices.

Zero matching records still means only zero matches in the loaded feeds.
Research remains `partial` when no employer match is found and never asserts
that a named person was unaffected. Positive matches remain company-scoped,
machine-matched evidence, with an explicit worksite/individual limitation.
Malformed rows and missing dates remain visible in existing coverage fields.

## Verification and release boundary

New deterministic tests cover mirror failure/invalidity, cancellation, recovery,
empty-versus-unavailable coverage, source freshness and the dashboard warning.
All fixtures use synthetic employers. Existing WARN parsing, source URL, date
and employer-scope tests remain in place.

No schema migration, new provider, credential or dependency is required.
This change does not repair the upstream mirror, guarantee national coverage,
confirm a person's job loss, or authorize contacting anyone. Deployment needs
its own review and verification of the actual release and runtime sources.
