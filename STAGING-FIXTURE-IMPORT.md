# Bounded fictional import exercise

This staging-only exercise accepts two fixed CSV fixtures, not arbitrary files or real provider exports. It does not validate a provider format, contactability, financial assets or rollover eligibility.

- `fictional-staging.csv`: original two-row fixture.
- `fictional-staging-large.csv`: 1,000 synthetic rows; 319,416 UTF-8 CSV bytes. The representative JSON import request with generic format and source `Fictional staging fixture` is 320,482 bytes. Only example.test addresses/domains are used. Optional state/city/title/location-note values exercise mapping; all context is fictional and unverified.
- Staging transport limit: 500,000 bytes for the whole encoded request, with maxInflight 8 unchanged. Production default remains 5,000,000 bytes and its default message is unchanged.
- The server compares normalized CSV text to either exact fixture. CRLF line endings and outer whitespace/BOM are tolerated; altered cells, extra rows and arbitrary CSV are rejected. Downloads and accepted imports still require the approved owner session. Metadata and manual edits are not universal personal-data detectors: never enter real data.
- Upload the downloaded file unchanged, or paste its complete original text. Do not edit/re-save in a spreadsheet, or upload contact exports or row reports.

An oversized preview/import is rejected before application dispatch and cannot save contacts through that request. The client may already have created a separate empty list before the import; this is not rolled back or deleted automatically. Exact repeated imports replay the prior receipt without adding contacts.

## Release gates

Focused synthetic HTTP/PGlite tests verify the 300+ KB download/preview/import/replay, exact bytes, owner rejection, unchanged row count, malformed fixture rejection and oversized declared/chunked transport refusal. Browser CI must additionally download the actual file and upload it through the `.csv` control, then verify repeat behavior and sign-out.

Before staging rollout, run the exact immutable image with a restricted runtime database role against disposable native PostgreSQL. Record preview/import/repeat timings; target each request under 30 seconds to retain margin beneath the live 60-second request timeout. Local PGlite speed is not evidence of Cloud SQL performance. Stop and reassess fixture size if the gate fails. No database migration, access expansion or production deployment is part of this change.
