# WARN package review and correction
Reviewed 2026-09-05.

## Findings
The previous native-research package did not consume the existing GitHub WARN feeds. It used a limited government-page/news search instead. This was an integration omission.
Verified source repository: https://github.com/dst-boop/lead-qualifier
Publisher: .github/workflows/warn-sync.yml and tools/warn_sync.py.
Manifest: https://raw.githubusercontent.com/dst-boop/lead-qualifier/warn-data/warn_feeds.json
The source is a published CSV feed interface; no end-user credentials are needed.

The current NY header names include Business Legal Name, Date Layoff/Closure Starts, Date of WARN Notice, Impacted Site Address, and duplicated Number of Affected Workers columns. The older generic aliases missed several of these.
Maryland's current published CSV has no header. The eight-column order was checked against https://www.dllr.state.md.us/employment/warn.shtml before adding an explicit adapter.
Some jurisdictions publish undated records or date ranges. Unknown or ambiguous dates remain unparsed and visible; they are never assigned a guessed notice date.

## Corrected package
- warn.mjs loads all manifest feeds, validates their URLs, parses state headers, de-duplicates events and caches results for an hour.
- /warn dashboard provides employer/state/date search, pagination, source URLs, distinct notice/effective dates and per-jurisdiction coverage.
- Research this lead uses the direct WARN adapter; it no longer relies on GDELT or HTML crawling for WARN.
- Employer matching ignores legal suffixes and supports explicit DBA names. It never asserts individual job loss or affected workplace.
- Notices with missing dates are still available. Separate events at the same employer remain separate when dates/sites differ.
- End-user credentials and source links are not required.
- Existing Google access controls protect the dashboard and API.
- Existing old WARN research cache is invalidated by a feed version marker.

## Live verification
38,407 unique notices loaded across 30 published jurisdictions; 194 notices in NY.
Search for Alray returned two NY worksite notices with notice date 2026-07-01 and effective date 2026-08-30.
Browser checks passed state filtering, employer search, pagination (100 then 94 NY notices), date display and mobile width.
51 automated tests pass, including four dedicated WARN regression tests.
See WARN-VALIDATION.json for the checked snapshot. Retrieval time is not the state publication date.

## Remaining upstream gaps
The upstream report says 30 of 41 attempted jurisdictions succeeded. Eleven scraper failures and ten states without scrapers leave 21 states/districts absent from the manifest. This is NOT complete nationwide coverage. The package consumes all currently published feeds and exposes missing coverage.
Upstream report: https://github.com/dst-boop/lead-qualifier/blob/warn-data/README.txt
Some supplied fields are missing, and historical state exports can include non-WARN dislocation notices. Use the source description/reason when assessing an event.
No GitHub source changes or production deployment were performed during this local package review.

## Deploy
Upload update-warn-dashboard.sh from ProspectPilot Deployment into Cloud Shell, then run:
    bash ~/update-warn-dashboard.sh
The existing release pipeline applies the packaged app update. No WARN API keys are required.
