# Public discovery recovery

## Scope

Research Lab already has company-first place discovery, supplied/official
company websites, usual team paths, and a free news-index fallback. Those
routes remain coverage-limited; this change does not add a broad web search
service, guarantee leads, or configure a paid provider.

## Fixed failure modes

- One slow public request previously inherited the entire 70-second source
  deadline. It could prevent later company pages and news from being attempted.
  Each public request now has a seven-second limit within the source deadline.
- A series of slow company pages could still consume the source deadline.
  Website discovery and company-page work now share a 45-second limit, leaving
  the remainder for the independent news fallback. The unavailable portion is
  reported as a gap even if a later source finds a person.
- JSON indexes returning temporary HTML error pages with HTTP 200 were cached
  for an hour before parsing failed. JSON is now validated before caching, so
  the next run can recover immediately when the index returns valid data.
- Guessed-page and news failures are kept visible even when another page finds
  a person. Only explicit HTTP 404/410 responses for guessed paths are ignored
  as expected absences.

All existing URL, robots, redirect, identity, evidence and cost boundaries
remain in place. No new dependencies, schema changes or credentials are needed.
Rollback only requires restoring the previous source file.

## Verification

`test/lab-source-recovery.test.mjs` uses synthetic names and mocked public
sources only. It covers a stalled biography followed by a working company page,
a stalled official-site index followed by news, exhaustion of the company-page
budget while news still works, recovery from invalid JSON, deadline validation,
and partial results after a guessed-page or news timeout. Existing source tests cover robots denials, restricted hosts,
redirects, unrelated people, official-site attribution and source provenance.

These checks establish recovery behavior, not live source availability, lead
yield or real-world accuracy. No live prospect data or paid calls are used.
